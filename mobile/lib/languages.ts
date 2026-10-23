import type { LangCode } from "../lib/i18n";

export const SUPPORTED_LANGUAGES: { code: LangCode; name: string; native: string }[] = [
  { code: "en", name: "English", native: "English" },
  { code: "es", name: "Español", native: "Español" },
  { code: "fr", name: "Français", native: "Français" },
  { code: "hi", name: "हिन्दी", native: "हिन्दी" },
  { code: "it", name: "Italiano", native: "Italiano" },
  { code: "pt", name: "Português", native: "Português" },
  { code: "ja", name: "日本語", native: "日本語" },
  { code: "zh", name: "中文", native: "中文" },
  { code: "ar", name: "العربية", native: "العربية" },
];

export const LOCALE_NAMES = SUPPORTED_LANGUAGES.reduce((acc, lang) => {
  acc[lang.code] = lang.native;
  return acc;
}, {} as Record<LangCode, string>);

export const LANGUAGE_LABELS = {
  en: "Language",
  es: "Idioma",
  fr: "Langue",
  hi: "भाषा",
  it: "Lingua",
  pt: "Idioma",
  ja: "言語",
  zh: "语言",
  ar: "لغة",
};