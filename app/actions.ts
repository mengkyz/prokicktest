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
// PROFILE MANAGEMENT ACTIONS
// -----------------------------------------------------------------------------

export async function createChildProfile(formData: FormData) {
  const parentId = formData.get('parentId') as string;
  const nickname = formData.get('nickname') as string;
  const weight = formData.get('weight') as string;
  const height = formData.get('height') as string;
  const size = formData.get('size') as string;
  const birthDate = formData.get('birthDate') as string;

  const { error } = await supabase.rpc('create_child_profile', {
    p_parent_id: parentId,
    p_nickname: nickname,
    p_weight: weight || null,
    p_height: height || null,
    p_jersey_size: size || null,
    p_birth_date: birthDate || null,
  });

  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function updateProfile(formData: FormData) {
  const id = formData.get('id') as string;
  const isChild = formData.get('isChild') === 'true';
  const nickname = formData.get('nickname') as string;
  const fullName = formData.get('fullName') as string;
  const phone = formData.get('phone') as string;
  const weight = formData.get('weight') as string;
  const height = formData.get('height') as string;
  const size = formData.get('size') as string;
  const birthDate = formData.get('birthDate') as string;

  const { error } = await supabase.rpc('update_profile_data', {
    p_id: id,
    p_is_child: isChild,
    p_nickname: nickname,
    p_full_name: fullName || null,
    p_phone_number: phone || null,
    p_weight: weight || null,
    p_height: height || null,
    p_jersey_size: size || null,
    p_birth_date: birthDate || null,
  });

  if (error) return { success: false, message: error.message };
  return { success: true };
}

// -----------------------------------------------------------------------------
// PAYMENT VERIFICATION LOGIC
// -----------------------------------------------------------------------------
export async function verifyAndProcessPayment(formData: FormData) {
  const userId = formData.get('userId') as string;
  const childId = formData.get('childId') as string;
  const packageId = formData.get('packageId') as string;
  const type = formData.get('type') as 'new_package' | 'extra_session';
  const promoId = formData.get('promoId') as string | null;
  const isDevBypass = formData.get('dev_bypass') === 'true';

  // --- DEV BYPASS SECTION (Remove before Production) ---
  if (isDevBypass) {
    const result = await processDevPayment(userId, childId, packageId, type);
    if (result.success && promoId) await incrementPromoUsage(promoId);
    return result;
  }
  // -----------------------------------------------------

  const file = formData.get('slip') as File;

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

      // Apply promo discount to expected amount
      if (promoId) {
        const { data: promo } = await supabase
          .from('promo_codes')
          .select('discount_type, discount')
          .eq('id', promoId)
          .single();
        if (promo) {
          const val = promo.discount ?? 0;
          const discount =
            promo.discount_type === 'percent'
              ? Math.floor(expectedPrice * val / 100)
              : Math.min(val, expectedPrice);
          expectedPrice = expectedPrice - discount;
        }
      }
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

    const httpStatus = response.status;
    const result = await response.json();
    const slipData = result.data || {};

    // 3. Log via RPC (always — success AND failure)
    await supabase.rpc('log_payment_attempt', {
      p_user_id: userId,
      p_child_id: childId === 'null' ? null : childId,
      p_payment_type: type,
      p_target_id: packageId,
      p_expected_amount: expectedPrice,
      p_actual_amount: slipData.amount ?? null,
      p_success: result.success === true,
      p_http_status: httpStatus,
      p_api_response: result,
      p_error_code: result.code ?? null,
      p_trans_ref: slipData.transRef ?? null,
      p_sender_name: slipData.sender?.displayName ?? null,
      p_failure_reason: result.success ? null : (result.message ?? null),
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

    // Increment promo code usage count on success
    if (promoId) await incrementPromoUsage(promoId);

    return { success: true, message: 'Payment successful!' };
  } catch (error: any) {
    console.error('Payment Error:', error);
    // Log server/network errors so no attempt goes unrecorded
    await supabase.rpc('log_payment_attempt', {
      p_user_id: userId,
      p_child_id: childId === 'null' ? null : childId,
      p_payment_type: type,
      p_target_id: packageId,
      p_expected_amount: 0,
      p_actual_amount: null,
      p_success: false,
      p_http_status: null,
      p_api_response: null,
      p_error_code: null,
      p_trans_ref: null,
      p_sender_name: null,
      p_failure_reason: `Server error: ${error?.message ?? 'Unknown'}`,
    });
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
    const { data, error } = await supabase.rpc('register_line_user', {
      p_line_user_id: lineProfile.userId,
      p_display_name: lineProfile.displayName,
      p_picture_url: lineProfile.pictureUrl || null,
    });

    if (error) {
      console.error('RPC Error:', error);
      return { success: false, message: `Database error: ${error.message}` };
    }

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

// -----------------------------------------------------------------------------
// PROMO CODE HELPERS
// -----------------------------------------------------------------------------
async function incrementPromoUsage(promoId: string) {
  const { data: promo } = await supabase
    .from('promo_codes')
    .select('used_count')
    .eq('id', promoId)
    .single();
  if (promo != null) {
    await supabase
      .from('promo_codes')
      .update({ used_count: (promo.used_count ?? 0) + 1 })
      .eq('id', promoId);
  }
}

// -----------------------------------------------------------------------------
// DEV BYPASS FUNCTION (Temporary)
// -----------------------------------------------------------------------------
async function processDevPayment(
  userId: string,
  childId: string,
  packageId: string,
  type: 'new_package' | 'extra_session',
) {
  console.log('--- DEV BYPASS PAYMENT STARTED ---');

  try {
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
      console.error('Dev Bypass Error:', rpcResponse.error);
      return {
        success: false,
        message: `DB Error: ${rpcResponse.error.message}`,
      };
    }

    return {
      success: true,
      message: 'Dev Purchase Completed (No Slip Checked)',
    };
  } catch (error: any) {
    console.error('Dev Bypass Exception:', error);
    return { success: false, message: 'Server Exception during Dev Bypass' };
  }
}
