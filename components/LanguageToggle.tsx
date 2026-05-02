'use client';

import { useLanguage } from '@/lib/LanguageContext';

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      onClick={() => setLanguage(language === 'th' ? 'en' : 'th')}
      className="flex items-center gap-0.5 bg-gray-100 hover:bg-gray-200 rounded-lg px-2 py-1 transition-colors text-[11px] font-bold text-gray-600"
      aria-label="Toggle language"
    >
      <span className={language === 'th' ? 'text-[#1e2e5c]' : 'text-gray-400'}>TH</span>
      <span className="text-gray-300 mx-0.5">|</span>
      <span className={language === 'en' ? 'text-[#1e2e5c]' : 'text-gray-400'}>EN</span>
    </button>
  );
}
