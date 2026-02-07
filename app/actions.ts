// app/actions.ts
'use server';

import { createClient } from '@supabase/supabase-js';

// Standard Client (Anon Key) is sufficient since RLS is disabled
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const SLIPOK_BRANCH_ID = process.env.SLIPOK_BRANCH_ID!;
const SLIPOK_API_KEY = process.env.SLIPOK_API_KEY!;

// -----------------------------------------------------------------------------
// PAYMENT VERIFICATION LOGIC
// -----------------------------------------------------------------------------
export async function verifyAndProcessPayment(formData: FormData) {
  const file = formData.get('slip') as File;
  const userId = formData.get('userId') as string;
  const childId = formData.get('childId') as string;
  const packageId = formData.get('packageId') as string;
  const type = formData.get('type') as 'new_package' | 'extra_session';

  if (!file || !userId || !packageId) {
    return { success: false, message: 'Missing required data.' };
  }
  if (file.size === 0) {
    return { success: false, message: 'File is empty.' };
  }

  try {
    // 1. Fetch EXPECTED Price
    let expectedPrice = 0;
    if (type === 'new_package') {
      const { data: template } = await supabase
        .from('package_templates')
        .select('price')
        .eq('id', packageId)
        .single();
      if (!template)
        return { success: false, message: 'Invalid Package Template' };
      expectedPrice = template.price;
    } else {
      const { data: pkg } = await supabase
        .from('user_packages')
        .select('package_templates(extra_session_price)')
        .eq('id', packageId)
        .single();
      if (!pkg) return { success: false, message: 'Invalid User Package' };
      // @ts-ignore
      expectedPrice = pkg.package_templates.extra_session_price;
    }

    // 2. Call SlipOK API
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const slipFormData = new FormData();
    slipFormData.append('files', new Blob([buffer]), file.name);
    slipFormData.append('log', 'true');
    slipFormData.append('amount', expectedPrice.toString());

    const response = await fetch(
      `https://api.slipok.com/api/line/apikey/${SLIPOK_BRANCH_ID}`,
      {
        method: 'POST',
        headers: { 'x-authorization': SLIPOK_API_KEY },
        body: slipFormData,
      },
    );

    const result = await response.json();

    // 3. Log via RPC
    await supabase.rpc('log_payment_attempt', {
      p_user_id: userId,
      p_payment_type: type,
      p_target_id: packageId,
      p_expected_amount: expectedPrice,
      p_success: result.success,
      p_api_response: result,
      p_error_code: result.code || null,
    });

    if (!result.success) {
      if (result.code === 1012)
        return { success: false, message: 'Slip already used!' };
      if (result.code === 1014)
        return { success: false, message: 'Transfer to wrong account!' };
      return {
        success: false,
        message: result.message || 'Slip verification failed.',
      };
    }

    // 4. Execute Transaction via RPC
    let rpcResponse;
    if (type === 'new_package') {
      rpcResponse = await supabase.rpc('buy_new_package', {
        p_user_id: userId,
        p_child_id: childId === 'null' ? null : childId,
        p_template_id: parseInt(packageId),
      });
    } else {
      rpcResponse = await supabase.rpc('buy_extra_session', {
        p_user_id: userId,
        p_package_id: packageId,
      });
    }

    if (rpcResponse.error) {
      return { success: false, message: rpcResponse.error.message };
    }

    return { success: true, message: 'Payment successful!' };
  } catch (error: any) {
    console.error('Payment Error:', error);
    return { success: false, message: 'Server error processing payment.' };
  }
}

// -----------------------------------------------------------------------------
// AUTO-REGISTRATION LOGIC
// -----------------------------------------------------------------------------
export async function loginOrRegisterLineUser(lineProfile: {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}) {
  console.log('--- LINE LOGIN VIA RPC ---', lineProfile.userId);

  try {
    // SECURITY NOTE: Since RLS is disabled, we can just call this function.
    // It will run with the 'anon' user's permissions, which is fine for now.
    const { data, error } = await supabase.rpc('register_line_user', {
      p_line_user_id: lineProfile.userId,
      p_display_name: lineProfile.displayName,
      p_picture_url: lineProfile.pictureUrl || null,
    });

    if (error) {
      console.error('RPC Error:', error);
      return { success: false, message: `Database error: ${error.message}` };
    }

    // RPC returns a table array
    const result = data && data[0] ? data[0] : null;

    if (!result) {
      return {
        success: false,
        message: 'No response from registration system.',
      };
    }

    return { success: true, userId: result.user_id, isNew: result.is_new };
  } catch (err: any) {
    console.error('Server Action Error:', err);
    return { success: false, message: 'System connectivity error.' };
  }
}
