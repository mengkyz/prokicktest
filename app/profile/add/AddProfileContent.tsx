'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Kanit } from 'next/font/google';
import { ChevronLeft, CheckCircle2 } from 'lucide-react';
import { createChildProfile } from '@/app/actions';
import BottomNav from '@/components/BottomNav';
import LanguageToggle from '@/components/LanguageToggle';
import { useLanguage } from '@/lib/LanguageContext';

const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

interface Props {
  userId: string;
}

export default function AddProfileContent({ userId }: Props) {
  const router = useRouter();
  const { t } = useLanguage();
  const ap = t.addProfile;

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
    if (birthDate) {
      const today = new Date();
      const birth = new Date(birthDate);
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      setCalculatedAge(age);
    } else {
      setCalculatedAge(null);
    }
  }, [birthDate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProcessing(true);
    const formData = new FormData(e.currentTarget);

    const result = await createChildProfile(formData);
    setProcessing(false);

    if (result.success) {
      setModal({
        isOpen: true,
        type: 'success',
        message: ap.addedSuccess,
      });
    } else {
      setModal({
        isOpen: true,
        type: 'error',
        message: result.message || ap.error,
      });
    }
  };

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
          <h1 className="flex-1 text-center text-lg font-bold text-gray-900">
            {ap.title}
          </h1>
          <LanguageToggle />
        </div>

        {/* Scrollable Form Content */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col overflow-hidden relative"
        >
          <div className="flex-1 overflow-y-auto pb-32 scrollbar-hide px-5 pt-6 space-y-6">
            {/* Avatar Placeholder */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center text-4xl overflow-hidden border-4 border-white shadow-sm text-gray-400">
                  🧒
                </div>
              </div>
              <h2 className="text-base font-bold text-gray-800 mt-3">
                {ap.athleteInfo}
              </h2>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-medium ml-1">
                  {ap.nicknameLabel}
                </label>
                <input
                  type="text"
                  name="nickname"
                  className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-[#1e2e5c]"
                  placeholder={ap.nicknamePlaceholder}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-medium ml-1">
                  {ap.birthDateLabel}{' '}
                  {calculatedAge !== null && (
                    <span className="text-[#1e2e5c] font-bold">
                      ({ap.ageLabel} {calculatedAge} {ap.yearsOld})
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  name="birthDate"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-[#1e2e5c]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-medium ml-1">
                    {ap.heightLabel}
                  </label>
                  <input
                    type="number"
                    name="height"
                    className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-[#1e2e5c]"
                    placeholder="120"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 font-medium ml-1">
                    {ap.weightLabel}
                  </label>
                  <input
                    type="number"
                    name="weight"
                    className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:border-[#1e2e5c]"
                    placeholder="25"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500 font-medium ml-1">
                  {ap.jerseySizeLabel}
                </label>
                <div className="relative">
                  <select
                    name="size"
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
              {processing ? ap.saving : ap.save}
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
                {modal.type === 'success' ? ap.successTitle : ap.alertTitle}
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
                {ap.ok}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
