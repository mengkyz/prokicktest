import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as line from '@line/bot-sdk';

// --- CONFIGURATION ---
const BASE_URL = 'https://prokicktest.vercel.app';

// Returns "น้อง" for child profiles, "คุณ" for parent/player users
const getPrefix = (booking: any): string =>
  booking.child_id ? 'น้อง' : 'คุณ';

export async function GET(request: Request) {
  // --- 1. Security Check ---
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // --- 2. Initialize Clients ---
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const lineClient = new line.messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
    });

    const results = [];

    // =========================================================================
    // PART C: ACTIVATE PENDING PACKAGES
    // Runs every 15 minutes. Finds all 'pending' packages whose first confirmed
    // booking has crossed the 2-hour non-cancellable threshold, and activates
    // them by setting start_date, expiry_date, and status = 'active'.
    // =========================================================================
    const { data: activationResult, error: activationError } = await supabase
      .rpc('activate_pending_packages');

    if (activationError) {
      console.error('Package activation error:', activationError.message);
    } else {
      console.log('Packages activated this run:', activationResult?.activated ?? 0);
    }

    // =========================================================================
    // PART A: STANDBY PROMOTION NOTIFICATIONS (New Logic)
    // =========================================================================
    const { data: promoted } = await supabase.rpc('get_promoted_notifications');

    if (promoted && promoted.length > 0) {
      const promoResults = await Promise.all(
        promoted.map(async (booking: any) => {
          try {
            const timeStr = new Date(booking.start_time).toLocaleTimeString(
              'th-TH',
              {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Bangkok',
                hour12: false,
              },
            );
            const dateStr = new Date(booking.start_time).toLocaleDateString(
              'th-TH',
              { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' },
            );

            await lineClient.pushMessage({
              to: booking.line_user_id,
              messages: [
                {
                  type: 'flex',
                  altText: `🎉 ข่าวดี! คิวว่างแล้ว`,
                  contents: {
                    type: 'bubble',
                    header: {
                      type: 'box',
                      layout: 'vertical',
                      backgroundColor: '#10b981', // Green for Success
                      contents: [
                        {
                          type: 'text',
                          text: 'Booking Confirmed! ✅',
                          weight: 'bold',
                          color: '#ffffff',
                          size: 'sm',
                        },
                      ],
                    },
                    hero: {
                      type: 'image',
                      url: `${BASE_URL}/banner.jpg`,
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
                          text: `คิวว่างแล้วครับ!`,
                          weight: 'bold',
                          size: 'xl',
                          color: '#1e2e5c',
                        },
                        {
                          type: 'text',
                          text: `${getPrefix(booking)} ${booking.student_name} ได้เลื่อนสถานะเป็น "จองสำเร็จ"`,
                          size: 'sm',
                          color: '#555555',
                          wrap: true,
                          margin: 'md',
                        },
                        { type: 'separator', margin: 'md' },
                        {
                          type: 'box',
                          layout: 'vertical',
                          margin: 'lg',
                          spacing: 'sm',
                          backgroundColor: '#ecfdf5',
                          paddingAll: 'md',
                          cornerRadius: 'md',
                          contents: [
                            {
                              type: 'text',
                              text: `${dateStr} @ ${timeStr} น.`,
                              weight: 'bold',
                              color: '#047857',
                              size: 'md',
                              align: 'center',
                            },
                            {
                              type: 'text',
                              text: booking.class_name,
                              size: 'xs',
                              color: '#047857',
                              align: 'center',
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              ],
            });

            await supabase.rpc('mark_promotion_sent', {
              p_booking_id: booking.booking_id,
            });
            return {
              type: 'promotion',
              id: booking.booking_id,
              status: 'sent',
            };
          } catch (err) {
            console.error(`Promotion Notify Error ${booking.booking_id}`, err);
            return {
              type: 'promotion',
              id: booking.booking_id,
              status: 'failed',
            };
          }
        }),
      );
      results.push(...promoResults);
    }

    // =========================================================================
    // PART B: UPCOMING CLASS REMINDERS (Existing Logic)
    // =========================================================================
    const { data: bookings } = await supabase.rpc('get_upcoming_notifications');

    if (bookings && bookings.length > 0) {
      const bookingResults = await Promise.all(
        bookings.map(async (booking: any) => {
          try {
            const timeStr = new Date(booking.start_time).toLocaleTimeString(
              'th-TH',
              {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Bangkok',
                hour12: false,
              },
            );

            await lineClient.pushMessage({
              to: booking.line_user_id,
              messages: [
                {
                  type: 'flex',
                  altText: `🔔 แจ้งเตือน: คลาสเรียนเริ่มใน 3 ชม.`,
                  contents: {
                    type: 'bubble',
                    header: {
                      type: 'box',
                      layout: 'vertical',
                      backgroundColor: '#1e2e5c',
                      contents: [
                        {
                          type: 'text',
                          text: 'Upcoming Class ⚽',
                          weight: 'bold',
                          color: '#ffffff',
                          size: 'sm',
                        },
                      ],
                    },
                    hero: {
                      type: 'image',
                      url: `${BASE_URL}/banner.jpg`,
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
                          text: `${getPrefix(booking)} ${booking.student_name} มีคลาสเรียน!`,
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

            await supabase.rpc('mark_notification_sent', {
              p_booking_id: booking.booking_id,
            });
            return { type: 'reminder', id: booking.booking_id, status: 'sent' };
          } catch (err) {
            console.error(`Reminder Notify Error ${booking.booking_id}`, err);
            return {
              type: 'reminder',
              id: booking.booking_id,
              status: 'failed',
            };
          }
        }),
      );
      results.push(...bookingResults);
    }

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
