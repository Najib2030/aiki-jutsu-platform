// src/i18n.js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en/translation.json';
import fr from './locales/fr/translation.json';
import ar from './locales/ar/translation.json';

import chatEn from './locales/en/chat.json';
import chatFr from './locales/fr/chat.json';
import chatAr from './locales/ar/chat.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'ar', label: 'العربية',  dir: 'rtl' },
];

function applyDocumentDirection(lng) {
  const isRtl = lng === 'ar';
  document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lng);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en, chat: chatEn },
      fr: { translation: fr, chat: chatFr },
      ar: { translation: ar, chat: chatAr },
    },

    // Default namespace for all t() calls — chat is opt-in via useTranslation('chat')
    ns: ['translation', 'chat'],
    defaultNS: 'translation',
    fallbackNS: 'translation',

    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'ar'],
    load: 'languageOnly',
    interpolation: { escapeValue: false },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },

    debug: import.meta.env.DEV,
    saveMissing: false,
    missingKeyHandler: false,
  });

applyDocumentDirection(i18n.language || 'en');
i18n.on('languageChanged', applyDocumentDirection);

export default i18n;