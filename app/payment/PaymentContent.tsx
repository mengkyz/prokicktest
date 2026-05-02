'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { Kanit } from 'next/font/google';
import {
  ChevronLeft,
  Copy,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ImageIcon,
  ShieldAlert,
} from 'lucide-react';
import { verifyAndProcessPayment } from '@/app/actions';
import LanguageToggle from '@/components/LanguageToggle';
import { useLanguage } from '@/lib/LanguageContext';

const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface PaymentSettings {
  id: string;
  bank_name: string;
  bank_code: string;
  account_number: string;
  account_name: string;
  qr_code_base64: string;
}

interface Props {
  userId: string;
  childId: string | null;
  packageId: string;
  promoId: string | null;
  isAdmin: boolean;
}

export default function PaymentContent({ userId, childId, packageId, promoId, isAdmin }: Props) {
  const router = useRouter();
  const { t } = useLanguage();
  const py = t.payment;

  const [pkgTemplate, setPkgTemplate] = useState<any>(null);
  const [promoData, setPromoData] = useState<any>(null);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [{ data }, { data: settings }] = await Promise.all([
          supabase.from('package_templates').select('*').eq('id', packageId).single(),
          supabase.from('payment_settings').select('*').limit(1).single(),
        ]);

        if (data) setPkgTemplate(data);
        if (settings) setPaymentSettings(settings);

        if (promoId) {
          const { data: promo } = await supabase
            .from('promo_codes')
            .select('*')
            .eq('id', promoId)
            .single();
          if (promo) setPromoData(promo);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [packageId, promoId]);

  const getDiscountAmount = () => {
    if (!promoData || !pkgTemplate) return 0;
    const val = promoData.discount ?? 0;
    if (promoData.discount_type === 'percent') {
      return Math.round(pkgTemplate.price * val) / 100;
    }
    return Math.min(val, pkgTemplate.price);
  };

  const getFinalPrice = () => {
    if (!pkgTemplate) return 0;
    return pkgTemplate.price - getDiscountAmount();
  };

  const handleCopyAccount = async () => {
    try {
      const rawNumber = (paymentSettings?.account_number ?? '').replace(/-/g, '');
      await navigator.clipboard.writeText(rawNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        setErrorMsg(py.imageOnly);
        return;
      }
      if (selectedFile.size > 5 * 1024 * 1024) {
        setErrorMsg(py.fileTooLarge);
        return;
      }
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setErrorMsg('');
    }
  };

  const handleDevBypass = async () => {
    if (!confirm('Use DEV BYPASS to simulate successful payment?')) return;

    setSubmitting(true);
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('packageId', packageId);
      formData.append('childId', childId || 'null');
      formData.append('type', 'new_package');
      formData.append('dev_bypass', 'true');
      if (promoId) formData.append('promoId', promoId);

      const result = await verifyAndProcessPayment(formData);

      if (result.success) {
        router.replace('/dashboard?refresh=true');
      } else {
        setErrorMsg(result.message || 'Bypass Failed');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Dev Bypass Error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!file || !pkgTemplate) {
      setErrorMsg(py.attachSlipError);
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('slip', file);
      formData.append('packageId', packageId);
      formData.append('childId', childId || 'null');
      formData.append('type', 'new_package');
      formData.append('price', pkgTemplate.price.toString());
      if (promoId) formData.append('promoId', promoId);

      const result = await verifyAndProcessPayment(formData);

      if (result.success) {
        router.replace('/dashboard?refresh=true');
      } else {
        setErrorMsg(result.message || py.verifyFailed);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(py.connectionError);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-[#1e2e5c] animate-pulse font-bold">
        Loading...
      </div>
    );

  return (
    <div
      className={`min-h-screen bg-gray-50 flex justify-center ${kanit.className}`}
    >
      {submitting && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-3xl px-10 py-10 flex flex-col items-center gap-4 shadow-2xl mx-6">
            <Loader2 size={48} className="animate-spin text-[#1e2e5c]" />
            <p className="text-[#1e2e5c] font-bold text-lg text-center">
              {py.verifyingPayment}
            </p>
            <p className="text-gray-400 text-sm text-center">
              {py.pleaseWait}
            </p>
          </div>
        </div>
      )}

      <div className="w-full max-w-md bg-white shadow-2xl relative flex flex-col h-[100dvh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center bg-white/95 backdrop-blur-sm z-20 shadow-sm shrink-0 border-b border-gray-50">
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft size={28} />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-gray-900">
            {py.payment}
          </h1>
          <LanguageToggle />
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pt-4 space-y-6 pb-10">
          {/* Summary Card */}
          <div className="bg-[#1e2e5c] rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
            <p className="text-blue-200 text-xs mb-1">{py.orderSummary}</p>
            <h2 className="text-xl font-bold mb-4">{pkgTemplate?.name}</h2>
            {promoData && (
              <div className="flex justify-between items-center text-sm mb-2 border-t border-white/10 pt-3">
                <span className="text-blue-200">{py.fullPrice}</span>
                <span className="text-white/60 line-through">
                  {pkgTemplate?.price.toLocaleString()} {py.baht}
                </span>
              </div>
            )}
            {promoData && (
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-green-300">
                  {py.discount} ({promoData.code}){' '}
                  {promoData.discount_type === 'percent'
                    ? `${promoData.discount ?? 0}%`
                    : `${(promoData.discount ?? 0).toLocaleString()} ${py.baht}`}
                </span>
                <span className="text-green-300 font-medium">
                  -{getDiscountAmount().toLocaleString()} {py.baht}
                </span>
              </div>
            )}
            <div className="flex justify-between items-end border-t border-white/10 pt-4">
              <span className="text-sm text-blue-200">{py.totalAmount}</span>
              <span className="text-3xl font-bold">
                {getFinalPrice().toLocaleString()} {py.baht}
              </span>
            </div>
          </div>

          {/* Payment Method Section */}
          <div>
            <h3 className="text-gray-900 font-bold mb-3">
              {py.bankTransfer}
            </h3>
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm text-center">
              <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-inner inline-block mb-4">
                <img
                  src={paymentSettings?.qr_code_base64 ?? ''}
                  alt="Payment QR"
                  className="w-48 h-48 object-contain mx-auto"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'https://placehold.co/200x200?text=QR+Error';
                  }}
                />
              </div>

              <div className="border-t border-gray-100 my-4"></div>

              <div className="text-left space-y-1">
                <p className="text-xs text-gray-500">{py.bankLabel}</p>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                    K
                  </div>
                  <p className="text-sm font-medium text-gray-800">
                    {paymentSettings?.bank_name ?? ''}
                  </p>
                </div>

                <p className="text-xs text-gray-500 mt-3">{py.accountNumberLabel}</p>
                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <span className="text-lg font-bold text-[#1e2e5c] tracking-wide">
                    {paymentSettings?.account_number ?? ''}
                  </span>
                  <button
                    onClick={handleCopyAccount}
                    className="p-2 bg-white rounded-md shadow-sm border border-gray-100 text-gray-600 active:scale-95 transition-all"
                  >
                    {copied ? (
                      <CheckCircle2 size={18} className="text-green-600" />
                    ) : (
                      <Copy size={18} />
                    )}
                  </button>
                </div>

                <p className="text-xs text-gray-500 mt-3">{py.accountNameLabel}</p>
                <p className="text-sm font-medium text-gray-800">
                  {paymentSettings?.account_name ?? ''}
                </p>
              </div>
            </div>
          </div>

          {/* Upload Slip Section */}
          <div>
            <h3 className="text-gray-900 font-bold mb-3">
              {py.attachSlip}
            </h3>

            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-gray-50 ${previewUrl ? 'border-[#1e2e5c] bg-blue-50/30' : 'border-gray-300'}`}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />

              {previewUrl ? (
                <div className="relative w-full">
                  <img
                    src={previewUrl}
                    alt="Slip Preview"
                    className="max-h-64 mx-auto rounded-lg shadow-sm"
                  />
                  <div className="mt-3 flex items-center justify-center gap-2 text-[#1e2e5c] text-sm font-medium">
                    <ImageIcon size={16} />
                    <span>{py.changeImage}</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-[#1e2e5c] mb-3">
                    <UploadCloud size={24} />
                  </div>
                  <p className="text-sm font-medium text-gray-700">
                    {py.tapToUpload}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {py.supportedFormats}
                  </p>
                </>
              )}
            </div>

            {errorMsg && (
              <div className="mt-3 bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                <AlertCircle size={18} />
                {errorMsg}
              </div>
            )}
          </div>
        </div>

        {/* Footer Action */}
        <div className="shrink-0 bg-white border-t border-gray-100 px-6 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20 space-y-3">
          <button
            onClick={handleSubmit}
            disabled={submitting || !file}
            className={`w-full py-3.5 rounded-xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2
              ${
                submitting || !file
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-[#1e2e5c] text-white hover:bg-[#2b4185] active:scale-[0.99]'
              }`}
          >
            {py.confirmPayment}
          </button>

          {isAdmin && (
            <button
              onClick={handleDevBypass}
              disabled={submitting}
              className={`w-full py-2.5 rounded-xl font-bold text-sm border-2 border-red-100 bg-red-50 transition-all flex items-center justify-center gap-2 ${submitting ? 'text-red-200 cursor-not-allowed' : 'text-red-400 hover:bg-red-100 hover:text-red-600'}`}
            >
              <ShieldAlert size={16} />
              [TEST ONLY] Bypass Payment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
