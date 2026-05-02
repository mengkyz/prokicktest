'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { Kanit } from 'next/font/google';
import { ChevronLeft, User, CheckCircle2 } from 'lucide-react';
import { updateProfile } from '@/app/actions';
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

interface Props {
  userId: string;
  targetId: string;
  type: string;
}

export default function EditProfileContent({ userId, targetId, type }: Props) {
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [birthDate, setBirthDate] = useState('');
  const [calculatedAge, setCalculatedAge] = useState<number | null>(null);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    type: 'success' | 'error';
    message: string;
  }>({
    isOpen: false,
    type: 'success',
    message: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      const table = type === 'child' ? 'child_profiles' : 'profiles';
      const { data: profileData } = await supabase
        .from(table)
        .select('*')
        .eq('id', targetId)
        .single();
      setData(profileData);
      setBirthDate(profileData?.birth_date || '');
      setLoading(false);
    };
    fetchData();
  }, [targetId, type]);

  useEffect(() => {
    if (birthDate) {
      const today = new Date();
      const birth = new Date(birthDate);
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      setCalculatedAge(age);
    } else {
      setCalculatedAge(null);
    }
  }, [birthDate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProcessing(true);
    const formData = new FormData(e.currentTarget);
    formData.append('id', targetId);
    formData.append('isChild', (type === 'child').toString());

    const result = await updateProfile(formData);
    setProcessing(false);

    if (result.success) {
      setModal({
        isOpen: true,
        type: 'success',
        message: 'บันทึกข้อมูลเรียบร้อยแล้ว',
      });
    } else {
      setModal({
        isOpen: true,
        type: 'error',
        message: result.message || 'เกิดข้อผิดพลาด',
      });
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-[#1e2e5c] font-bold animate-pulse">
        Loading...
      </div>
    );

  const isChild = type === 'child';

  return (
    <div
      className={`min-h-screen bg-gray-50 flex justify-center ${kanit.className}`}
    >
      <div className="w-full max-w-md bg-white shadow-2xl relative flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center sticky top-0 bg-white z-20 border-b border-gray-50 shadow-sm">
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft size={28} />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-gray-900 pr-8">
            แก้ไขข้อมูล
          </h1>
        </div>

        {/* Scrollable Form Content */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col overflow-hidden relative"
        >
          <div className="flex-1 overflow-y-auto pb-32 scrollbar-hide px-5 pt-6 space-y-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 overflow-hidden border-4 border-white shadow-sm">
                  {isChild ? (
                    <span className="text-4xl">🧒</span>
                  ) : data?.avatar_url ? (
                    <img
                      src={data.avatar_url}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={48} />
                  )}
                </div>
              </div>
              <h2 className="text-base font-bold text-gray-800 mt-3">
                {isChild ? 'ข้อมูลนักกีฬา' : 'ข้อมูลผู้ปกครอง'}
              </h2>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              {/* Parent Only Fields */}
              {!isChild && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium ml-1">
                      ชื่อจริง-นามสกุล
                    </label>
                    <input
                      type="text"
                      name="fullName"
                      defaultValue={data?.full_name}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-500 focus:outline-none cursor-not-allowed"
                      readOnly
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium ml-1">
                      เบอร์โทรศัพท์
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      defaultValue={data?.phone_number}
                      className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-[#1e2e5c]"
                      placeholder="08x-xxx-xxxx"
                    />
                  </div>
                </>
              )}

              {/* Common Fields */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-medium ml-1">
                  ชื่อเล่น
                </label>
                <input
                  type="text"
                  name="nickname"
                  defaultValue={data?.nickname}
                  className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-[#1e2e5c]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-medium ml-1">
                  วันเกิด{' '}
                  {calculatedAge !== null && (
                    <span className="text-[#1e2e5c] font-bold">
                      (อายุ {calculatedAge} ปี)
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  name="birthDate"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-[#1e2e5c]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-medium ml-1">
                    ส่วนสูง (ซม.)
                  </label>
                  <input
                    type="number"
                    name="height"
                    defaultValue={data?.height_cm}
                    className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-[#1e2e5c]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-medium ml-1">
                    น้ำหนัก (กก.)
                  </label>
                  <input
                    type="number"
                    name="weight"
                    defaultValue={data?.weight_kg}
                    className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-[#1e2e5c]"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-medium ml-1">
                  ไซส์เสื้อ
                </label>
                <div className="relative">
                  <select
                    name="size"
                    defaultValue={data?.jersey_size || 'M'}
                    className="w-full appearance-none bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-[#1e2e5c]"
                  >
                    {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <ChevronLeft size={16} className="-rotate-90" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Save Button */}
          <div className="absolute bottom-[70px] w-full px-6 py-4 pointer-events-none z-30">
            <button
              type="submit"
              disabled={processing}
              className="w-full bg-[#1e2e5c] text-white py-3.5 rounded-xl font-bold text-base shadow-lg active:scale-[0.99] transition-transform disabled:bg-gray-300 pointer-events-auto hover:bg-[#2b4185]"
            >
              {processing ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
            </button>
          </div>
        </form>

        <BottomNav userId={userId} />

        {/* Modal */}
        {modal.isOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center shadow-xl">
              <div
                className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 ${modal.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}
              >
                {modal.type === 'success' ? (
                  <CheckCircle2 size={32} />
                ) : (
                  <span className="text-2xl font-bold">!</span>
                )}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {modal.type === 'success' ? 'สำเร็จ!' : 'แจ้งเตือน'}
              </h3>
              <p className="text-gray-500 text-sm mb-6">{modal.message}</p>
              <button
                onClick={() => {
                  setModal({ ...modal, isOpen: false });
                  if (modal.type === 'success') {
                    router.push('/profile');
                    router.refresh();
                  }
                }}
                className="w-full bg-[#1e2e5c] text-white py-3 rounded-xl font-bold hover:bg-[#2b4185]"
              >
                ตกลง
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
