// app/actions.ts
'use server';

import { createClient } from '@supabase/supabase-js';
import { setSession, getSession } from '@/lib/session';

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
  const session = await getSession();
  if (!session) return { success: false, message: 'Not authenticated' };

  const nickname = formData.get('nickname') as string;
  const weight = formData.get('weight') as string;
  const height = formData.get('height') as string;
  const size = formData.get('size') as string;
  const birthDate = formData.get('birthDate') as string;

  const { error } = await supabase.rpc('create_child_profile', {
    p_parent_id: session.userId, // always use session, never client input
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
  const session = await getSession();
  if (!session) return { success: false, message: 'Not authenticated' };

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
  const session = await getSession();
  if (!session) return { success: false, message: 'Not authenticated' };

  const userId = session.userId; // Always from session — never trust the client
  const childId = formData.get('childId') as string;
  const packageId = formData.get('packageId') as string;
  const type = formData.get('type') as 'new_package' | 'extra_session';
  const promoId = formData.get('promoId') as string | null;

  // Dev bypass: only allowed when MOCK_LOGIN_ENABLED is set server-side
  const isDevBypass =
    formData.get('dev_bypass') === 'true' &&
    process.env.MOCK_LOGIN_ENABLED === 'true';

  if (isDevBypass) {
    const result = await processDevPayment(userId, childId, packageId, type);
    if (result.success && promoId) await incrementPromoUsage(promoId);
    return result;
  }

  const file = formData.get('slip') as File;

  if (!file || !userId || !packageId) {
    return { success: false, message: 'Missing required data.' };
  }
  if (file.size === 0) {
    return { success: false, message: 'File is empty.' };
  }

  let fullPrice = 0;
  let discountAmount = 0;

  try {
    let expectedPrice = 0;
    if (type === 'new_package') {
      const { data: template } = await supabase
        .from('package_templates')
        .select('price')
        .eq('id', packageId)
        .single();
      if (!template)
        return { success: false, message: 'Invalid Package Template' };
      fullPrice = template.price;

      if (promoId) {
        const { data: promo } = await supabase
          .from('promo_codes')
          .select('discount_type, discount')
          .eq('id', promoId)
          .single();
        if (promo) {
          const val = promo.discount ?? 0;
          discountAmount =
            promo.discount_type === 'percent'
              ? Math.round(fullPrice * val) / 100
              : Math.min(val, fullPrice);
        }
      }
      expectedPrice = parseFloat((fullPrice - discountAmount).toFixed(2));
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
      p_promo_id: promoId || null,
      p_full_price: fullPrice || null,
      p_discount_amount: discountAmount > 0 ? discountAmount : null,
      p_net_price: expectedPrice,
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

    if (promoId) await incrementPromoUsage(promoId);

    return { success: true, message: 'Payment successful!' };
  } catch (error: any) {
    console.error('Payment Error:', error);
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
      p_promo_id: promoId || null,
      p_full_price: fullPrice || null,
      p_discount_amount: discountAmount > 0 ? discountAmount : null,
      p_net_price: fullPrice
        ? parseFloat((fullPrice - discountAmount).toFixed(2))
        : null,
    });
    return { success: false, message: 'Server error processing payment.' };
  }
}

// -----------------------------------------------------------------------------
// LINE AUTO-REGISTRATION + SESSION CREATION
// -----------------------------------------------------------------------------
export async function loginOrRegisterLineUser(lineProfile: {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}) {
  console.log('--- LINE LOGIN VIA RPC ---', lineProfile.userId);

  let rpcUserId: string | null = null;

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
      return { success: false, message: 'No response from registration system.' };
    }

    rpcUserId = result.user_id;

    // Set the HTTP-only session cookie
    await setSession(result.user_id);

    return { success: true, userId: result.user_id, isNew: result.is_new };
  } catch (err: any) {
    const detail = err?.message ?? String(err);
    console.error('Server Action Error:', detail, { rpcUserId });
    // Surface the real error so misconfiguration (e.g. missing SESSION_SECRET) is visible
    return { success: false, message: detail || 'System connectivity error.' };
  }
}

// -----------------------------------------------------------------------------
// ADMIN LOGIN (production-safe, protected by ADMIN_SECRET_CODE env var)
// -----------------------------------------------------------------------------
export async function getAdminUserList(secretCode: string) {
  if (!secretCode || secretCode !== process.env.ADMIN_SECRET_CODE) {
    return { success: false, message: 'Invalid secret code' };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*, child_profiles(id)')
    .order('full_name');

  if (error) return { success: false, message: error.message };
  return { success: true, users: data || [] };
}

export async function createAdminSession(userId: string, secretCode: string) {
  if (!secretCode || secretCode !== process.env.ADMIN_SECRET_CODE) {
    return { success: false, message: 'Invalid secret code' };
  }

  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single();

  if (!data) return { success: false, message: 'User not found' };

  await setSession(userId, true);
  return { success: true };
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
// DEV BYPASS HELPER (only reachable when MOCK_LOGIN_ENABLED=true)
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

    return { success: true, message: 'Dev Purchase Completed (No Slip Checked)' };
  } catch (error: any) {
    console.error('Dev Bypass Exception:', error);
    return { success: false, message: 'Server Exception during Dev Bypass' };
  }
}
