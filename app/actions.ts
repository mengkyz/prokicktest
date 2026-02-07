// app/actions.ts
'use server';

import { createClient } from '@supabase/supabase-js';

// Standard Client is all we need now!
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const SLIPOK_BRANCH_ID = process.env.SLIPOK_BRANCH_ID!;
const SLIPOK_API_KEY = process.env.SLIPOK_API_KEY!;

export async function verifyAndProcessPayment(formData: FormData) {
  const file = formData.get('slip') as File;
  const userId = formData.get('userId') as string;
  const childId = formData.get('childId') as string;
  const packageId = formData.get('packageId') as string;
  const type = formData.get('type') as 'new_package' | 'extra_session';

  console.log('--- STARTING PAYMENT VERIFICATION ---');

  if (!file || !userId || !packageId) {
    return { success: false, message: 'Missing required data.' };
  }

  // Security Check: Ensure file is not empty
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

    // 2. Call SlipOK API (With Fix for Production)
    // -----------------------------------------------------------------
    // FIX: Convert File Stream to Buffer to ensure data isn't lost in transit
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const slipFormData = new FormData();
    // IMPORTANT: The 3rd argument (file.name) is REQUIRED by SlipOK
    slipFormData.append('files', new Blob([buffer]), file.name);
    slipFormData.append('log', 'true');
    slipFormData.append('amount', expectedPrice.toString());
    // -----------------------------------------------------------------

    const response = await fetch(
      `https://api.slipok.com/api/line/apikey/${SLIPOK_BRANCH_ID}`,
      {
        method: 'POST',
        headers: { 'x-authorization': SLIPOK_API_KEY },
        body: slipFormData,
      },
    );

    const result = await response.json();
    console.log(
      'SlipOK Result:',
      result.success ? 'Success' : 'Failed',
      result.code,
    );

    // --- NEW: LOGGING VIA RPC ---
    // We call the database function which has 'God Mode' permissions internally
    const { error: logError } = await supabase.rpc('log_payment_attempt', {
      p_user_id: userId,
      p_payment_type: type,
      p_target_id: packageId,
      p_expected_amount: expectedPrice,
      p_success: result.success,
      p_api_response: result,
      p_error_code: result.code || null,
    });

    if (logError) {
      console.error('CRITICAL: Failed to save payment log:', logError.message);
    } else {
      console.log('Payment log saved successfully via RPC.');
    }
    // ----------------------------

    // 4. Handle SlipOK Errors
    if (!result.success) {
      if (result.code === 1012)
        return { success: false, message: 'This slip has already been used!' };
      if (result.code === 1014)
        return { success: false, message: 'Transfer to wrong account!' };
      if (result.code === 1006)
        return { success: false, message: 'Transfer amount does not match.' };
      return {
        success: false,
        message: result.message || 'Slip verification failed.',
      };
    }

    // 5. Success! Execute Supabase Transaction
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
      console.error('RPC Error:', rpcResponse.error);
      return { success: false, message: rpcResponse.error.message };
    }

    return {
      success: true,
      message: 'Payment verified and processed successfully!',
    };
  } catch (error: any) {
    console.error('Payment Error:', error);
    return { success: false, message: 'Server error processing payment.' };
  }
}
