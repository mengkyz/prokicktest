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

// --- TYPES ---
type ModalState = {
  isOpen: boolean;
  type:
    | 'confirm_buy'
    | 'confirm_extra'
    | 'confirm_cancel'
    | 'success'
    | 'error'
    | null;
  title: string;
  message?: string;
  details?: {
    // For Purchases
    packageName?: string;
    price?: number;
    sessions?: number;
    validity?: number;
    targetName?: string;
    // For Bookings
    date?: string;
    time?: string;
    location?: string;
  };
  action?: () => void;
};

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
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Modal State
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: null,
    title: '',
  });

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
  const loadDashboardData = useCallback(
    async (isBackgroundRefresh = false) => {
      if (!userId) return;

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
    },
    [userId, activeProfileId]
  );

  // 3. Effects
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const onFocus = () => loadDashboardData(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadDashboardData]);

  // --- HELPERS: DATE FORMATTERS ---

  // Package Expiry: "12 January 2026"
  const formatExpiryDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Booking Ticket: "Tue, 13 Jan 2026"
  const formatBookingDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Get Target Name
  const getTargetName = () => {
    if (activeProfileId) {
      return (
        children.find((c) => c.id === activeProfileId)?.nickname || 'Child'
      );
    }
    return profile?.nickname || profile?.full_name || 'Myself';
  };

  // 4. Actions

  // --- BUY EXTRA SESSION FLOW ---
  const initiateBuyExtra = (pkg: any) => {
    setModal({
      isOpen: true,
      type: 'confirm_extra',
      title: 'Confirm Purchase',
      details: {
        packageName: `${pkg.package_templates.name} (Extra Session)`,
        price: pkg.package_templates.extra_session_price,
        targetName: getTargetName(),
        sessions: 1,
      },
      action: () => processBuyExtra(pkg.id),
    });
  };

  const processBuyExtra = async (packageId: string) => {
    setModal((prev) => ({ ...prev, isOpen: false }));
    setProcessing(true);

    const { data, error } = await supabase.rpc('buy_extra_session', {
      p_user_id: userId,
      p_package_id: packageId,
    });

    setProcessing(false);

    if (data?.success) {
      setModal({
        isOpen: true,
        type: 'success',
        title: 'Payment Successful!',
        message: 'One extra session has been added to your package.',
      });
      loadDashboardData();
    } else {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Purchase Failed',
        message: error?.message || data?.message,
      });
    }
  };

  // --- BUY PACKAGE FLOW ---
  const initiateBuyPackage = (template: any) => {
    setModal({
      isOpen: true,
      type: 'confirm_buy',
      title: 'Confirm Purchase',
      details: {
        packageName: template.name,
        price: template.price,
        sessions: template.session_count,
        validity: template.days_valid,
        targetName: getTargetName(),
      },
      action: () => processBuyPackage(template.id),
    });
  };

  const processBuyPackage = async (templateId: number) => {
    setModal((prev) => ({ ...prev, isOpen: false }));
    setProcessing(true);
    setShowBuyModal(false);

    const { data, error } = await supabase.rpc('buy_new_package', {
      p_user_id: userId,
      p_child_id: activeProfileId,
      p_template_id: templateId,
    });

    setProcessing(false);

    if (data?.success) {
      setModal({
        isOpen: true,
        type: 'success',
        title: 'Payment Successful!',
        message: 'Your new package is active and ready to use.',
      });
      loadDashboardData();
    } else {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Purchase Failed',
        message: error?.message || data?.message,
      });
    }
  };

  // --- CANCEL BOOKING FLOW ---
  const initiateCancelBooking = (booking: any) => {
    setModal({
      isOpen: true,
      type: 'confirm_cancel',
      title: 'Cancel Booking',
      message: 'Are you sure you want to cancel this session?',
      details: {
        date: formatBookingDate(booking.class_date),
        time: new Date(booking.class_date).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        location: booking.classes.location,
      },
      action: () => processCancelBooking(booking.id),
    });
  };

  const processCancelBooking = async (bookingId: string) => {
    setModal((prev) => ({ ...prev, isOpen: false }));
    setProcessing(true);

    const { data, error } = await supabase.rpc('cancel_booking', {
      p_booking_id: bookingId,
      p_user_id: userId,
    });

    setProcessing(false);

    if (data?.success) {
      setModal({
        isOpen: true,
        type: 'success',
        title: 'Booking Cancelled',
        message: 'Your session has been cancelled successfully.',
      });
      loadDashboardData();
    } else {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Cancellation Failed',
        message: error?.message || data?.message,
      });
    }
  };

  const isCancellable = (classDateStr: string) => {
    return (
      new Date().getTime() <
      new Date(classDateStr).getTime() - 2 * 60 * 60 * 1000
    );
  };

  // --- Splitting Bookings ---
  const now = new Date();
  const upcomingBookings = bookings.filter(
    (b) => new Date(b.class_date) >= now
  );
  const pastBookings = bookings
    .filter((b) => new Date(b.class_date) < now)
    .reverse();

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
                          Expires: {formatExpiryDate(pkg.expiry_date)}
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
                          onClick={() => initiateBuyExtra(pkg)}
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
              <div className="flex items-center">
                <h2 className="text-xl font-bold text-gray-800">Schedule</h2>
              </div>

              <Link
                href={`/book?userId=${userId}${
                  activeProfileId ? `&childId=${activeProfileId}` : ''
                }`}
                className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center font-bold py-3.5 rounded-xl shadow-md hover:shadow-lg transition transform active:scale-95"
              >
                + Book New Class
              </Link>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[200px]">
                {upcomingBookings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm">
                    <p>No upcoming classes.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {upcomingBookings.map((booking) => {
                      const canCancel = isCancellable(booking.class_date);
                      const isStandby = booking.status === 'standby';

                      return (
                        <div
                          key={booking.id}
                          className="p-4 hover:bg-gray-50 transition"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-gray-800 text-base whitespace-nowrap">
                              {formatBookingDate(booking.class_date)}
                            </span>

                            {isStandby ? (
                              <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase bg-yellow-100 text-yellow-800 border border-yellow-200 shadow-sm ml-2">
                                ⏳ Queue #{booking.standby_order}
                              </span>
                            ) : (
                              <span
                                className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase border shadow-sm ml-2
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
                                  : ` (${
                                      booking.standby_order - 1
                                    } person ahead)`}
                              </p>
                            </div>
                          )}

                          <button
                            onClick={() => initiateCancelBooking(booking)}
                            disabled={!canCancel || processing}
                            className={`w-full text-center text-xs font-bold py-2.5 rounded-lg border transition
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {pastBookings.length > 0 && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => setShowHistoryModal(true)}
                    className="text-sm text-gray-400 hover:text-blue-600 hover:underline transition"
                  >
                    View past bookings history
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL: PACKAGE SELECTION LIST */}
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
                    onClick={() => initiateBuyPackage(t)}
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

        {/* MODAL: CONFIRMATION & SUCCESS (SHARED) */}
        {modal.isOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden transform scale-100 transition-all">
              {/* Header */}
              <div
                className={`p-5 flex items-center gap-3 border-b
                ${
                  modal.type?.startsWith('confirm')
                    ? 'bg-blue-50 border-blue-100'
                    : modal.type === 'success'
                    ? 'bg-green-50 border-green-100'
                    : 'bg-red-50 border-red-100'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm
                  ${
                    modal.type?.startsWith('confirm')
                      ? 'bg-white text-blue-600'
                      : modal.type === 'success'
                      ? 'bg-white text-green-600'
                      : 'bg-white text-red-600'
                  }`}
                >
                  {modal.type === 'success'
                    ? '✓'
                    : modal.type === 'error'
                    ? '!'
                    : '?'}
                </div>
                <div>
                  <h3
                    className={`text-lg font-bold
                    ${
                      modal.type === 'error' ? 'text-red-900' : 'text-gray-900'
                    }`}
                  >
                    {modal.title}
                  </h3>
                </div>
              </div>

              {/* Body */}
              <div className="p-6">
                {modal.details ? (
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
                      {/* --- PURCHASE LAYOUT --- */}
                      {modal.type?.includes('_buy') ||
                      modal.type?.includes('_extra') ? (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-400 uppercase">
                              Item
                            </span>
                            <span className="text-sm font-bold text-gray-900">
                              {modal.details.packageName}
                            </span>
                          </div>

                          {/* Show 'Sessions' if applicable (Not for Extra Session which is fixed 1) */}
                          {modal.type !== 'confirm_extra' && (
                            <>
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-gray-400 uppercase">
                                  Sessions
                                </span>
                                <span className="text-sm font-bold text-gray-900">
                                  {modal.details.sessions}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-gray-400 uppercase">
                                  Validity
                                </span>
                                <span className="text-sm font-bold text-gray-900">
                                  {modal.details.validity} Days
                                </span>
                              </div>
                            </>
                          )}

                          <div className="flex justify-between items-center border-t border-gray-200 pt-2 mt-2">
                            <span className="text-xs font-bold text-gray-400 uppercase">
                              Total Price
                            </span>
                            <span className="text-lg font-black text-blue-600">
                              ฿{modal.details.price?.toLocaleString()}
                            </span>
                          </div>
                        </>
                      ) : (
                        /* --- BOOKING/CANCEL LAYOUT --- */
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-400 uppercase">
                              Date
                            </span>
                            <span className="text-sm font-bold text-gray-900">
                              {modal.details.date}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-400 uppercase">
                              Time
                            </span>
                            <span className="text-sm font-bold text-gray-900">
                              {modal.details.time}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-400 uppercase">
                              Location
                            </span>
                            <span className="text-sm font-bold text-gray-900">
                              {modal.details.location}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {modal.details.targetName && (
                      <div className="text-center text-sm text-gray-500">
                        Buying for:{' '}
                        <strong className="text-gray-800">
                          {modal.details.targetName}
                        </strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center leading-relaxed">
                    {modal.message}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="p-4 bg-gray-50 flex gap-3 border-t border-gray-100">
                {modal.type?.startsWith('confirm') ? (
                  <>
                    <button
                      onClick={() => setModal({ ...modal, isOpen: false })}
                      className="flex-1 py-3 rounded-xl font-bold text-gray-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={modal.action}
                      className={`flex-1 py-3 rounded-xl font-bold text-white shadow-md transition
                        ${
                          modal.type === 'confirm_cancel'
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                    >
                      {modal.type === 'confirm_cancel'
                        ? 'Confirm Cancel'
                        : 'Confirm Pay'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setModal({ ...modal, isOpen: false });
                      if (modal.action) modal.action();
                    }}
                    className={`w-full py-3 rounded-xl font-bold text-white shadow-md transition
                      ${
                        modal.type === 'success'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL: BOOKING HISTORY */}
        {showHistoryModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h2 className="text-lg font-bold text-gray-900">
                  Booking History
                </h2>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
                >
                  ×
                </button>
              </div>
              <div className="overflow-y-auto p-4 space-y-3">
                {pastBookings.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">
                    No past bookings found.
                  </p>
                ) : (
                  pastBookings.map((b) => (
                    <div
                      key={b.id}
                      className="border border-gray-100 rounded-xl p-4 flex justify-between items-center bg-gray-50 opacity-75 hover:opacity-100 transition"
                    >
                      <div>
                        {/* History Date: Compact format */}
                        <p className="font-bold text-gray-800 text-sm">
                          {formatBookingDate(b.class_date)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(b.class_date).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          • {b.classes.location}
                        </p>
                      </div>
                      <div>
                        <span
                          className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase border
                          ${
                            b.status === 'booked'
                              ? 'bg-green-100 text-green-700 border-green-200'
                              : b.status === 'cancelled'
                              ? 'bg-red-100 text-red-700 border-red-200'
                              : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-4 border-t bg-gray-50 text-center">
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="text-sm font-bold text-blue-600 hover:text-blue-800"
                >
                  Close
                </button>
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
