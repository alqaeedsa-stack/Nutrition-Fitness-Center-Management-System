import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Language = 'ar' | 'en';

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  isArabic: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = 'alqaeed-language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === 'en' ? 'en' : 'ar';
  });

  function setLanguage(language: Language) {
    setLanguageState(language);
    window.localStorage.setItem(STORAGE_KEY, language);
  }

  function toggleLanguage() {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  }

  useEffect(() => {
    const isArabic = language === 'ar';
    document.documentElement.lang = language;
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
    document.body.dir = isArabic ? 'rtl' : 'ltr';
    document.body.classList.toggle('lang-ar', isArabic);
    document.body.classList.toggle('lang-en', !isArabic);
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, isArabic: language === 'ar' }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}

export function LanguageSwitcher() {
  const { language, toggleLanguage } = useLanguage();
  return (
    <button
      type="button"
      className="language-switcher"
      onClick={toggleLanguage}
      aria-label={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
      title={language === 'ar' ? 'English' : 'العربية'}
    >
      <span className={language === 'ar' ? 'active' : ''}>عربي</span>
      <span className="language-divider">|</span>
      <span className={language === 'en' ? 'active' : ''}>EN</span>
    </button>
  );
}
