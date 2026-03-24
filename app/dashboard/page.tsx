'use client';

import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams, useRouter } from 'next/navigation';
import { Kanit } from 'next/font/google';
import {
  Bell,
  User,
  CalendarDays,
  CreditCard,
  CalendarCheck,
  Users,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Cpu,
  X,
  AlertCircle, // Import Alert Icon for the remark
  Loader2,
  UploadCloud,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { verifyAndProcessPayment } from '../actions';

// --- FONT CONFIG ---
const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// --- TYPES ---
type ModalState = {
  isOpen: boolean;
  type: 'confirm_extra' | 'confirm_cancel' | 'success' | 'error' | null;
  title: string;
  message?: string;
  details?: any;
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
  const [bookings, setBookings] = useState<any[]>([]); // This will now hold ALL bookings

  // UI State
  const [currentPkgIdx, setCurrentPkgIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showProfileSelector, setShowProfileSelector] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState<File | null>(null);
  const slipInputRef = useRef<HTMLInputElement>(null);

  // Modal State
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: null,
    title: '',
  });

  // 1. INITIAL LOAD
  useEffect(() => {
    if (!userId) {
      router.replace('/');
      return;
    }
    const init = async () => {
      const { data: user, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error || !user) {
        localStorage.removeItem('prokick_user_id');
        localStorage.removeItem('prokick_line_token');
        router.replace('/');
        return;
      }
      const { data: kids } = await supabase
        .from('child_profiles')
        .select('*')
        .eq('parent_id', userId);
      setProfile(user);
      setChildren(kids || []);

      // Restore saved profile selection
      const savedChildId = localStorage.getItem('prokick_active_child_id');
      if (savedChildId && kids?.find((k) => k.id === savedChildId)) {
        setActiveProfileId(savedChildId);
      }
    };
    init();
  }, [userId, router]);

  // 2. DATA REFRESH (FIXED LOGIC)
  const loadDashboardData = useCallback(async () => {
    if (!userId || !profile) return;
    setLoading(true);

    const nowStr = new Date().toISOString();

    // A. Fetch Packages (Active Only)
    let pkgQuery = supabase
      .from('user_packages')
      .select(`*, package_templates (*)`)
      .eq('status', 'active')
      .gt('expiry_date', nowStr);

    if (activeProfileId) {
      pkgQuery = pkgQuery.eq('child_id', activeProfileId);
    } else {
      pkgQuery = pkgQuery.eq('user_id', userId).is('child_id', null);
    }

    // B. Fetch Bookings (ALL Future Bookings for this Profile)
    // We need package info for the card (to show which package was used), so we include it in the select
    let bookingQuery = supabase
      .from('bookings')
      .select(
        `
        *,
        classes (*, coaches(name), venues(name)),
        child_profiles(nickname),
        user_packages (
            id,
            package_templates (name)
        )
      `,
      )
      .neq('status', 'cancelled')
      .order('class_date', { ascending: true }); // Closest date first

    if (activeProfileId) {
      bookingQuery = bookingQuery.eq('child_id', activeProfileId);
    } else {
      bookingQuery = bookingQuery.eq('user_id', userId).is('child_id', null);
    }

    const [{ data: packs }, { data: books }] = await Promise.all([
      pkgQuery,
      bookingQuery,
    ]);

    setPackages(packs || []);
    setCurrentPkgIdx(0);
    setBookings(books || []); // Now contains all bookings regardless of active package
    setLoading(false);
  }, [userId, activeProfileId, profile]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // --- HELPERS ---
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const formatBookingDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('th-TH', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const now = new Date();

  // Categorize Bookings (Sorted by Date Ascending)
  const futureBookings = bookings.filter((b) => new Date(b.class_date) >= now);

  const waitlistBookings = futureBookings
    .filter((b) => b.status === 'standby')
    // Ensure sorting by date even if DB didn't perfectly (though it should)
    .sort(
      (a, b) =>
        new Date(a.class_date).getTime() - new Date(b.class_date).getTime(),
    );

  const confirmedBookings = futureBookings
    .filter((b) => b.status === 'booked')
    .sort(
      (a, b) =>
        new Date(a.class_date).getTime() - new Date(b.class_date).getTime(),
    );

  const pastBookings = bookings
    .filter((b) => new Date(b.class_date) < now)
    .reverse(); // Most recent past first

  // Carousel Logic
  const activePackage = packages[currentPkgIdx];
  const nextPackage = () => {
    if (currentPkgIdx < packages.length - 1)
      setCurrentPkgIdx((prev) => prev + 1);
  };
  const prevPackage = () => {
    if (currentPkgIdx > 0) setCurrentPkgIdx((prev) => prev - 1);
  };

  // --- ACTIONS ---
  const handleSwitchProfile = (id: string | null) => {
    if (id) localStorage.setItem('prokick_active_child_id', id);
    else localStorage.removeItem('prokick_active_child_id');
    setActiveProfileId(id);
    setShowProfileSelector(false);
  };

  const initiateBuyExtra = (pkg: any) => {
    setSelectedSlip(null);
    setModal({
      isOpen: true,
      type: 'confirm_extra',
      title: 'Top-up Extra Session',
      details: {
        id: pkg.id,
        packageName: `${pkg.package_templates.name}`,
        price: pkg.package_templates.extra_session_price,
        sessions: 1,
      },
    });
  };

  const handlePaymentProcess = async (
    type: 'extra_session',
    id: string | number,
  ) => {
    if (!selectedSlip) {
      alert('Please upload your payment slip first.');
      return;
    }
    setProcessing(true);
    setModal((prev) => ({ ...prev, isOpen: false }));

    const formData = new FormData();
    formData.append('slip', selectedSlip);
    formData.append('userId', userId!);
    formData.append('childId', activeProfileId || 'null');
    formData.append('packageId', id.toString());
    formData.append('type', type);

    const result = await verifyAndProcessPayment(formData);
    setProcessing(false);

    setModal({
      isOpen: true,
      type: result.success ? 'success' : 'error',
      title: result.success ? 'Payment Verified!' : 'Verification Failed',
      message: result.message,
    });
    if (result.success) loadDashboardData();
  };

  const handleDevBypass = async () => {
    if (!modal.details) return;
    setProcessing(true);

    const formData = new FormData();
    const dummyFile = new File(['dev_bypass'], 'dev_bypass.txt', {
      type: 'text/plain',
    });

    formData.append('slip', dummyFile);
    formData.append('userId', userId!);
    formData.append('childId', activeProfileId || 'null');
    formData.append('packageId', modal.details.id.toString());
    formData.append('type', 'extra_session');
    formData.append('dev_bypass', 'true');

    const result = await verifyAndProcessPayment(formData);
    setProcessing(false);

    setModal({
      isOpen: true,
      type: result.success ? 'success' : 'error',
      title: result.success ? 'Dev Purchase Success' : 'Dev Purchase Failed',
      message: result.message,
    });

    if (result.success) loadDashboardData();
  };

  const initiateCancelBooking = (booking: any) => {
    setModal({
      isOpen: true,
      type: 'confirm_cancel',
      title: 'ยกเลิกการจอง?',
      message: 'คุณแน่ใจหรือไม่ที่จะยกเลิกคลาสนี้?',
      details: {
        date: formatBookingDate(booking.class_date),
        time: new Date(booking.class_date).toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        location: booking.classes.venues?.name || booking.classes.location,
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
        title: 'ยกเลิกสำเร็จ',
        message: 'คืนสิทธิ์การจองเรียบร้อยแล้ว',
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

  if (!profile)
    return (
      <div className="min-h-screen flex items-center justify-center text-[#1e2e5c] font-bold">
        Loading...
      </div>
    );

  return (
    <div
      className={`min-h-screen bg-gray-50 flex justify-center ${kanit.className} overflow-hidden`}
    >
      {/* Full-screen payment verification overlay */}
      {processing && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-3xl px-10 py-10 flex flex-col items-center gap-4 shadow-2xl mx-6">
            <Loader2 size={48} className="animate-spin text-[#1e2e5c]" />
            <p className="text-[#1e2e5c] font-bold text-lg text-center">
              กำลังตรวจสอบการชำระเงิน
            </p>
            <p className="text-gray-400 text-sm text-center">
              กรุณารอสักครู่...
            </p>
          </div>
        </div>
      )}

      <div className="w-full max-w-md bg-white shadow-2xl relative flex flex-col h-screen">
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pb-24 scrollbar-hide">
          {/* Header */}
          <div className="px-6 pt-6 pb-2 flex justify-between items-center bg-white sticky top-0 z-20 backdrop-blur-sm bg-white/90">
            <div className="w-10 h-10 bg-gradient-to-tr from-[#1e2e5c] to-[#3b4d80] rounded-xl flex items-center justify-center rotate-3 shadow-lg">
              <div className="w-5 h-5 border-2 border-white/90 -rotate-3"></div>
            </div>
            <button className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors relative">
              <Bell className="text-gray-600" size={20} />
              <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
          </div>

          <div className="px-5 space-y-6 mt-2">
            {/* Profile Card with Switcher */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center text-white overflow-hidden">
                  {profile.picture_url ? (
                    <img
                      src={profile.picture_url}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={32} className="text-gray-400" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 leading-tight">
                    {activeProfileId
                      ? children.find((c) => c.id === activeProfileId)?.nickname
                      : (profile.nickname || profile.full_name)}
                  </h2>
                  <p className="text-gray-400 text-sm font-light mt-0.5">
                    {activeProfileId ? 'นักกีฬารุ่นจิ๋ว ⚽' : 'ผู้ปกครอง 👨‍👩‍👧'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowProfileSelector(true)}
                className="text-xs text-gray-600 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50 transition-colors"
              >
                สลับโปรไฟล์
              </button>
            </div>

            {/* Active Package Card (No ACTIVE Badge) */}
            {loading ? (
              <div className="bg-gray-50 rounded-2xl p-5 h-36 animate-pulse border border-gray-100"></div>
            ) : activePackage ? (
              <div className="relative">
                {packages.length > 1 && (
                  <>
                    <button
                      onClick={prevPackage}
                      disabled={currentPkgIdx === 0}
                      className={`absolute left-0 top-1/2 -translate-y-1/2 -ml-2 z-10 p-1.5 rounded-full bg-white shadow-md border border-gray-100 text-gray-600 transition-opacity ${currentPkgIdx === 0 ? 'opacity-0 pointer-events-none' : ''}`}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={nextPackage}
                      disabled={currentPkgIdx === packages.length - 1}
                      className={`absolute right-0 top-1/2 -translate-y-1/2 -mr-2 z-10 p-1.5 rounded-full bg-white shadow-md border border-gray-100 text-gray-600 transition-opacity ${currentPkgIdx === packages.length - 1 ? 'opacity-0 pointer-events-none' : ''}`}
                    >
                      <ChevronRight size={20} />
                    </button>
                  </>
                )}

                <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-lg transition-all duration-300 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-bl-full -mr-16 -mt-16"></div>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-gray-800 text-lg tracking-tight">
                        {activePackage.package_templates.name}
                      </h3>
                      {packages.length > 1 && (
                        <span className="text-[10px] text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-100">
                          {currentPkgIdx + 1}/{packages.length}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
                          Sessions Left
                        </p>
                        <p className="text-[#1e2e5c] font-black text-4xl leading-none">
                          {activePackage.remaining_sessions}{' '}
                          <span className="text-lg text-gray-400 font-normal ml-1">
                            / {activePackage.package_templates.session_count}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-gray-500 font-medium">
                          Extra:{' '}
                          <span
                            className={
                              activePackage.extra_sessions_purchased >= 2
                                ? 'text-red-500'
                                : 'text-blue-600'
                            }
                          >
                            {activePackage.extra_sessions_purchased}
                          </span>
                          /2
                        </span>
                        {activePackage.extra_sessions_purchased < 2 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              initiateBuyExtra(activePackage);
                            }}
                            className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100 transition-colors border border-indigo-100"
                          >
                            <span>+ Top-up</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <CalendarDays size={12} /> Start:{' '}
                        {formatDate(activePackage.created_at)}
                      </span>
                      <span className="flex items-center gap-1 font-medium text-gray-500">
                        Exp: {formatDate(activePackage.expiry_date)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center hover:border-blue-300 transition-colors">
                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-500">
                  <CreditCard size={24} />
                </div>
                <p className="text-gray-500 text-sm font-medium mb-4">
                  ยังไม่มีแพ็กเกจที่ใช้งานอยู่
                </p>
                <button
                  onClick={() =>
                    router.push(
                      `/packages?userId=${userId}${activeProfileId ? `&childId=${activeProfileId}` : ''}`,
                    )
                  }
                  className="text-white bg-[#1e2e5c] px-6 py-2 rounded-lg text-sm font-bold shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all"
                >
                  ซื้อแพ็กเกจเลย
                </button>
              </div>
            )}

            <button
              onClick={() =>
                router.push(
                  `/book?userId=${userId}${activeProfileId ? `&childId=${activeProfileId}` : ''}`,
                )
              }
              className="w-full bg-gradient-to-r from-[#1e2e5c] to-[#2b4185] text-white rounded-2xl py-4 px-6 flex items-center justify-between shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 group"
            >
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2.5 rounded-xl group-hover:bg-white/30 transition-colors">
                  <CalendarCheck size={22} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-base tracking-wide leading-tight">
                    จองคลาสเรียน
                  </p>
                  <p className="text-blue-200 text-xs mt-0.5">
                    เลือกวันและเวลาที่ต้องการ
                  </p>
                </div>
              </div>
              <ChevronRight size={20} className="text-white/60 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* --- BOOKING SECTIONS (Reordered) --- */}

            {/* 1. Upcoming Bookings Section */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  การจองที่กำลังมาถึง
                  {confirmedBookings.length > 0 && (
                    <span className="bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                      {confirmedBookings.length}
                    </span>
                  )}
                </h3>
                {pastBookings.length > 0 && (
                  <button
                    onClick={() => setShowHistoryModal(true)}
                    className="text-xs font-semibold text-gray-400 hover:text-[#1e2e5c] flex items-center gap-1 transition-colors"
                  >
                    ดูประวัติ <ChevronRight size={14} />
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {confirmedBookings.length === 0 ? (
                  <div className="text-center py-10 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                    <p className="text-gray-400 text-sm">
                      ไม่มีรายการจองเร็วๆ นี้
                    </p>
                  </div>
                ) : (
                  confirmedBookings.map((b) => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      // This assumes you want to show the package name used for THIS specific booking
                      // If the package is expired or gone, it still shows the name from historical data
                      activePackage={b.user_packages}
                      onCancel={() => initiateCancelBooking(b)}
                      processing={processing}
                    />
                  ))
                )}
              </div>
            </div>

            {/* 2. Waitlist Section */}
            {waitlistBookings.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                  แจ้งเตือนสถานะการรอคิว
                  <span className="bg-yellow-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                    {waitlistBookings.length}
                  </span>
                </h3>
                <div className="space-y-4">
                  {waitlistBookings.map((b) => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      activePackage={b.user_packages}
                      onCancel={() => initiateCancelBooking(b)}
                      processing={processing}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Shared Bottom Nav */}
        <BottomNav />

        {/* --- MODALS --- */}

        {/* Profile Switcher */}
        {showProfileSelector && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  เลือกโปรไฟล์
                </h3>
                <button
                  onClick={() => setShowProfileSelector(false)}
                  className="p-1 bg-gray-100 rounded-full"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() => handleSwitchProfile(null)}
                  className={`w-full flex items-center gap-4 p-3 rounded-xl border transition-all ${!activeProfileId ? 'border-[#1e2e5c] bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}
                >
                  <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
                    <User size={20} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-gray-900">
                      {profile?.nickname || profile?.full_name}
                    </p>
                    <p className="text-xs text-gray-500">ผู้ปกครอง</p>
                  </div>
                  {!activeProfileId && (
                    <CheckCircle2
                      className="ml-auto text-[#1e2e5c]"
                      size={20}
                    />
                  )}
                </button>
                {children.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => handleSwitchProfile(child.id)}
                    className={`w-full flex items-center gap-4 p-3 rounded-xl border transition-all ${activeProfileId === child.id ? 'border-[#1e2e5c] bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}
                  >
                    <div className="w-10 h-10 bg-[#c9b038] rounded-full flex items-center justify-center text-white font-bold">
                      {child.nickname?.[0]}
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-gray-900">
                        {child.nickname}
                      </p>
                      <p className="text-xs text-gray-500">นักเรียน</p>
                    </div>
                    {activeProfileId === child.id && (
                      <CheckCircle2
                        className="ml-auto text-[#1e2e5c]"
                        size={20}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Action Modal */}
        {modal.isOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6">
              <h3 className="text-xl font-bold mb-4 font-['Kanit'] text-gray-900">
                {modal.title}
              </h3>
              {modal.type?.startsWith('confirm') ? (
                <>
                  {modal.type === 'confirm_extra' && (
                    <div className="space-y-2 mb-4 text-sm">
                      <div className="flex justify-between">
                        <span>สินค้า</span>
                        <span className="font-bold">
                          {modal.details?.packageName}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>ราคา</span>
                        <span className="font-bold text-[#1e2e5c]">
                          ฿{modal.details?.price?.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-4">
                        <p className="text-xs font-bold text-gray-500 mb-2">
                          แนบสลิป
                        </p>
                        <input
                          ref={slipInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            setSelectedSlip(e.target.files?.[0] || null)
                          }
                        />
                        <button
                          type="button"
                          onClick={() => slipInputRef.current?.click()}
                          className={`w-full py-3 px-4 rounded-xl border-2 border-dashed text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                            selectedSlip
                              ? 'border-[#1e2e5c] bg-blue-50 text-[#1e2e5c]'
                              : 'border-gray-300 bg-gray-50 text-gray-400 hover:border-[#1e2e5c] hover:text-[#1e2e5c] hover:bg-blue-50'
                          }`}
                        >
                          {selectedSlip ? (
                            <>
                              <CheckCircle2 size={16} className="shrink-0 text-green-500" />
                              <span className="truncate">{selectedSlip.name}</span>
                            </>
                          ) : (
                            <>
                              <UploadCloud size={16} className="shrink-0" />
                              <span>แตะเพื่อแนบสลิป</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                  {modal.type === 'confirm_cancel' && (
                    <p className="text-gray-600 mb-6">{modal.message}</p>
                  )}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setModal({ ...modal, isOpen: false })}
                        className="flex-1 py-3 rounded-xl border font-bold text-gray-500"
                      >
                        ยกเลิก
                      </button>
                      <button
                        onClick={() => {
                          if (modal.type === 'confirm_extra')
                            handlePaymentProcess(
                              'extra_session',
                              modal.details.id,
                            );
                          else if (modal.action) modal.action();
                        }}
                        className={`flex-1 py-3 rounded-xl font-bold text-white transition-all ${
                          modal.type === 'confirm_cancel'
                            ? 'bg-red-500'
                            : modal.type === 'confirm_extra' && !selectedSlip
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : 'bg-[#1e2e5c]'
                        }`}
                        disabled={
                          modal.type === 'confirm_extra' && !selectedSlip
                        }
                      >
                        ยืนยัน
                      </button>
                    </div>
                    {modal.type === 'confirm_extra' && (
                      <button
                        onClick={handleDevBypass}
                        disabled={processing}
                        className="w-full py-2 rounded-xl bg-orange-100 text-orange-700 font-bold text-xs flex items-center justify-center gap-2"
                      >
                        <Cpu size={14} /> Dev Buy (Bypass Slip)
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <p className="mb-6 text-gray-600">{modal.message}</p>
                  <button
                    onClick={() => {
                      setModal({ ...modal, isOpen: false });
                      if (modal.type === 'success') window.location.reload();
                    }}
                    className="w-full py-3 bg-[#1e2e5c] text-white rounded-xl font-bold"
                  >
                    ตกลง
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History Modal */}
        {showHistoryModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full max-h-[70vh] flex flex-col shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-xl text-gray-900">
                  ประวัติการจอง
                </h3>
                <button onClick={() => setShowHistoryModal(false)}>
                  <CheckCircle2
                    className="rotate-180 text-gray-500"
                    size={18}
                  />
                </button>
              </div>
              <div className="overflow-y-auto space-y-3 flex-1 pr-1 custom-scrollbar">
                {pastBookings.length === 0 ? (
                  <p className="text-gray-400 text-center">ไม่มีประวัติ</p>
                ) : (
                  pastBookings.map((b) => (
                    <div
                      key={b.id}
                      className="text-xs border border-gray-100 p-4 rounded-xl flex justify-between items-center"
                    >
                      <div>
                        <div className="font-bold text-gray-800 text-sm mb-0.5">
                          {formatBookingDate(b.class_date)}
                        </div>
                        <div className="text-gray-500">
                          {b.classes.venues?.name || b.classes.location}
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg font-bold ${b.status === 'booked' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                      >
                        {b.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper Component for Booking Cards (to avoid code duplication)
const BookingCard = ({ booking, activePackage, onCancel, processing }: any) => {
  const isStandby = booking.status === 'standby';
  const canCancel =
    new Date().getTime() <
    new Date(booking.class_date).getTime() - 2 * 60 * 60 * 1000;

  // Time helpers
  const formatBookingDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('th-TH', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const getBookingTimeRange = (booking: any) => {
    const start = new Date(booking.classes.start_time);
    const end = new Date(booking.classes.end_time);
    const format = (d: Date) =>
      d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return `${format(start)} - ${format(end)} น.`;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 ${isStandby ? 'bg-yellow-400' : 'bg-[#1e2e5c]'}`}
      ></div>
      <div className="flex justify-between items-start mb-4 pl-2">
        <div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide mb-1 inline-block ${isStandby ? 'bg-yellow-50 text-yellow-700' : 'bg-blue-50 text-blue-700'}`}
          >
            {isStandby ? 'Waitlist' : 'Confirmed'}
          </span>
          <h4 className="font-bold text-gray-800 text-base">
            {activePackage?.package_templates?.name || 'Football Session'}
          </h4>
        </div>
        {isStandby && (
          <div className="text-center bg-yellow-100 text-yellow-800 rounded-lg px-2 py-1">
            <span className="block text-[10px] font-bold uppercase">Queue</span>
            <span className="block text-lg font-black leading-none">
              #{booking.standby_order}
            </span>
          </div>
        )}
      </div>

      {/* UPDATED: Detailed Info with Labels */}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm text-gray-600 mb-4 pl-2">
        <span className="font-medium text-gray-500">วัน:</span>
        <span className="text-gray-700 font-medium">
          {formatBookingDate(booking.class_date)}
        </span>

        <span className="font-medium text-gray-500">เวลา:</span>
        <span className="text-gray-700">{getBookingTimeRange(booking)}</span>

        <span className="font-medium text-gray-500">สนาม:</span>
        <span className="text-gray-700">{booking.classes.venues?.name || booking.classes.location}</span>

        <span className="font-medium text-gray-500">โค้ช:</span>
        <span className="text-gray-700">
          {booking.classes.coaches?.name || 'Coach'}
        </span>
      </div>

      {/* Button & Remark Section */}
      <div className="space-y-2">
        <button
          onClick={onCancel}
          disabled={!canCancel || processing}
          className={`w-full font-bold py-3 rounded-xl text-xs transition-all duration-200 border ${canCancel ? 'bg-white hover:bg-red-50 text-gray-500 hover:text-red-600 border-gray-200 hover:border-red-200 shadow-sm hover:shadow' : 'bg-gray-50 text-gray-300 border-transparent cursor-not-allowed'}`}
        >
          {canCancel ? 'จัดการ' : 'ยกเลิกไม่ได้ (ใกล้เวลาเรียน)'}
        </button>

        {/* Added Remark */}
        {canCancel && (
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-red-400 font-light">
            <AlertCircle size={10} />
            <span>สามารถยกเลิกได้ก่อนเริ่มคลาส 2 ชั่วโมง</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-[#1e2e5c] font-bold">
          Loading...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
