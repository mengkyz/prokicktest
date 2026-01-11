'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

// Create Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function DashboardContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');

  // Data State
  const [profile, setProfile] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null); // null = Parent

  const [packages, setPackages] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  // 1. Initial Profile Load
  useEffect(() => {
    if (!userId) return;
    const init = async () => {
      const { data: user } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      const { data: kids } = await supabase
        .from('child_profiles')
        .select('*')
        .eq('parent_id', userId);
      const { data: temps } = await supabase
        .from('package_templates')
        .select('*')
        .order('price');

      setProfile(user);
      setChildren(kids || []);
      setTemplates(temps || []);
    };
    init();
  }, [userId]);

  // 2. Fetch Data (Reloadable)
  // Wrapped in useCallback to safely use in dependencies
  const loadDashboardData = useCallback(
    async (isBackgroundRefresh = false) => {
      if (!userId) return;
      if (!isBackgroundRefresh) setRefreshing(true);

      let pkgQuery = supabase
        .from('user_packages')
        .select(`*, package_templates (*)`)
        .eq('status', 'active');
      let bookingQuery = supabase
        .from('bookings')
        .select(`*, classes (*), child_profiles(nickname)`)
        .neq('status', 'cancelled')
        .order('class_date', { ascending: true });

      if (activeProfileId) {
        pkgQuery = pkgQuery.eq('child_id', activeProfileId);
        bookingQuery = bookingQuery.eq('child_id', activeProfileId);
      } else {
        pkgQuery = pkgQuery.eq('user_id', userId).is('child_id', null);
        bookingQuery = bookingQuery.eq('user_id', userId).is('child_id', null);
      }

      const [{ data: packs }, { data: books }] = await Promise.all([
        pkgQuery,
        bookingQuery,
      ]);

      setPackages(packs || []);
      setBookings(books || []);

      setLoading(false);
      setRefreshing(false);
    },
    [userId, activeProfileId]
  );

  // 3. Effect: Load on Mount & Change Profile
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // 4. Effect: Auto-Refresh on Window Focus
  // (Crucial for Standby users checking if they got promoted)
  useEffect(() => {
    const onFocus = () => loadDashboardData(true); // Silent refresh
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadDashboardData]);

  // 5. Actions
  const handleBuyExtra = async (pkg: any) => {
    if (
      !window.confirm(
        `Buy 1 Extra Session for ${pkg.package_templates.extra_session_price} THB?`
      )
    )
      return;
    setProcessing(true);
    const { data, error } = await supabase.rpc('buy_extra_session', {
      p_user_id: userId,
      p_package_id: pkg.id,
    });

    if (data?.success) {
      alert(`✅ Success! Extra session added.`);
      loadDashboardData();
    } else {
      alert(error?.message || data?.message);
    }
    setProcessing(false);
  };

  const handleBuyPackage = async (templateId: number) => {
    if (!window.confirm('Confirm purchase?')) return;
    setProcessing(true);
    const { data, error } = await supabase.rpc('buy_new_package', {
      p_user_id: userId,
      p_child_id: activeProfileId,
      p_template_id: templateId,
    });

    if (data?.success) {
      alert('✅ Purchased successfully!');
      loadDashboardData();
      setShowBuyModal(false);
    } else {
      alert(error?.message || data?.message);
    }
    setProcessing(false);
  };

  const handleCancelBooking = async (bookingId: string, classDate: string) => {
    if (!window.confirm('Are you sure you want to cancel?')) return;
    setProcessing(true);
    const { data, error } = await supabase.rpc('cancel_booking', {
      p_booking_id: bookingId,
      p_user_id: userId,
    });

    if (data?.success) {
      alert('✅ Booking cancelled.');
      loadDashboardData();
    } else {
      alert('❌ ' + (error?.message || data?.message));
    }
    setProcessing(false);
  };

  // Helper Logic
  const isCancellable = (classDateStr: string) => {
    return (
      new Date().getTime() <
      new Date(classDateStr).getTime() - 2 * 60 * 60 * 1000
    );
  };

  // Filter templates based on Adult vs Child
  const availableTemplates = templates.filter((t) =>
    activeProfileId ? t.type === 'junior' : t.type === 'adult'
  );

  if (!profile)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading Profile...
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
          <div>
            <h1 className="text-3xl font-extrabold text-blue-900">
              ProKick Dashboard
            </h1>
            <p className="text-gray-500">
              Welcome back,{' '}
              <span className="font-semibold text-blue-600">
                {profile.full_name}
              </span>
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-red-500 hover:text-red-700 transition"
          >
            Sign Out
          </Link>
        </div>

        {/* PROFILE TABS */}
        <div className="flex space-x-1 bg-gray-200 p-1 rounded-xl overflow-x-auto shadow-inner no-scrollbar">
          <button
            onClick={() => setActiveProfileId(null)}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 
              ${
                activeProfileId === null
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-black/5'
                  : 'text-gray-600 hover:bg-gray-300/50'
              }`}
          >
            👤 My Profile
          </button>
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setActiveProfileId(child.id)}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2
                ${
                  activeProfileId === child.id
                    ? 'bg-white text-blue-700 shadow-sm ring-1 ring-black/5'
                    : 'text-gray-600 hover:bg-gray-300/50'
                }`}
            >
              👶 {child.nickname}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading data...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* LEFT COLUMN: PACKAGES */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">
                  {activeProfileId ? "Child's Packages" : 'My Packages'}
                </h2>
                <button
                  onClick={() => setShowBuyModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow transition flex items-center gap-1"
                >
                  <span>+</span> Buy Package
                </button>
              </div>

              {packages.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-dashed border-gray-300 text-center">
                  <p className="text-gray-500 mb-4">
                    No active packages found.
                  </p>
                  <button
                    onClick={() => setShowBuyModal(true)}
                    className="text-blue-600 font-bold hover:underline"
                  >
                    Get Started &rarr;
                  </button>
                </div>
              ) : (
                packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group hover:shadow-md transition"
                  >
                    <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">
                          {pkg.package_templates.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Expires:{' '}
                          {new Date(pkg.expiry_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-4xl font-extrabold text-blue-600">
                          {pkg.remaining_sessions}
                        </span>
                        <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                          Sessions
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          Extras: {pkg.extra_sessions_purchased}/2
                        </span>
                      </div>
                      {pkg.extra_sessions_purchased < 2 ? (
                        <button
                          onClick={() => handleBuyExtra(pkg)}
                          disabled={processing}
                          className="text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition"
                        >
                          ⚡ Buy Extra (฿
                          {pkg.package_templates.extra_session_price})
                        </button>
                      ) : (
                        <span className="text-xs text-orange-500 font-medium bg-orange-50 px-2 py-1 rounded">
                          Max Extras Reached
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* RIGHT COLUMN: SCHEDULE */}
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-800">Schedule</h2>
                  <button
                    onClick={() => loadDashboardData()}
                    disabled={refreshing}
                    className={`text-gray-400 hover:text-blue-600 transition p-1 rounded-full ${
                      refreshing ? 'animate-spin text-blue-600' : ''
                    }`}
                    title="Refresh Schedule"
                  >
                    🔄
                  </button>
                </div>
                <Link
                  href={`/book?userId=${userId}${
                    activeProfileId ? `&childId=${activeProfileId}` : ''
                  }`}
                  className="text-sm font-bold text-green-600 hover:text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition"
                >
                  Book Class &rarr;
                </Link>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[200px]">
                {bookings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm">
                    <p>No upcoming classes.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {bookings.map((booking) => {
                      const canCancel = isCancellable(booking.class_date);
                      const isStandby = booking.status === 'standby';

                      return (
                        <div
                          key={booking.id}
                          className="p-4 hover:bg-gray-50 transition"
                        >
                          {/* DATE & STATUS */}
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-gray-800 text-base">
                              {new Date(
                                booking.class_date
                              ).toLocaleDateString()}
                            </span>

                            {isStandby ? (
                              <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase bg-yellow-100 text-yellow-800 border border-yellow-200 shadow-sm">
                                ⏳ Queue #{booking.standby_order}
                              </span>
                            ) : (
                              <span
                                className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase border shadow-sm
                                  ${
                                    booking.status === 'booked'
                                      ? 'bg-green-100 text-green-700 border-green-200'
                                      : 'bg-orange-100 text-orange-700 border-orange-200'
                                  }`}
                              >
                                {booking.status === 'booked'
                                  ? '✅ Confirmed'
                                  : booking.status}
                              </span>
                            )}
                          </div>

                          {/* TIME & LOCATION */}
                          <div className="text-sm text-gray-500 mb-3 flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span>
                                🕒{' '}
                                {new Date(
                                  booking.class_date
                                ).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                              <span>📍 {booking.classes.location}</span>
                            </div>
                          </div>

                          {/* STANDBY INFO BOX */}
                          {isStandby && (
                            <div className="mb-3 text-xs bg-yellow-50 text-yellow-800 p-2.5 rounded-lg border border-yellow-100">
                              <p className="font-bold">
                                You are on the Waiting List.
                              </p>
                              <p className="mt-0.5">
                                Position:{' '}
                                <strong className="text-black">
                                  #{booking.standby_order}
                                </strong>
                                {booking.standby_order === 1
                                  ? ' (You are next!)'
                                  : ''}
                              </p>
                            </div>
                          )}

                          {/* ACTION BUTTON */}
                          {booking.status !== 'cancelled' && (
                            <button
                              onClick={() =>
                                handleCancelBooking(
                                  booking.id,
                                  booking.class_date
                                )
                              }
                              disabled={!canCancel || processing}
                              className={`w-full text-center text-xs font-bold py-2 rounded-lg border transition
                                ${
                                  canCancel
                                    ? 'border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300'
                                    : 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'
                                }`}
                            >
                              {canCancel
                                ? 'Cancel Booking'
                                : 'Too Late to Cancel'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL: BUY NEW PACKAGE */}
        {showBuyModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative">
              <button
                onClick={() => setShowBuyModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
              >
                ✕
              </button>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">
                Select a Package
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Choose the best plan for{' '}
                {activeProfileId ? 'your child' : 'you'}.
              </p>

              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                {availableTemplates.map((t) => (
                  <div
                    key={t.id}
                    className="border border-gray-200 rounded-xl p-4 flex justify-between items-center hover:border-blue-500 hover:bg-blue-50/30 transition group cursor-pointer"
                    onClick={() => handleBuyPackage(t.id)}
                  >
                    <div>
                      <h3 className="font-bold text-gray-800 group-hover:text-blue-700">
                        {t.name}
                      </h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {t.session_count} Sessions • {t.days_valid} Days
                      </p>
                    </div>
                    <button
                      disabled={processing}
                      className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold group-hover:bg-blue-600 transition shadow-sm"
                    >
                      ฿{t.price.toLocaleString()}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-blue-600 font-bold">
          Loading ProKick...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
