import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as line from '@line/bot-sdk';

const BASE_URL = 'https://prokicktest.vercel.app';

export async function GET(request: Request) {
  // Security Check (Reusing the same secret is fine)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const lineClient = new line.messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
    });

    // --- STEP 1: Bulk-expire all stale packages ---
    // Ensures DB status is always correct regardless of whether a notification was sent
    const { error: expireError } = await supabase
      .from('user_packages')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expiry_date', new Date().toISOString());
    if (expireError) console.error('Bulk expire error:', expireError.message);

    // --- STEP 2: PACKAGE NOTIFICATIONS ---
    const { data: packages, error } = await supabase.rpc(
      'get_package_notifications',
    );

    if (error) throw error;
    if (!packages || packages.length === 0) {
      return NextResponse.json({
        message: 'No package notifications needed today',
      });
    }

    const results = await Promise.all(
      packages.map(async (pkg: any) => {
        try {
          const isExpired = pkg.notification_type === 'expired';
          const dateStr = new Date(pkg.expiry_date).toLocaleDateString(
            'th-TH',
            {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'Asia/Bangkok',
            },
          );

          const headerColor = isExpired ? '#ef4444' : '#eab308';
          const titleText = isExpired
            ? '⚠️ แพ็กเกจหมดอายุ'
            : '⏳ แจ้งเตือนแพ็กเกจ';
          const bodyTitle = isExpired
            ? 'แพ็กเกจหมดอายุแล้ว'
            : 'ใกล้หมดอายุใน 7 วัน';
          const bodyColor = isExpired ? '#ef4444' : '#854d0e';

          await lineClient.pushMessage({
            to: pkg.line_user_id,
            messages: [
              {
                type: 'flex',
                altText: isExpired
                  ? `⚠️ แพ็กเกจ ${pkg.package_name} หมดอายุแล้ว`
                  : `⏳ แจ้งเตือน: แพ็กเกจใกล้หมดอายุ`,
                contents: {
                  type: 'bubble',
                  header: {
                    type: 'box',
                    layout: 'vertical',
                    backgroundColor: headerColor,
                    contents: [
                      {
                        type: 'text',
                        text: titleText,
                        weight: 'bold',
                        color: '#ffffff',
                        size: 'sm',
                      },
                    ],
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: pkg.package_name,
                        weight: 'bold',
                        size: 'xl',
                        color: '#1e2e5c',
                      },
                      {
                        type: 'text',
                        text: `สำหรับ: ${pkg.student_name}`,
                        size: 'xs',
                        color: '#aaaaaa',
                        margin: 'xs',
                      },
                      { type: 'separator', margin: 'md' },
                      {
                        type: 'box',
                        layout: 'vertical',
                        margin: 'lg',
                        spacing: 'sm',
                        backgroundColor: isExpired ? '#fef2f2' : '#fefce8',
                        paddingAll: 'md',
                        cornerRadius: 'md',
                        contents: [
                          {
                            type: 'text',
                            text: bodyTitle,
                            weight: 'bold',
                            color: bodyColor,
                            size: 'sm',
                            align: 'center',
                          },
                          {
                            type: 'text',
                            text: dateStr,
                            size: 'xl',
                            weight: 'bold',
                            color: '#333333',
                            align: 'center',
                            margin: 'sm',
                          },
                        ],
                      },
                      {
                        type: 'button',
                        style: 'primary',
                        color: '#1e2e5c',
                        margin: 'lg',
                        height: 'sm',
                        action: {
                          type: 'uri',
                          label: 'ต่ออายุแพ็กเกจ',
                          uri: `${BASE_URL}/packages`,
                        },
                      },
                    ],
                  },
                },
              },
            ],
          });

          await supabase.rpc('mark_package_notification_sent', {
            p_package_id: pkg.package_id,
            p_type: pkg.notification_type,
          });

          // If expired notification, ensure status column is set correctly
          if (isExpired) {
            await supabase
              .from('user_packages')
              .update({ status: 'expired' })
              .eq('id', pkg.package_id);
          }

          return {
            id: pkg.package_id,
            status: 'sent',
            type: pkg.notification_type,
          };
        } catch (err) {
          console.error(`Package Notify Error ${pkg.package_id}`, err);
          return { id: pkg.package_id, status: 'failed' };
        }
      }),
    );

    return NextResponse.json({ success: true, processed: results.length });
  } catch (err: any) {
    console.error('Cron Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
