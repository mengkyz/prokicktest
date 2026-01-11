'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams, useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// --- TYPES ---
type ModalState = {
  isOpen: boolean;
  type: 'confirm' | 'success' | 'standby_success' | 'error' | null;
  title: string;
  message?: string;
  details?: {
    date: string;
    time: string;
    location: string;
    packageName?: string;
    queuePosition?: number;
  };
  action?: () => void;
};

function BookSessionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const userId = searchParams.get('userId');
  const childId = searchParams.get('childId');

  // Data State
  const [classes, setClasses] = useState<any[]>([]);
  const [activePackages, setActivePackages] = useState<any[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
    null
  );

  // Status State
  const [standbyCounts, setStandbyCounts] = useState<Record<string, number>>(
    {}
  );
  const [userBookings, setUserBookings] = useState<Record<string, string>>({});

  // User Info State
  const [childName, setChildName] = useState<string>('');
  const [parentName, setParentName] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Modal State
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: null,
    title: '',
  });

  // 1. Initial Fetch
  useEffect(() => {
    if (!userId) return;

    const init = async () => {
      setLoading(true);

      // A. Get Future Classes
      const { data: classData } = await supabase
        .from('classes')
        .select('*')
        .gt('start_time', new Date().toISOString())
        .order('start_time');

      setClasses(classData || []);

      // B. Get Standby Counts
      const { data: standbyData } = await supabase
        .from('bookings')
        .select('class_id')
        .eq('status', 'standby')
        .gt('class_date', new Date().toISOString());

      const counts: Record<string, number> = {};
      if (standbyData) {
        standbyData.forEach((b: any) => {
          counts[b.class_id] = (counts[b.class_id] || 0) + 1;
        });
      }
      setStandbyCounts(counts);

      // C. Get User's EXISTING Bookings
      let bookingQuery = supabase
        .from('bookings')
        .select('class_id, status')
        .neq('status', 'cancelled')
        .gt('class_date', new Date().toISOString());

      if (childId) {
        bookingQuery = bookingQuery.eq('child_id', childId);
      } else {
        bookingQuery = bookingQuery.eq('user_id', userId).is('child_id', null);
      }

      const { data: myBookings } = await bookingQuery;
      const myBookingMap: Record<string, string> = {};
      if (myBookings) {
        myBookings.forEach((b: any) => {
          myBookingMap[b.class_id] = b.status;
        });
      }
      setUserBookings(myBookingMap);

      // D. Get Active Packages & User Info
      let pkgQuery = supabase
        .from('user_packages')
        .select('*, package_templates(name)')
        .eq('status', 'active')
        .gt('remaining_sessions', 0);

      if (childId) {
        const { data: child } = await supabase
          .from('child_profiles')
          .select('nickname')
          .eq('id', childId)
          .single();
        if (child) setChildName(child.nickname);
        pkgQuery = pkgQuery.eq('child_id', childId);
      } else {
        const { data: parent } = await supabase
          .from('profiles')
          .select('full_name, nickname')
          .eq('id', userId)
          .single();
        if (parent) setParentName(parent.nickname || parent.full_name);
        pkgQuery = pkgQuery.eq('user_id', userId).is('child_id', null);
      }

      const { data: pkgData } = await pkgQuery;
      const packs = pkgData || [];
      setActivePackages(packs);

      if (packs.length === 1) setSelectedPackageId(packs[0].id);

      setLoading(false);
    };
    init();
  }, [userId, childId]);

  // --- Helpers: Date Formatters (MATCHING DASHBOARD) ---

  // Format: "Tue, 13 Jan 2026"
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'short', // 'Tue'
      day: 'numeric', // '13'
      month: 'short', // 'Jan'
      year: 'numeric', // '2026'
    });
  };

  const formatPackageDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 2. Handle Booking Flow
  const initiateBooking = (cls: any) => {
    if (!selectedPackageId) {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'No Package Selected',
        message: 'Please select a package to use for this booking.',
      });
      return;
    }

    const selectedPkg = activePackages.find((p) => p.id === selectedPackageId);
    const isStandby = cls.current_bookings >= cls.max_capacity;

    setModal({
      isOpen: true,
      type: 'confirm',
      title: isStandby ? 'Join Standby List' : 'Confirm Booking',
      message: isStandby
        ? 'This class is currently full. Joining the standby list does not deduct a session immediately.'
        : 'Please review the details below before confirming.',
      details: {
        date: formatDate(cls.start_time),
        time: formatTime(cls.start_time),
        location: cls.location,
        packageName: selectedPkg?.package_templates.name,
        queuePosition: isStandby ? (standbyCounts[cls.id] || 0) + 1 : undefined,
      },
      action: () => processBooking(cls.id, cls),
    });
  };

  const processBooking = async (classId: string, cls: any) => {
    setModal((prev) => ({ ...prev, isOpen: false }));
    setProcessing(true);

    const { data, error } = await supabase.rpc('book_class', {
      p_user_id: userId,
      p_child_id: childId || null,
      p_package_id: selectedPackageId,
      p_class_id: classId,
    });

    setProcessing(false);

    if (error) {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Booking Failed',
        message: error.message,
      });
    } else if (data.success) {
      const isStandby = data.status === 'standby';

      setModal({
        isOpen: true,
        type: isStandby ? 'standby_success' : 'success',
        title: isStandby ? 'Added to Waitlist' : 'Booking Confirmed!',
        details: {
          date: formatDate(cls.start_time),
          time: formatTime(cls.start_time),
          location: cls.location,
          queuePosition: data.queue_position,
        },
        action: () => router.push(`/dashboard?userId=${userId}`),
      });
    } else {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Booking Failed',
        message: data.message,
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Book a Session</h1>
            <p className="text-gray-500 text-sm mt-1">
              For:{' '}
              <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                {childName || parentName || 'Loading...'}
              </span>
            </p>
          </div>
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
          </button>
        </div>

        {/* PACKAGE SELECTOR */}
        {loading ? (
          <div className="text-center py-10 text-gray-400 animate-pulse">
            Loading packages...
          </div>
        ) : activePackages.length === 0 ? (
          <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center">
            <p className="text-red-600 font-bold">
              ⚠ No active packages found.
            </p>
            <button
              onClick={() => router.back()}
              className="mt-4 bg-white border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm font-bold shadow-sm"
            >
              Go Back to Dashboard
            </button>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              Select Package
            </h2>
            <div className="space-y-3">
              {activePackages.map((pkg) => (
                <div
                  key={pkg.id}
                  onClick={() => setSelectedPackageId(pkg.id)}
                  className={`relative flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all group
                    ${
                      selectedPackageId === pkg.id
                        ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                        : 'border-gray-100 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
                      ${
                        selectedPackageId === pkg.id
                          ? 'border-blue-600'
                          : 'border-gray-300'
                      }`}
                    >
                      {selectedPackageId === pkg.id && (
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">
                        {pkg.package_templates.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        Exp: {formatPackageDate(pkg.expiry_date)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block font-black text-blue-600 text-xl">
                      {pkg.remaining_sessions}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">
                      Sessions
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CLASS LIST */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 pl-1">
            Upcoming Classes
          </h2>

          {classes.length === 0 ? (
            <div className="text-center text-gray-400 py-12 bg-white rounded-2xl border border-dashed border-gray-200">
              No classes scheduled yet.
            </div>
          ) : (
            classes.map((cls) => {
              const isFull = cls.current_bookings >= cls.max_capacity;
              const queueSize = standbyCounts[cls.id] || 0;
              const myStatus = userBookings[cls.id];
              const isAlreadyBooked = !!myStatus;

              return (
                <div
                  key={cls.id}
                  className={`bg-white p-5 rounded-2xl shadow-sm border transition relative overflow-hidden
                  ${
                    isAlreadyBooked
                      ? 'border-gray-100 opacity-80'
                      : 'border-gray-100 hover:border-blue-200 hover:shadow-md'
                  }`}
                >
                  {isAlreadyBooked && (
                    <div
                      className={`absolute top-0 left-0 w-1.5 h-full ${
                        myStatus === 'booked' ? 'bg-green-500' : 'bg-yellow-400'
                      }`}
                    />
                  )}

                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="pl-2">
                      <div className="flex items-center gap-3 mb-1">
                        {/* UPDATED: Full Date with Short Weekday (Matches Dashboard) */}
                        <span className="font-bold text-lg text-gray-800">
                          {formatDate(cls.start_time)}
                        </span>
                      </div>
                      <p className="text-gray-500 text-sm flex items-center gap-3">
                        <span className="font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-xs">
                          ⏰ {formatTime(cls.start_time)}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span>📍 {cls.location}</span>
                      </p>

                      <div className="mt-3 flex items-center gap-3">
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded-md border
                          ${
                            isFull
                              ? 'text-orange-700 bg-orange-50 border-orange-100'
                              : 'text-blue-700 bg-blue-50 border-blue-100'
                          }`}
                        >
                          {cls.current_bookings}/{cls.max_capacity} Booked
                        </span>

                        {isFull && (
                          <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                            <span>👥 {queueSize} waiting</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => initiateBooking(cls)}
                      disabled={
                        isAlreadyBooked || processing || !selectedPackageId
                      }
                      className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm transition shadow-sm border
                        ${
                          isAlreadyBooked
                            ? myStatus === 'booked'
                              ? 'bg-green-50 text-green-700 border-green-200 cursor-default'
                              : 'bg-yellow-50 text-yellow-700 border-yellow-200 cursor-default'
                            : !selectedPackageId || processing
                            ? 'bg-gray-100 text-gray-400 border-transparent cursor-not-allowed'
                            : isFull
                            ? 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50 hover:border-orange-300'
                            : 'bg-blue-600 text-white border-transparent hover:bg-blue-700 hover:shadow-md'
                        }`}
                    >
                      {processing
                        ? 'Processing...'
                        : isAlreadyBooked
                        ? myStatus === 'booked'
                          ? '✅ Booked'
                          : '⏳ On Waitlist'
                        : isFull
                        ? 'Join Standby'
                        : 'Book Session'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* --- PROFESSIONAL MODAL SYSTEM (Unified with Dashboard) --- */}
        {modal.isOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transform scale-100 transition-all">
              {/* Header */}
              <div
                className={`p-5 flex items-center gap-3 border-b
                ${
                  modal.type === 'confirm' && modal.title.includes('Standby')
                    ? 'bg-orange-50 border-orange-100'
                    : modal.type === 'confirm'
                    ? 'bg-blue-50 border-blue-100'
                    : modal.type === 'standby_success'
                    ? 'bg-orange-50 border-orange-100'
                    : modal.type === 'success'
                    ? 'bg-green-50 border-green-100'
                    : 'bg-red-50 border-red-100'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm
                  ${
                    modal.type === 'confirm' && modal.title.includes('Standby')
                      ? 'bg-white text-orange-600'
                      : modal.type === 'confirm'
                      ? 'bg-white text-blue-600'
                      : modal.type === 'standby_success'
                      ? 'bg-white text-orange-600'
                      : modal.type === 'success'
                      ? 'bg-white text-green-600'
                      : 'bg-white text-red-600'
                  }`}
                >
                  {modal.type === 'success'
                    ? '✓'
                    : modal.type === 'standby_success'
                    ? '⏳'
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
                    {/* Ticket Details Card */}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
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
                    </div>

                    {modal.details.packageName && (
                      <div className="flex justify-between items-center px-2">
                        <span className="text-sm text-gray-500">
                          Package Used:
                        </span>
                        <span className="text-sm font-bold text-blue-600">
                          {modal.details.packageName}
                        </span>
                      </div>
                    )}

                    {/* Status Info Box */}
                    {modal.details.queuePosition ? (
                      <div className="bg-orange-50 text-orange-800 text-sm p-3 rounded-lg text-center font-medium border border-orange-100">
                        You will be{' '}
                        <strong>#{modal.details.queuePosition}</strong> in the
                        Waiting List.
                      </div>
                    ) : (
                      modal.type === 'confirm' && (
                        <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded-lg text-center font-medium border border-blue-100">
                          Session will be deducted upon confirmation.
                        </div>
                      )
                    )}

                    {modal.message && (
                      <p className="text-center text-gray-500 text-xs mt-2">
                        {modal.message}
                      </p>
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
                {modal.type === 'confirm' ? (
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
                          modal.title.includes('Standby')
                            ? 'bg-orange-500 hover:bg-orange-600'
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                    >
                      Confirm
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
                        modal.type === 'standby_success'
                          ? 'bg-orange-500 hover:bg-orange-600'
                          : modal.type === 'success'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BookSession() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-blue-600 font-bold">
          Loading ProKick...
        </div>
      }
    >
      <BookSessionContent />
    </Suspense>
  );
}
