'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { Kanit } from 'next/font/google';
import {
  User,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle2,
  X,
  PackageOpen,
  AlertCircle,
  Loader2,
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

interface Props {
  userId: string;
  childId: string | undefined;
}

export default function PackagesContent({ userId, childId }: Props) {
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

  // Logic State: Check if user already has a package
  const [hasActivePackage, setHasActivePackage] = useState(false);

  // Promo Code State
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<any>(null);
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  useEffect(() => {
    // Restore saved profile if no childId in URL
    const savedChildId = localStorage.getItem('prokick_active_child_id');
    if (!childId && savedChildId) {
      router.replace(`/packages?childId=${savedChildId}`);
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
          const child = kids?.find((k: any) => k.id === childId);
          if (child) {
            activeProfile = child;
            type = 'junior';
          }
        }
        setCurrentProfile(activeProfile);

        // D. Fetch Packages (Filtered by type)
        const { data: temps } = await supabase
          .from('package_templates')
          .select('*')
          .eq('type', type)
          .order('price');
        setTemplates(temps || []);

        // E. Check for EXISTING Active Package (Un-expired)
        const nowStr = new Date().toISOString();
        let pkgQuery = supabase
          .from('user_packages')
          .select('id')
          .eq('status', 'active')
          .gt('expiry_date', nowStr);

        if (childId) {
          pkgQuery = pkgQuery.eq('child_id', childId);
        } else {
          pkgQuery = pkgQuery.eq('user_id', userId).is('child_id', null);
        }

        const { data: existingPkgs } = await pkgQuery;
        const hasActive = existingPkgs && existingPkgs.length > 0;
        setHasActivePackage(!!hasActive);

        // Reset Selection
        setSelectedTemplate(null);
        setCurrentTemplateIdx(0);
        setAppliedPromo(null);
        setPromoInput('');
        setPromoError('');
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
    if (newChildId) localStorage.setItem('prokick_active_child_id', newChildId);
    else localStorage.removeItem('prokick_active_child_id');
    if (newChildId) {
      router.replace(`/packages?childId=${newChildId}`);
    } else {
      router.replace('/packages');
    }
    setShowProfileSelector(false);
  };

  const handleSelectPackage = (template: any) => {
    if (hasActivePackage) return;
    if (selectedTemplate?.id === template.id) {
      setSelectedTemplate(null);
    } else {
      setSelectedTemplate(template);
    }
  };

  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoLoading(true);
    setPromoError('');
    setAppliedPromo(null);

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();

    setPromoLoading(false);

    if (error || !data) {
      setPromoError('ไม่พบโค้ดส่วนลดนี้');
      return;
    }
    if (data.expiry_date && data.expiry_date < now) {
      setPromoError('โค้ดส่วนลดหมดอายุแล้ว');
      return;
    }
    if (data.usage_limit != null && data.used_count >= data.usage_limit) {
      setPromoError('โค้ดส่วนลดถูกใช้ครบจำนวนแล้ว');
      return;
    }
    setAppliedPromo(data);
  };

  const getDiscountAmount = () => {
    if (!appliedPromo || !selectedTemplate) return 0;
    const val = appliedPromo.discount ?? 0;
    if (appliedPromo.discount_type === 'percent') {
      return Math.round(selectedTemplate.price * val) / 100;
    }
    return Math.min(val, selectedTemplate.price);
  };

  const getFinalPrice = () => {
    if (!selectedTemplate) return 0;
    return selectedTemplate.price - getDiscountAmount();
  };

  const navigateToPayment = () => {
    if (!selectedTemplate) return;
    const params = new URLSearchParams({
      packageId: selectedTemplate.id,
    });
    if (childId) params.set('childId', childId);
    if (appliedPromo) params.set('promoId', appliedPromo.id);
    router.push(`/payment?${params.toString()}`);
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
      <div className="w-full max-w-md bg-white shadow-2xl relative flex flex-col h-[100dvh] overflow-hidden">
        {/* 1. HEADER */}
        <div className="px-4 py-3 flex items-center bg-white/95 backdrop-blur-sm z-20 shadow-sm shrink-0 border-b border-gray-50">
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

        {/* 2. SCROLLABLE CONTENT AREA */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pt-4 space-y-6">
          {/* Profile Card */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 overflow-hidden">
                {currentProfile?.avatar_url ? (
                  <img
                    src={currentProfile.avatar_url}
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

          {/* Warning Banner if Active Package Exists */}
          {hasActivePackage && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle
                size={20}
                className="text-orange-500 shrink-0 mt-0.5"
              />
              <div>
                <p className="text-sm font-bold text-orange-800">
                  มีแพ็กเกจใช้งานอยู่แล้ว
                </p>
                <p className="text-xs text-orange-600">
                  ไม่สามารถซื้อแพ็กเกจซ้อนทับได้
                  กรุณาใช้แพ็กเกจเดิมให้หมดหรือรอให้หมดอายุก่อน
                </p>
              </div>
            </div>
          )}

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
                      onClick={() => handleSelectPackage(activeTemplate)}
                      disabled={hasActivePackage}
                      className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all
                        ${
                          hasActivePackage
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                            : selectedTemplate?.id === activeTemplate.id
                              ? 'bg-[#1e2e5c] text-white shadow-md'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                      {hasActivePackage
                        ? 'มีแพ็กเกจใช้งานอยู่แล้ว'
                        : selectedTemplate?.id === activeTemplate.id
                          ? 'เลือกแล้ว (แตะเพื่อยกเลิก)'
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

          {/* Discount Section */}
          <div
            className={`${hasActivePackage ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <label className="text-xs text-gray-600 mb-2 block">
              กรอกโค้ดส่วนลด
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="PROKICK2024"
                disabled={hasActivePackage || !!appliedPromo}
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                className={`w-full border rounded-lg h-12 pl-4 pr-12 text-sm focus:outline-none transition-colors ${appliedPromo ? 'border-green-400 bg-green-50 text-green-700 font-medium' : 'border-gray-200 focus:border-[#1e2e5c]'}`}
              />
              {appliedPromo ? (
                <button
                  onClick={() => { setAppliedPromo(null); setPromoInput(''); setPromoError(''); }}
                  className="absolute right-0 top-0 h-12 w-12 bg-green-500 rounded-r-lg flex items-center justify-center text-white"
                >
                  <X size={18} />
                </button>
              ) : (
                <button
                  onClick={handleApplyPromo}
                  disabled={promoLoading || !promoInput.trim()}
                  className="absolute right-0 top-0 h-12 w-12 bg-[#1e2e5c] rounded-r-lg flex items-center justify-center text-white disabled:opacity-50"
                >
                  {promoLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={20} />}
                </button>
              )}
            </div>
            {appliedPromo && (
              <div className="mt-2 flex items-center gap-2 text-green-700 text-xs font-medium">
                <CheckCircle2 size={14} />
                <span>
                  ใช้โค้ด <span className="font-bold">{appliedPromo.code}</span> ได้ส่วนลด{' '}
                  {appliedPromo.discount_type === 'percent'
                    ? `${appliedPromo.discount ?? 0}%`
                    : `${(appliedPromo.discount ?? 0).toLocaleString()} บาท`}
                </span>
              </div>
            )}
            {promoError && (
              <p className="mt-2 text-red-500 text-xs flex items-center gap-1">
                <AlertCircle size={13} /> {promoError}
              </p>
            )}
          </div>

          {/* 3. TOTAL PRICE SECTION (In-Flow) */}
          <div className="pt-2">
            <div className="border-t border-gray-100 pt-6">
              {selectedTemplate ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3">
                  {appliedPromo && (
                    <div className="flex justify-between items-center px-2 text-sm">
                      <span className="text-gray-500">ราคาเต็ม</span>
                      <span className="text-gray-400 line-through">
                        {selectedTemplate.price.toLocaleString()} บาท
                      </span>
                    </div>
                  )}
                  {appliedPromo && (
                    <div className="flex justify-between items-center px-2 text-sm">
                      <span className="text-green-600">ส่วนลด ({appliedPromo.code})</span>
                      <span className="text-green-600 font-medium">
                        -{getDiscountAmount().toLocaleString()} บาท
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center px-2">
                    <span className="text-gray-800 font-bold">รวมราคา:</span>
                    <span className="text-[#1e2e5c] text-2xl font-bold">
                      {getFinalPrice().toLocaleString()} บาท
                    </span>
                  </div>
                  <button
                    onClick={navigateToPayment}
                    className="w-full bg-[#1e2e5c] text-white py-3.5 rounded-xl font-bold text-base shadow-md active:scale-[0.99] transition-transform hover:bg-[#2b4185]"
                  >
                    ดำเนินการต่อ
                  </button>
                </div>
              ) : (
                <div className="h-[100px] flex flex-col items-center justify-center text-gray-300 gap-2 border border-dashed border-gray-100 rounded-xl bg-gray-50/50 select-none">
                  <PackageOpen size={24} className="opacity-30" />
                  <span className="text-xs font-light">
                    {hasActivePackage
                      ? 'ไม่สามารถเลือกแพ็กเกจได้'
                      : 'กรุณาเลือกแพ็กเกจด้านบน'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 4. BOTTOM NAV SPACER */}
          <div className="h-[90px] w-full shrink-0"></div>
        </div>

        {/* 5. BOTTOM NAV (Overlay) */}
        <BottomNav userId={userId} />

        {/* --- MODALS --- */}
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
                  <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 overflow-hidden">
                    {parentProfile?.avatar_url ? (
                      <img src={parentProfile.avatar_url} className="w-full h-full object-cover" />
                    ) : (
                      <User size={20} />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-gray-900">
                      {parentProfile?.nickname || parentProfile?.full_name || 'Parent'}
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
