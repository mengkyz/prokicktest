'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams, useRouter } from 'next/navigation';
import { Kanit } from 'next/font/google';
import {
  User,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle2,
  X,
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

function PackagesContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const childId = searchParams.get('childId');
  const router = useRouter();

  // Data State
  const [parentProfile, setParentProfile] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [currentProfile, setCurrentProfile] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [currentTemplateIdx, setCurrentTemplateIdx] = useState(0);
  const [showProfileSelector, setShowProfileSelector] = useState(false);

  useEffect(() => {
    if (!userId) {
      router.replace('/');
      return;
    }

    const init = async () => {
      setLoading(true);
      try {
        // A. Fetch Parent
        const { data: parent } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        if (!parent) throw new Error('User not found');
        setParentProfile(parent);

        // B. Fetch Children
        const { data: kids } = await supabase
          .from('child_profiles')
          .select('*')
          .eq('parent_id', userId);
        setChildren(kids || []);

        // C. Determine Current Profile
        let activeProfile = parent;
        let type = 'adult';

        if (childId) {
          const child = kids?.find((k) => k.id === childId);
          if (child) {
            activeProfile = child;
            type = 'junior';
          }
        }
        setCurrentProfile(activeProfile);

        // D. Fetch Packages (Filtered)
        const { data: temps } = await supabase
          .from('package_templates')
          .select('*')
          .eq('type', type)
          .order('price');
        setTemplates(temps || []);

        // Reset Selection when profile changes
        setSelectedTemplate(null);
        setCurrentTemplateIdx(0);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [userId, childId, router]);

  // --- HANDLERS ---
  const handleSwitchProfile = (newChildId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newChildId) params.set('childId', newChildId);
    else params.delete('childId');

    router.replace(`/packages?${params.toString()}`);
    setShowProfileSelector(false);
  };

  const navigateToPayment = () => {
    if (!selectedTemplate) return;
    const paymentUrl = `/payment?userId=${userId}&childId=${childId || 'null'}&packageId=${selectedTemplate.id}`;
    router.push(paymentUrl);
  };

  // --- CAROUSEL ---
  const activeTemplate = templates[currentTemplateIdx];
  const nextTemplate = () => {
    if (currentTemplateIdx < templates.length - 1)
      setCurrentTemplateIdx((p) => p + 1);
  };
  const prevTemplate = () => {
    if (currentTemplateIdx > 0) setCurrentTemplateIdx((p) => p - 1);
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-[#1e2e5c] font-bold animate-pulse">
        Loading Packages...
      </div>
    );

  return (
    <div
      className={`min-h-screen bg-gray-50 flex justify-center ${kanit.className}`}
    >
      <div className="w-full max-w-md bg-white shadow-2xl relative flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center sticky top-0 bg-white/95 backdrop-blur-sm z-20 shadow-sm">
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft size={28} />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-gray-900 pr-8">
            ซื้อแพ็กเกจ
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto pb-32 scrollbar-hide px-5 pt-4 space-y-6">
          {/* Profile Card & Switcher */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#c9b038] rounded-full flex items-center justify-center text-white overflow-hidden">
                {currentProfile?.picture_url ? (
                  <img
                    src={currentProfile.picture_url}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User size={24} />
                )}
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {currentProfile?.nickname || currentProfile?.full_name}
                </h2>
                <p className="text-gray-500 text-xs">
                  {childId ? 'นักเรียน (Junior)' : 'ผู้ปกครอง (Adult)'}
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

          {/* Packages Carousel */}
          <div>
            <h2 className="text-lg font-bold text-gray-900">แพ็กเกจแนะนำ</h2>
            <p className="text-gray-500 text-xs mt-1 mb-4 font-light">
              เลือกแพ็กเกจที่เหมาะกับไลฟ์สไตล์ของคุณ
            </p>

            <div className="relative">
              {/* Arrows */}
              {templates.length > 1 && (
                <>
                  <button
                    onClick={prevTemplate}
                    disabled={currentTemplateIdx === 0}
                    className={`absolute left-0 top-1/2 -translate-y-1/2 -ml-3 z-10 p-2 rounded-full bg-white shadow-md border border-gray-100 text-gray-600 transition-opacity ${currentTemplateIdx === 0 ? 'opacity-0 pointer-events-none' : ''}`}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={nextTemplate}
                    disabled={currentTemplateIdx === templates.length - 1}
                    className={`absolute right-0 top-1/2 -translate-y-1/2 -mr-3 z-10 p-2 rounded-full bg-white shadow-md border border-gray-100 text-gray-600 transition-opacity ${currentTemplateIdx === templates.length - 1 ? 'opacity-0 pointer-events-none' : ''}`}
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              {/* Card */}
              {templates.length > 0 ? (
                <div
                  className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${selectedTemplate?.id === activeTemplate.id ? 'border-[#1e2e5c] shadow-md ring-1 ring-[#1e2e5c]' : 'border-gray-100 shadow-sm'}`}
                >
                  <div
                    className={`h-1.5 w-full ${selectedTemplate?.id === activeTemplate.id ? 'bg-[#1e2e5c]' : 'bg-gray-100'}`}
                  ></div>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-2xl font-bold text-gray-800">
                        {activeTemplate.name}
                      </h3>
                      {templates.length > 1 && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                          {currentTemplateIdx + 1}/{templates.length}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm mb-6 font-light h-10 line-clamp-2">
                      {activeTemplate.description ||
                        'สนุกกับการเรียนรู้และฝึกฝนทักษะฟุตบอลอย่างมืออาชีพ'}
                    </p>
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-[#1e2e5c] text-4xl font-bold">
                        {activeTemplate.price.toLocaleString()}
                      </span>
                      <span className="text-gray-500 text-sm">บาท</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-700 mb-6 font-medium">
                      <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg">
                        {activeTemplate.session_count} ครั้ง
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg">
                        {activeTemplate.days_valid} วัน
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedTemplate(activeTemplate)}
                      className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all ${selectedTemplate?.id === activeTemplate.id ? 'bg-[#1e2e5c] text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {selectedTemplate?.id === activeTemplate.id
                        ? 'เลือกแล้ว'
                        : 'เลือกแพ็กเกจนี้'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
                  <p className="text-gray-400 text-sm">ไม่พบแพ็กเกจ</p>
                </div>
              )}
            </div>
          </div>

          {/* Discount */}
          <div>
            <label className="text-xs text-gray-600 mb-2 block">
              กรอกโค้ดส่วนลด
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="PROKICK2024"
                className="w-full border border-gray-200 rounded-lg h-12 pl-4 pr-12 text-sm focus:outline-none focus:border-[#1e2e5c]"
              />
              <button className="absolute right-0 top-0 h-12 w-12 bg-[#1e2e5c] rounded-r-lg flex items-center justify-center text-white">
                <Search size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Total Bar (Visible when package selected) */}
        {selectedTemplate && (
          <div className="absolute bottom-[70px] w-full bg-white border-t border-gray-100 px-6 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-800 font-bold">รวมราคา:</span>
              <span className="text-[#1e2e5c] text-2xl font-bold">
                {selectedTemplate.price.toLocaleString()} บาท
              </span>
            </div>
            <button
              onClick={navigateToPayment}
              className="w-full bg-[#1e2e5c] text-white py-3.5 rounded-lg font-bold text-base shadow-lg active:scale-[0.99] transition-transform hover:bg-[#2b4185]"
            >
              ถัดไป
            </button>
          </div>
        )}

        <BottomNav />

        {/* Profile Switcher Modal */}
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
                  className={`w-full flex items-center gap-4 p-3 rounded-xl border transition-all ${!childId ? 'border-[#1e2e5c] bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}
                >
                  <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
                    <User size={20} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-gray-900">
                      {parentProfile?.full_name || 'Parent'}
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
                {children.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => handleSwitchProfile(child.id)}
                    className={`w-full flex items-center gap-4 p-3 rounded-xl border transition-all ${childId === child.id ? 'border-[#1e2e5c] bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}
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
                    {childId === child.id && (
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
      </div>
    </div>
  );
}

export default function PackagesPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PackagesContent />
    </Suspense>
  );
}
