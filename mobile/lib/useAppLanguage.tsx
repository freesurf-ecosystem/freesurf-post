import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from "./languages";
import { useTranslation } from "./i18n";
import { extraTranslations, mediaTranslations } from "./i18n-extra";
import type { LangCode } from "./i18n";

const STORAGE_KEY = "@freesurf-app-lang";

type LanguageContextValue = {
  lang: LangCode;
  loaded: boolean;
  setLanguage: (code: string) => Promise<void>;
  T: ReturnType<typeof useTranslation> & Record<string, string>;
  LANGUAGE_LABELS: typeof LANGUAGE_LABELS;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<LangCode>("en");
  const [loaded, setLoaded] = useState(false);

  const setLanguage = useCallback(async (code: string) => {
    const supported = SUPPORTED_LANGUAGES.find((l) => l.code === code);
    const normalized = (supported ? supported.code : "en") as LangCode;
    setLang(normalized);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, normalized);
    } catch (e) {
      console.warn("[language] async storage failed", e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const supported = stored && SUPPORTED_LANGUAGES.find((l) => l.code === stored);
        if (mounted && supported) setLang(supported.code as LangCode);
      } catch (e) {
        console.warn("[language] init failed", e);
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const base = useTranslation(lang);
  const value: LanguageContextValue = {
    lang,
    loaded,
    setLanguage,
    T: { ...base, ...(extraTranslations[lang] || {}), ...(mediaTranslations[lang] || {}) },
    LANGUAGE_LABELS,
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useAppLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useAppLanguage must be used within a LanguageProvider");
  return ctx;
}

export type { LangCode };