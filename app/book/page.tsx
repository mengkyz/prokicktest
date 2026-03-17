'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams, useRouter } from 'next/navigation';
import { Kanit } from 'next/font/google';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  MapPin,
  UserCircle2,
  Users,
  User,
  CheckCircle2,
  X,
  CreditCard,
  RefreshCw,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';

const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type ModalState = {
  isOpen: boolean;
  type: 'confirm' | 'success' | 'standby_success' | 'error' | null;
  title: string;
  message?: string;
  details?: any;
  action?: () => void;
};

function BookSessionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const userId = searchParams.get('userId');
  const childId = searchParams.get('childId');

  // --- DATA STATE ---
  const [profile, setProfile] = useState<any>(null); // Current Active Profile
  const [children, setChildren] = useState<any[]>([]); // For Switcher
  const [parentProfile, setParentProfile] = useState<any>(null); // For Switcher

  const [classes, setClasses] = useState<any[]>([]);
  const [activePackages, setActivePackages] = useState<any[]>([]);

  // --- UI SELECTION STATE ---
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedField, setSelectedField] = useState<string>('all');
  const [showProfileSelector, setShowProfileSelector] = useState(false);

  // --- STATUS STATE ---
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [standbyCounts, setStandbyCounts] = useState<Record<string, number>>(
    {},
  );
  const [userBookings, setUserBookings] = useState<Record<string, string>>({}); // ClassID -> Status

  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: null,
    title: '',
  });

  // 1. INITIAL LOAD & PROFILE SYNC
  useEffect(() => {
    if (!userId) return;

    // Restore saved profile if no childId in URL
    const savedChildId = localStorage.getItem('prokick_active_child_id');
    if (!childId && savedChildId) {
      router.replace(`/book?userId=${userId}&childId=${savedChildId}`);
      return;
    }

    const init = async () => {
      setLoading(true);

      // A. Fetch Parent & Children (For Switcher)
      const { data: parent } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      const { data: kids } = await supabase
        .from('child_profiles')
        .select('*')
        .eq('parent_id', userId);

      setParentProfile(parent);
      setChildren(kids || []);

      // B. Determine Current Active Profile
      if (childId) {
        const activeChild = kids?.find((k) => k.id === childId);
        setProfile(activeChild || parent); // Fallback to parent if child id invalid
      } else {
        setProfile(parent);
      }

      // C. Fetch Data for Current Profile context
      await fetchDataForContext(childId);

      setLoading(false);
    };
    init();
  }, [userId, childId]);

  // 2. FETCH DATA HELPER
  const fetchDataForContext = async (currentChildId: string | null) => {
    // Classes (All future)
    const { data: classData } = await supabase
      .from('classes')
      .select('*')
      .gt('start_time', new Date().toISOString())
      .order('start_time');
    setClasses(classData || []);

    // Standby Counts
    const { data: standbyData } = await supabase
      .from('bookings')
      .select('class_id')
      .eq('status', 'standby')
      .gt('class_date', new Date().toISOString());
    const counts: Record<string, number> = {};
    standbyData?.forEach(
      (b: any) => (counts[b.class_id] = (counts[b.class_id] || 0) + 1),
    );
    setStandbyCounts(counts);

    // User's Existing Bookings (Prevent double booking same slot)
    let bookingQuery = supabase
      .from('bookings')
      .select('class_id, status')
      .neq('status', 'cancelled')
      .gt('class_date', new Date().toISOString());
    if (currentChildId)
      bookingQuery = bookingQuery.eq('child_id', currentChildId);
    else bookingQuery = bookingQuery.eq('user_id', userId).is('child_id', null);

    const { data: myBookings } = await bookingQuery;
    const myBookingMap: Record<string, string> = {};
    myBookings?.forEach((b: any) => (myBookingMap[b.class_id] = b.status));
    setUserBookings(myBookingMap);

    // Active Packages for this Profile
    const nowStr = new Date().toISOString();
    let pkgQuery = supabase
      .from('user_packages')
      .select('*, package_templates(name)')
      .eq('status', 'active')
      .gt('remaining_sessions', 0)
      .gt('expiry_date', nowStr);
    if (currentChildId) pkgQuery = pkgQuery.eq('child_id', currentChildId);
    else pkgQuery = pkgQuery.eq('user_id', userId).is('child_id', null);

    const { data: pkgData } = await pkgQuery;
    const packs = pkgData || [];
    setActivePackages(packs);
    if (packs.length > 0) setSelectedPackageId(packs[0].id);
    else setSelectedPackageId('');
  };

  // --- ACTIONS ---
  const handleSwitchProfile = (newId: string | null) => {
    if (newId) localStorage.setItem('prokick_active_child_id', newId);
    else localStorage.removeItem('prokick_active_child_id');
    const params = new URLSearchParams(searchParams.toString());
    if (newId) params.set('childId', newId);
    else params.delete('childId');
    router.replace(`/book?${params.toString()}`);
    setShowProfileSelector(false);
  };

  const initiateBooking = (cls: any) => {
    if (!selectedPackageId) {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'ไม่พบแพ็กเกจ',
        message: 'กรุณาเลือกหรือซื้อแพ็กเกจก่อนทำการจอง',
      });
      return;
    }

    const selectedPkg = activePackages.find((p) => p.id === selectedPackageId);
    const isStandby = cls.current_bookings >= cls.max_capacity;
    const currentQueue = standbyCounts[cls.id] || 0;

    setModal({
      isOpen: true,
      type: 'confirm',
      title: isStandby ? 'ยืนยันการต่อคิว' : 'ยืนยันการจอง',
      details: {
        date: new Date(cls.start_time).toLocaleDateString('th-TH'),
        time: formatTimeRange(cls.start_time),
        location: cls.location,
        packageName: selectedPkg?.package_templates.name,
        queuePosition: isStandby ? currentQueue + 1 : undefined,
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

    if (error || !data.success) {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'การจองล้มเหลว',
        message: error?.message || data?.message,
      });
    } else {
      const isStandby = data.status === 'standby';
      setModal({
        isOpen: true,
        type: isStandby ? 'standby_success' : 'success',
        title: isStandby ? 'ลงชื่อสำรองสำเร็จ' : 'จองสำเร็จ!',
        details: {
          date: new Date(cls.start_time).toLocaleDateString('th-TH'),
          time: formatTimeRange(cls.start_time),
          location: cls.location,
          queuePosition: data.queue_position,
        },
        action: () => window.location.reload(),
      });
    }
  };

  // --- FILTER LOGIC ---
  const isSameDay = (d1: Date, d2: Date) =>
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear();
  const formatTimeRange = (dateStr: string) => {
    const start = new Date(dateStr);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return `${start.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
  };

  // 1. Filter by Date
  const dateClasses = classes.filter((c) =>
    isSameDay(new Date(c.start_time), selectedDate),
  );

  // 2. Get Unique Fields for Dropdown from Date-Filtered Classes
  const availableFields = Array.from(
    new Set(dateClasses.map((c) => c.location)),
  );

  // 3. Filter by Selected Field
  const displayClasses =
    selectedField === 'all'
      ? dateClasses
      : dateClasses.filter((c) => c.location === selectedField);

  // Calendar
  const daysInMonth = Array.from(
    {
      length: new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        0,
      ).getDate(),
    },
    (_, i) =>
      new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1),
  );

  return (
    <div
      className={`min-h-screen bg-gray-50 flex justify-center ${kanit.className}`}
    >
      <div className="w-full max-w-md bg-white shadow-2xl relative flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center sticky top-0 bg-white z-20 shadow-sm">
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 text-gray-800 hover:bg-gray-100 rounded-full"
          >
            <ChevronLeft size={28} />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-gray-900 pr-8">
            จองคลาส
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-24 scrollbar-hide px-4 space-y-6 pt-4">
          {/* 1. Profile Section */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#c9b038] rounded-full flex items-center justify-center text-white overflow-hidden">
                {profile?.picture_url ? (
                  <img
                    src={profile.picture_url}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User size={20} />
                )}
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">
                  {profile?.nickname || profile?.full_name}
                </h2>
                <p className="text-gray-500 text-[10px]">
                  {childId ? 'นักเรียน' : 'ผู้ปกครอง'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowProfileSelector(true)}
              className="text-xs text-blue-600 font-medium border border-blue-100 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1"
            >
              <RefreshCw size={12} /> สลับโปรไฟล์
            </button>
          </div>

          {/* 2. Package Selector */}
          <div>
            <label className="text-xs text-gray-500 font-light mb-1.5 block">
              เลือกแพ็กเกจที่จะใช้
            </label>
            {activePackages.length > 0 ? (
              <div className="relative">
                <select
                  value={selectedPackageId}
                  onChange={(e) => setSelectedPackageId(e.target.value)}
                  className="w-full appearance-none bg-white border border-[#1e2e5c] text-[#1e2e5c] font-medium rounded-xl py-3 px-4 pr-10 focus:outline-none shadow-sm text-sm"
                >
                  {activePackages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.package_templates.name} (เหลือ{' '}
                      {pkg.remaining_sessions} ครั้ง)
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1e2e5c] pointer-events-none"
                  size={18}
                />
              </div>
            ) : (
              <div
                onClick={() =>
                  router.push(
                    `/packages?userId=${userId}${childId ? `&childId=${childId}` : ''}`,
                  )
                }
                className="border border-dashed border-gray-300 rounded-xl p-3 flex items-center justify-center gap-2 text-gray-400 cursor-pointer hover:bg-gray-50"
              >
                <CreditCard size={16} />{' '}
                <span>ไม่มีแพ็กเกจ (คลิกเพื่อซื้อ)</span>
              </div>
            )}
          </div>

          {/* 3. Calendar */}
          <div className="border border-gray-100 rounded-2xl shadow-sm p-4 bg-white">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() =>
                  setCurrentMonth(
                    new Date(
                      currentMonth.setMonth(currentMonth.getMonth() - 1),
                    ),
                  )
                }
                className="p-1 text-gray-400"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-gray-800 font-bold text-base">
                {currentMonth.toLocaleDateString('th-TH', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              <button
                onClick={() =>
                  setCurrentMonth(
                    new Date(
                      currentMonth.setMonth(currentMonth.getMonth() + 1),
                    ),
                  )
                }
                className="p-1 text-gray-400"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <div className="grid grid-cols-7 text-center mb-2">
              {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((day, i) => (
                <div key={i} className="text-xs text-gray-400 font-light">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-3 gap-x-1 text-center text-sm">
              {Array.from({
                length: new Date(
                  currentMonth.getFullYear(),
                  currentMonth.getMonth(),
                  1,
                ).getDay(),
              }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {daysInMonth.map((day) => {
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                const hasClass = classes.some((c) =>
                  isSameDay(new Date(c.start_time), day),
                );
                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => {
                      setSelectedDate(day);
                      setSelectedField('all');
                    }}
                    className="relative flex flex-col items-center cursor-pointer"
                  >
                    <div
                      className={`w-8 h-8 flex items-center justify-center rounded-lg font-medium transition-colors ${isSelected ? 'bg-[#1e2e5c] text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'} ${isToday && !isSelected ? 'border border-[#1e2e5c] text-[#1e2e5c]' : ''}`}
                    >
                      {day.getDate()}
                    </div>
                    {hasClass && !isSelected && (
                      <div className="absolute -bottom-1 w-1 h-1 bg-red-400 rounded-full"></div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Branch Filter (Dynamic) */}
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-light">สนาม</label>
            <div className="relative">
              <select
                value={selectedField}
                onChange={(e) => setSelectedField(e.target.value)}
                className="w-full appearance-none bg-white border border-gray-100 rounded-xl py-3 px-4 pr-10 text-gray-800 text-sm font-medium shadow-sm focus:outline-none"
                disabled={availableFields.length === 0}
              >
                <option value="all">ทั้งหมด ({dateClasses.length} คลาส)</option>
                {availableFields.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                size={18}
              />
            </div>
          </div>

          {/* 5. Class List */}
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-3">
              คลาสวันที่ {selectedDate.getDate()}{' '}
              {selectedDate.toLocaleDateString('th-TH', { month: 'long' })}
            </h2>
            <div className="space-y-3 pb-20">
              {loading ? (
                <div className="text-center py-10 text-gray-400">
                  กำลังโหลด...
                </div>
              ) : displayClasses.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl bg-gray-50">
                  <p className="text-gray-400 text-sm">ไม่มีคลาสเรียน</p>
                </div>
              ) : (
                displayClasses.map((cls) => {
                  const isFull = cls.current_bookings >= cls.max_capacity;
                  const myBookingStatus = userBookings[cls.id]; // 'booked' or 'standby'
                  const isWaitlist =
                    myBookingStatus === 'standby' ||
                    (!myBookingStatus && isFull);
                  const queuePos = standbyCounts[cls.id] || 0;

                  // Logic: Disable if user already has ANY status for this class (booked or standby)
                  const isDisabled = processing || !!myBookingStatus;

                  let btnLabel = 'จองเลย';
                  if (myBookingStatus === 'booked') btnLabel = 'จองแล้ว';
                  else if (myBookingStatus === 'standby')
                    btnLabel = 'รอคิวอยู่';
                  else if (isFull)
                    btnLabel = `ลงชื่อสำรอง (คิวที่ ${queuePos + 1})`;

                  return (
                    <ClassScheduleCard
                      key={cls.id}
                      time={formatTimeRange(cls.start_time)}
                      field={cls.location}
                      coach={cls.instructor || 'Pro Coach'}
                      current={cls.max_capacity - cls.current_bookings}
                      max={cls.max_capacity}
                      status={
                        myBookingStatus
                          ? 'booked'
                          : isWaitlist
                            ? 'waitlist'
                            : 'available'
                      }
                      onAction={() => initiateBooking(cls)}
                      disabled={isDisabled}
                      btnLabel={btnLabel}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>

        <BottomNav />

        {/* --- MODALS --- */}

        {/* Profile Switcher */}
        {showProfileSelector && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">เลือกผู้จอง</h3>
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
                  className={`w-full flex items-center gap-4 p-3 rounded-xl border ${!childId ? 'border-[#1e2e5c] bg-blue-50' : 'border-gray-100'}`}
                >
                  <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                    <User size={20} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-gray-900">
                      {parentProfile?.full_name}
                    </p>
                    <p className="text-xs text-gray-500">ผู้ปกครอง</p>
                  </div>
                  {!childId && (
                    <CheckCircle2
                      className="ml-auto text-[#1e2e5c]"
                      size={20}
                    />
                  )}
                </button>
                {children.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSwitchProfile(c.id)}
                    className={`w-full flex items-center gap-4 p-3 rounded-xl border ${childId === c.id ? 'border-[#1e2e5c] bg-blue-50' : 'border-gray-100'}`}
                  >
                    <div className="w-10 h-10 bg-[#c9b038] rounded-full flex items-center justify-center text-white font-bold">
                      {c.nickname[0]}
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-gray-900">{c.nickname}</p>
                      <p className="text-xs text-gray-500">นักเรียน</p>
                    </div>
                    {childId === c.id && (
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

        {/* Confirmation Modal */}
        {modal.isOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6">
              <h3 className="text-xl font-bold text-center mb-2 font-['Kanit'] text-gray-900">
                {modal.title}
              </h3>
              {modal.details && (
                <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm space-y-2 border border-gray-100">
                  <div className="flex justify-between">
                    <span>วันที่:</span>{' '}
                    <span className="font-bold">{modal.details.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>เวลา:</span>{' '}
                    <span className="font-bold">{modal.details.time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>สถานที่:</span>{' '}
                    <span className="font-bold">{modal.details.location}</span>
                  </div>
                  {modal.details.packageName && (
                    <div className="flex justify-between border-t pt-2 mt-2 text-xs text-gray-500">
                      <span>แพ็กเกจ:</span>{' '}
                      <span className="text-blue-600 font-bold">
                        {modal.details.packageName}
                      </span>
                    </div>
                  )}
                  {modal.details.queuePosition && (
                    <div className="bg-orange-100 text-orange-800 text-center p-2 rounded-lg font-bold mt-2">
                      คิวที่ #{modal.details.queuePosition}
                    </div>
                  )}
                </div>
              )}
              {modal.message && (
                <p className="text-center text-gray-500 mb-6 text-sm">
                  {modal.message}
                </p>
              )}
              {modal.type === 'confirm' && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                  <span className="text-amber-500 text-base mt-0.5">⚠</span>
                  <div>
                    <p className="text-amber-800 font-semibold text-xs">
                      นโยบายการยกเลิก
                    </p>
                    <p className="text-amber-700 text-xs leading-relaxed mt-0.5">
                      ยกเลิกการจองอย่างน้อย 2 ชั่วโมงก่อนเวลาเริ่มคลาส
                      เพื่อไม่ให้ถูกตัดจำนวน session
                    </p>
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                {modal.type === 'confirm' ? (
                  <>
                    <button
                      onClick={() => setModal({ ...modal, isOpen: false })}
                      className="flex-1 py-3 rounded-xl border font-bold text-gray-500"
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={modal.action}
                      className="flex-1 py-3 rounded-xl bg-[#1e2e5c] text-white font-bold"
                    >
                      ยืนยัน
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setModal({ ...modal, isOpen: false });
                      if (modal.action) modal.action();
                    }}
                    className="w-full py-3 rounded-xl bg-[#1e2e5c] text-white font-bold"
                  >
                    ตกลง
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

// Sub-Component
const ClassScheduleCard = ({
  time,
  field,
  coach,
  current,
  max,
  status,
  onAction,
  disabled,
  btnLabel,
}: any) => {
  const isWaitlist = status === 'waitlist';
  const isBooked = status === 'booked';

  return (
    <div
      className={`bg-white rounded-xl border p-4 shadow-sm transition-all ${isBooked ? 'border-green-200 bg-green-50/30' : 'border-gray-100'}`}
    >
      <div className="flex items-center gap-2 text-gray-800 font-semibold mb-3">
        <Clock size={16} className="text-gray-500" />
        <span className="text-sm">{time}</span>
      </div>
      <div className="pl-6 space-y-2 mb-4">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <MapPin size={14} className="text-gray-400" />
          <span>{field}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <UserCircle2 size={14} className="text-gray-400" />
          <span>{coach}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Users size={14} className="text-gray-400" />
          <span className={isWaitlist ? 'text-red-500 font-medium' : ''}>
            {isWaitlist
              ? 'คลาสเต็ม (ลงชื่อสำรอง)'
              : `ว่าง ${Math.max(0, current)} จาก ${max}`}
          </span>
        </div>
      </div>
      <button
        onClick={onAction}
        disabled={disabled}
        className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm ${isBooked ? 'bg-green-100 text-green-700 cursor-default' : isWaitlist ? 'bg-[#ef4444] text-white' : 'bg-[#1e2e5c] text-white'} ${disabled && !isBooked ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {btnLabel}
      </button>
    </div>
  );
};

export default function BookSession() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center font-bold text-[#1e2e5c]">
          Loading...
        </div>
      }
    >
      <BookSessionContent />
    </Suspense>
  );
}
