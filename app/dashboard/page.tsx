'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
// Import the Server Action
import { verifyAndProcessPayment } from '../actions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    id?: string | number; // Package/Template ID
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
  const router = useRouter();

  // Data State
  const [profile, setProfile] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const [packages, setPackages] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Payment State
  const [selectedSlip, setSelectedSlip] = useState<File | null>(null);

  // Modal State
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: null,
    title: '',
  });

  // ---------------------------------------------------------------------------
  // 1. INITIAL LOAD + SELF-HEALING LOGIC
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Safety check: If no userId in URL, go to login
    if (!userId) {
      router.replace('/');
      return;
    }

    const init = async () => {
      console.log('--- DASHBOARD INIT ---', userId);

      // A. Fetch the Profile
      const { data: user, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      // --- CRITICAL FIX: SELF-HEALING ---
      // If the user was deleted from DB but LocalStorage still has the ID,
      // Supabase returns null/error. We must catch this to stop the "Loading..." stall.
      if (error || !user) {
        console.warn('⚠️ User ID invalid or deleted. Resetting app state.');

        // 1. Kill the "Fast Pass" cache
        localStorage.removeItem('prokick_user_id');
        localStorage.removeItem('prokick_line_token');

        // 2. Force redirect to Login to create a new account
        router.replace('/');
        return;
      }
      // ----------------------------------

      // B. Fetch Children & Templates (Only if user exists)
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
  }, [userId, router]);

  // ---------------------------------------------------------------------------
  // 2. DASHBOARD DATA REFRESH
  // ---------------------------------------------------------------------------
  const loadDashboardData = useCallback(async () => {
    // Don't run if profile isn't loaded yet
    if (!userId || !profile) return;

    setLoading(true);

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
  }, [userId, activeProfileId, profile]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // --- HELPERS ---
  const formatExpiryDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const formatBookingDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const getTargetName = () =>
    activeProfileId
      ? children.find((c) => c.id === activeProfileId)?.nickname || 'Child'
      : profile?.nickname || profile?.full_name || 'Myself';

  // --- ACTIONS ---

  // 1. Initiate Buy Extra
  const initiateBuyExtra = (pkg: any) => {
    setSelectedSlip(null); // Reset slip
    setModal({
      isOpen: true,
      type: 'confirm_extra',
      title: 'Top-up Extra Session',
      details: {
        id: pkg.id,
        packageName: `${pkg.package_templates.name}`,
        price: pkg.package_templates.extra_session_price,
        targetName: getTargetName(),
        sessions: 1,
      },
    });
  };

  // 2. Initiate Buy Package
  const initiateBuyPackage = (template: any) => {
    setSelectedSlip(null); // Reset slip
    setModal({
      isOpen: true,
      type: 'confirm_buy',
      title: 'Confirm Purchase',
      details: {
        id: template.id,
        packageName: template.name,
        price: template.price,
        sessions: template.session_count,
        validity: template.days_valid,
        targetName: getTargetName(),
      },
    });
  };

  // --- UNIFIED PAYMENT PROCESSOR ---
  const handlePaymentProcess = async (
    type: 'new_package' | 'extra_session',
    id: string | number,
  ) => {
    // This function will now always see the FRESH selectedSlip state
    if (!selectedSlip) {
      alert('Please upload your payment slip first.');
      return;
    }

    setProcessing(true);
    setModal((prev) => ({ ...prev, isOpen: false }));
    setShowBuyModal(false);

    // Prepare FormData
    const formData = new FormData();
    formData.append('slip', selectedSlip);
    formData.append('userId', userId!);
    formData.append('childId', activeProfileId || 'null');
    formData.append('packageId', id.toString());
    formData.append('type', type);

    // Call Server Action
    const result = await verifyAndProcessPayment(formData);

    setProcessing(false);

    if (result.success) {
      setModal({
        isOpen: true,
        type: 'success',
        title: 'Payment Verified!',
        message: result.message,
      });
      loadDashboardData();
    } else {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Verification Failed',
        message: result.message,
      });
    }
  };

  // --- Cancel Booking Logic ---
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
      action: () => processCancelBooking(booking.id), // We still use action for cancel as it has no file state
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

  // --- HANDLER FOR CONFIRM CLICK ---
  // This routes the click to the correct function with the CURRENT state
  const handleConfirmClick = () => {
    if (modal.type === 'confirm_buy' && modal.details?.id) {
      handlePaymentProcess('new_package', modal.details.id);
    } else if (modal.type === 'confirm_extra' && modal.details?.id) {
      handlePaymentProcess('extra_session', modal.details.id);
    } else if (modal.action) {
      modal.action();
    }
  };

  const isCancellable = (classDateStr: string) =>
    new Date().getTime() <
    new Date(classDateStr).getTime() - 2 * 60 * 60 * 1000;
  const now = new Date();
  const upcomingBookings = bookings.filter(
    (b) => new Date(b.class_date) >= now,
  );
  const pastBookings = bookings
    .filter((b) => new Date(b.class_date) < now)
    .reverse();
  const availableTemplates = templates.filter((t) =>
    activeProfileId ? t.type === 'junior' : t.type === 'adult',
  );

  if (!profile)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        {/* Simple Loading Screen while we check if user exists */}
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          Loading Profile...
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      {/* ... (Header, Tabs, etc. unchanged) ... */}
      <div className="max-w-5xl mx-auto space-y-8">
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
            onClick={() => {
              // Clear cache on explicit logout
              localStorage.removeItem('prokick_user_id');
              localStorage.removeItem('prokick_line_token');
            }}
          >
            Sign Out
          </Link>
        </div>

        <div className="flex space-x-1 bg-gray-200 p-1 rounded-xl overflow-x-auto shadow-inner no-scrollbar">
          <button
            onClick={() => setActiveProfileId(null)}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${activeProfileId === null ? 'bg-white text-blue-700 shadow-sm ring-1 ring-black/5' : 'text-gray-600 hover:bg-gray-300/50'}`}
          >
            👤 My Profile
          </button>
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setActiveProfileId(child.id)}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${activeProfileId === child.id ? 'bg-white text-blue-700 shadow-sm ring-1 ring-black/5' : 'text-gray-600 hover:bg-gray-300/50'}`}
            >
              👶 {child.nickname}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading data...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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

            <div className="space-y-6">
              <div className="flex items-center">
                <h2 className="text-xl font-bold text-gray-800">Schedule</h2>
              </div>
              <Link
                href={`/book?userId=${userId}${activeProfileId ? `&childId=${activeProfileId}` : ''}`}
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
                                className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase border shadow-sm ml-2 ${booking.status === 'booked' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200'}`}
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
                                  booking.class_date,
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
                              </p>
                            </div>
                          )}
                          <button
                            onClick={() => initiateCancelBooking(booking)}
                            disabled={!canCancel || processing}
                            className={`w-full text-center text-xs font-bold py-2.5 rounded-lg border transition ${canCancel ? 'border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300' : 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'}`}
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

        {/* --- MODALS --- */}
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

        {modal.isOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden transform scale-100 transition-all">
              <div
                className={`p-5 flex items-center gap-3 border-b ${modal.type?.startsWith('confirm') ? 'bg-blue-50 border-blue-100' : modal.type === 'success' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm ${modal.type?.startsWith('confirm') ? 'bg-white text-blue-600' : modal.type === 'success' ? 'bg-white text-green-600' : 'bg-white text-red-600'}`}
                >
                  {modal.type === 'success'
                    ? '✓'
                    : modal.type === 'error'
                      ? '!'
                      : '?'}
                </div>
                <div>
                  <h3
                    className={`text-lg font-bold ${modal.type === 'error' ? 'text-red-900' : 'text-gray-900'}`}
                  >
                    {modal.title}
                  </h3>
                </div>
              </div>

              <div className="p-6">
                {modal.details ? (
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
                      {modal.type === 'confirm_buy' ||
                      modal.type === 'confirm_extra' ? (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-400 uppercase">
                              Item
                            </span>
                            <span className="text-sm font-bold text-gray-900">
                              {modal.details.packageName}
                            </span>
                          </div>
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

                          <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
                            <p className="text-center text-sm font-bold text-gray-700 mb-2">
                              Scan to Pay & Upload Slip
                            </p>
                            {/* Placeholder QR */}
                            <div className="bg-gray-200 w-32 h-32 mx-auto rounded-lg flex items-center justify-center text-xs text-gray-500 mb-3">
                              [QR CODE HERE]
                            </div>

                            <label className="block">
                              <span className="sr-only">Choose slip</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  setSelectedSlip(e.target.files?.[0] || null)
                                }
                                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                              />
                            </label>
                          </div>
                        </>
                      ) : (
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
                  </div>
                ) : (
                  <p className="text-gray-600 text-center leading-relaxed">
                    {modal.message}
                  </p>
                )}
              </div>

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
                      onClick={handleConfirmClick}
                      disabled={
                        processing ||
                        ((modal.type === 'confirm_buy' ||
                          modal.type === 'confirm_extra') &&
                          !selectedSlip)
                      }
                      className={`flex-1 py-3 rounded-xl font-bold text-white shadow-md transition ${modal.type === 'confirm_cancel' ? 'bg-red-600 hover:bg-red-700' : !selectedSlip && (modal.type === 'confirm_buy' || modal.type === 'confirm_extra') ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                      {processing
                        ? 'Processing...'
                        : modal.type === 'confirm_cancel'
                          ? 'Confirm Cancel'
                          : 'Verify & Pay'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setModal({ ...modal, isOpen: false });
                      if (modal.action) modal.action();
                    }}
                    className={`w-full py-3 rounded-xl font-bold text-white shadow-md transition ${modal.type === 'success' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* HISTORY MODAL UNCHANGED */}
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
                          className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase border ${b.status === 'booked' ? 'bg-green-100 text-green-700 border-green-200' : b.status === 'cancelled' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
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
