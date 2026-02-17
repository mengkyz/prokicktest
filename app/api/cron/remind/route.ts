import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as line from '@line/bot-sdk';

// 1. Setup Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// 2. Setup LINE
const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  channelSecret: process.env.LINE_CHANNEL_SECRET!,
});

export async function GET(request: Request) {
  // Security Check
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ---------------------------------------------------------
    // REFACTORED: Call the RPC instead of building the Query
    // ---------------------------------------------------------
    const { data: bookings, error } = await supabase.rpc(
      'get_upcoming_notifications',
    );

    if (error) throw error;
    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ message: 'No bookings to notify' });
    }

    // 5. Send Messages & Update DB
    const results = await Promise.all(
      bookings.map(async (booking: any) => {
        try {
          // Format time (Logic moved from DB to here for formatting)
          const timeStr = new Date(booking.start_time).toLocaleTimeString(
            'th-TH',
            {
              hour: '2-digit',
              minute: '2-digit',
            },
          );

          // A. Send LINE Message
          await lineClient.pushMessage({
            to: booking.line_user_id,
            messages: [
              {
                type: 'flex',
                altText: `🔔 แจ้งเตือน: คลาสเรียนเริ่มใน 2 ชม.`,
                contents: {
                  type: 'bubble',
                  header: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: 'Upcoming Class ⚽',
                        weight: 'bold',
                        color: '#1e2e5c',
                        size: 'sm',
                      },
                    ],
                  },
                  hero: {
                    type: 'image',
                    url: 'https://images.unsplash.com/photo-1575361204480-aadea25d46f3?auto=format&fit=crop&w=600&q=80',
                    size: 'full',
                    aspectRatio: '20:13',
                    aspectMode: 'cover',
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: `น้อง ${booking.student_name} มีคลาสเรียน!`,
                        weight: 'bold',
                        size: 'md',
                        wrap: true,
                      },
                      {
                        type: 'box',
                        layout: 'vertical',
                        margin: 'lg',
                        spacing: 'sm',
                        contents: [
                          {
                            type: 'box',
                            layout: 'baseline',
                            spacing: 'sm',
                            contents: [
                              {
                                type: 'text',
                                text: 'เวลา',
                                color: '#aaaaaa',
                                size: 'sm',
                                flex: 1,
                              },
                              {
                                type: 'text',
                                text: `${timeStr} น.`,
                                wrap: true,
                                color: '#666666',
                                size: 'sm',
                                flex: 5,
                              },
                            ],
                          },
                          {
                            type: 'box',
                            layout: 'baseline',
                            spacing: 'sm',
                            contents: [
                              {
                                type: 'text',
                                text: 'สถานที่',
                                color: '#aaaaaa',
                                size: 'sm',
                                flex: 1,
                              },
                              {
                                type: 'text',
                                text: booking.location,
                                wrap: true,
                                color: '#666666',
                                size: 'sm',
                                flex: 5,
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          });

          // ---------------------------------------------------------
          // REFACTORED: Call the second RPC to mark as done
          // ---------------------------------------------------------
          await supabase.rpc('mark_notification_sent', {
            p_booking_id: booking.booking_id,
          });

          return { id: booking.booking_id, status: 'sent' };
        } catch (err) {
          console.error(`Failed to notify booking ${booking.booking_id}`, err);
          return { id: booking.booking_id, status: 'failed' };
        }
      }),
    );

    return NextResponse.json({
      success: true,
      processed: results.length,
      details: results,
    });
  } catch (err: any) {
    console.error('Cron Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
