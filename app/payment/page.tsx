'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams, useRouter } from 'next/navigation';
import { Kanit } from 'next/font/google';
import {
  ChevronLeft,
  CheckCircle2,
  Cpu,
  QrCode,
  Download,
  Copy,
  Landmark,
  CreditCard,
  UserCircle2,
  Upload,
} from 'lucide-react';
import { verifyAndProcessPayment } from '../actions';

const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function PaymentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const userId = searchParams.get('userId');
  const childId = searchParams.get('childId'); // Can be 'null' string or actual ID
  const packageId = searchParams.get('packageId');

  // --- STATE ---
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [pkgDetails, setPkgDetails] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [selectedSlip, setSelectedSlip] = useState<File | null>(null);
  const [resultModal, setResultModal] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // --- INIT ---
  useEffect(() => {
    if (!userId || !packageId) {
      router.replace('/');
      return;
    }

    const init = async () => {
      setLoading(true);
      try {
        // 1. Fetch Package Template Details
        const { data: template } = await supabase
          .from('package_templates')
          .select('*')
          .eq('id', packageId)
          .single();

        if (!template) throw new Error('Package not found');
        setPkgDetails(template);

        // 2. Fetch Target Profile (Who is this for?)
        if (childId && childId !== 'null') {
          const { data: child } = await supabase
            .from('child_profiles')
            .select('*')
            .eq('id', childId)
            .single();
          setProfile(child);
        } else {
          const { data: parent } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
          setProfile(parent);
        }
      } catch (error) {
        console.error('Error loading payment details:', error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [userId, packageId, childId, router]);

  // --- HANDLERS ---
  const handlePayment = async (isDev = false) => {
    setProcessing(true);

    const formData = new FormData();

    // Dev Bypass Logic
    if (isDev) {
      const dummyFile = new File(['dev_bypass'], 'dev_bypass.txt', {
        type: 'text/plain',
      });
      formData.append('slip', dummyFile);
      formData.append('dev_bypass', 'true');
    } else {
      if (!selectedSlip) {
        alert('กรุณาแนบสลิปโอนเงิน');
        setProcessing(false);
        return;
      }
      formData.append('slip', selectedSlip);
    }

    formData.append('userId', userId!);
    formData.append('childId', childId || 'null');
    formData.append('packageId', packageId!);
    formData.append('type', 'new_package');

    const result = await verifyAndProcessPayment(formData);
    setProcessing(false);

    if (result.success) {
      setResultModal({ type: 'success', message: 'ชำระเงินสำเร็จ!' });
    } else {
      setResultModal({
        type: 'error',
        message: result.message || 'เกิดข้อผิดพลาด',
      });
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-[#1e2e5c] font-bold animate-pulse">
        Loading Payment...
      </div>
    );

  return (
    <div
      className={`min-h-screen bg-gray-50 flex justify-center ${kanit.className}`}
    >
      <div className="w-full max-w-md bg-white shadow-2xl relative flex flex-col h-screen overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-4 py-3 flex items-center sticky top-0 bg-white z-20 border-b border-gray-50">
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 text-gray-800 hover:bg-gray-50 rounded-full transition-colors"
          >
            <ChevronLeft size={28} />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-gray-900 pr-8">
            ยืนยันการชำระเงิน
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-10 scrollbar-hide px-5 py-5 space-y-4">
          {/* Order Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-3">
              สรุปแพ็กเกจที่เลือก
            </h3>
            <div className="mb-1">
              <span className="text-gray-800 font-medium text-lg">
                {pkgDetails.name}
              </span>
            </div>
            <div className="text-[#1e2e5c] text-3xl font-bold mb-2">
              {pkgDetails.price.toLocaleString()} บาท
            </div>
            <p className="text-gray-400 text-xs">
              สำหรับ: {profile?.nickname || profile?.full_name}
            </p>
          </div>

          {/* QR Code */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm text-center">
            <h3 className="text-sm font-bold text-gray-800 mb-4">
              สแกน QR Code เพื่อชำระเงิน
            </h3>
            <div className="bg-gray-100 w-48 h-48 mx-auto rounded-lg flex items-center justify-center mb-4 border border-gray-200">
              <QrCode size={80} className="text-gray-400" />
            </div>
            <button className="flex items-center justify-center gap-2 text-[#1e2e5c] text-xs font-medium w-full hover:underline">
              <Download size={14} />
              <span>บันทึก QR</span>
            </button>
          </div>

          {/* Bank Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-800 mb-2">
              หรือโอนเงินผ่านบัญชีธนาคาร
            </h3>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#1e2e5c] flex items-center justify-center text-white shrink-0">
                <Landmark size={20} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-0.5">ธนาคาร</p>
                <p className="text-sm text-gray-800 font-medium">
                  ธนาคารกรุงเทพ
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-600 shrink-0">
                <CreditCard size={20} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-gray-500 mb-0.5">เลขที่บัญชี</p>
                <div className="flex justify-between items-center">
                  <p className="text-lg text-gray-800 font-medium tracking-wide">
                    987-6-54321-0
                  </p>
                  <button className="text-gray-400 hover:text-[#1e2e5c]">
                    <Copy size={18} />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-600 shrink-0">
                <UserCircle2 size={20} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-0.5">ชื่อบัญชี</p>
                <p className="text-sm text-gray-800 font-medium">
                  บริษัท โปรคิก จำกัด
                </p>
              </div>
            </div>
          </div>

          {/* Upload Slip */}
          <div className="pt-2">
            <label className="text-sm font-medium text-gray-800 mb-2 block">
              อัปโหลดสลิป
            </label>
            <label className="border border-gray-200 rounded-lg p-3 flex items-center gap-3 bg-white cursor-pointer hover:bg-gray-50 transition-colors">
              <Upload size={20} className="text-gray-500" />
              <span className="flex-1 text-sm text-gray-800 truncate">
                {selectedSlip ? selectedSlip.name : 'แตะเพื่อเลือกรูปภาพ...'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setSelectedSlip(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {/* Actions */}
          <div className="pt-4 pb-10 space-y-3">
            <button
              onClick={() => handlePayment(false)}
              disabled={!selectedSlip || processing}
              className="w-full bg-[#1e2e5c] text-white py-3.5 rounded-lg font-bold text-base shadow-lg active:scale-[0.99] transition-transform disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {processing ? 'กำลังตรวจสอบ...' : 'ยืนยันการชำระเงิน'}
            </button>

            <button
              onClick={() => handlePayment(true)}
              disabled={processing}
              className="w-full py-2 rounded-lg bg-orange-50 text-orange-600 font-bold text-xs flex items-center justify-center gap-2 border border-orange-100"
            >
              <Cpu size={14} /> Dev Buy (Bypass)
            </button>
          </div>
        </div>

        {/* Result Modal */}
        {resultModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
            <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center shadow-xl">
              <div
                className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 ${resultModal.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}
              >
                {resultModal.type === 'success' ? (
                  <CheckCircle2 size={32} />
                ) : (
                  <span className="text-2xl font-bold">!</span>
                )}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {resultModal.type === 'success' ? 'สำเร็จ!' : 'แจ้งเตือน'}
              </h3>
              <p className="text-gray-500 text-sm mb-6">
                {resultModal.message}
              </p>
              <button
                onClick={() => {
                  setResultModal(null);
                  if (resultModal.type === 'success') {
                    router.push(`/dashboard?userId=${userId}`);
                  }
                }}
                className="w-full bg-[#1e2e5c] text-white py-3 rounded-xl font-bold"
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

export default function PaymentPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PaymentContent />
    </Suspense>
  );
}
