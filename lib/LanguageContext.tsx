'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, Language, Translations } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'th',
  setLanguage: () => {},
  t: translations.th,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('th');

  useEffect(() => {
    const saved = localStorage.getItem('prokick_lang') as Language | null;
    if (saved === 'en' || saved === 'th') {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    localStorage.setItem('prokick_lang', lang);
    setLanguageState(lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
