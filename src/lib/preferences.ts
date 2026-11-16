"use client";

import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Local display preferences.
//
// The reference settings page owns a handful of browser-level preferences
// (performance mode, language, region, history/privacy switches). Reelhouse
// has no account-preferences table, so these are deliberately local and shared
// through one tiny external store: the navbar quality switch and the settings
// page edit the same value, and every mounted consumer re-renders together.
// ---------------------------------------------------------------------------

export type QualityMode = "auto" | "performance" | "default" | "hd";

export interface AppSettings {
  quality: QualityMode;
  language: string;
  country: string;
  saveHistory: boolean;
  hideMature: boolean;
}

const KEY = "reelhouse:settings";

export const DEFAULT_SETTINGS: AppSettings = {
  quality: "hd",
  language: "en",
  country: "auto",
  saveHistory: true,
  hideMature: false,
};

let cache: AppSettings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

function read(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      quality: isQuality(parsed.quality) ? parsed.quality : DEFAULT_SETTINGS.quality,
      language: typeof parsed.language === "string" ? parsed.language : "en",
      country: typeof parsed.country === "string" ? parsed.country : "auto",
      saveHistory:
        typeof parsed.saveHistory === "boolean"
          ? parsed.saveHistory
          : DEFAULT_SETTINGS.saveHistory,
      hideMature:
        typeof parsed.hideMature === "boolean"
          ? parsed.hideMature
          : DEFAULT_SETTINGS.hideMature,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  cache = read();
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    cache = read();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSettings(): AppSettings {
  ensureLoaded();
  return cache;
}

export function updateSettings(patch: Partial<AppSettings>): void {
  ensureLoaded();
  cache = { ...cache, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* quota / private mode — keep the in-memory copy */
  }
  emit();
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(
    subscribe,
    () => cache,
    () => DEFAULT_SETTINGS
  );
}

function isQuality(value: unknown): value is QualityMode {
  return (
    value === "auto" ||
    value === "performance" ||
    value === "default" ||
    value === "hd"
  );
}

export const QUALITY_MODES: {
  value: QualityMode;
  label: string;
  sub: string;
}[] = [
  { value: "auto", label: "Auto", sub: "Adapts" },
  { value: "performance", label: "Performance", sub: "Fastest" },
  { value: "default", label: "Default", sub: "Balanced" },
  { value: "hd", label: "HD", sub: "Sharpest" },
];

export interface LanguageOption {
  value: string;
  label: string;
  native: string;
  cc: string;
}

export const LANGUAGES: LanguageOption[] = [
  { value: "en", label: "English", native: "English", cc: "gb" },
  { value: "es", label: "Spanish", native: "Español", cc: "es" },
  { value: "fr", label: "French", native: "Français", cc: "fr" },
  { value: "de", label: "German", native: "Deutsch", cc: "de" },
  { value: "it", label: "Italian", native: "Italiano", cc: "it" },
  { value: "pt", label: "Portuguese", native: "Português", cc: "br" },
  { value: "ar", label: "Arabic", native: "العربية", cc: "sa" },
  { value: "hi", label: "Hindi", native: "हिन्दी", cc: "in" },
  { value: "ja", label: "Japanese", native: "日本語", cc: "jp" },
  { value: "ko", label: "Korean", native: "한국어", cc: "kr" },
  { value: "zh", label: "Chinese", native: "中文", cc: "cn" },
  { value: "ru", label: "Russian", native: "Русский", cc: "ru" },
  { value: "tr", label: "Turkish", native: "Türkçe", cc: "tr" },
  { value: "id", label: "Indonesian", native: "Bahasa Indonesia", cc: "id" },
  { value: "th", label: "Thai", native: "ไทย", cc: "th" },
  { value: "vi", label: "Vietnamese", native: "Tiếng Việt", cc: "vn" },
];

export interface CountryOption {
  value: string;
  label: string;
  cc?: string;
}

export const COUNTRIES: CountryOption[] = [
  { value: "auto", label: "Auto (detect)" },
  { value: "US", label: "United States", cc: "us" },
  { value: "GB", label: "United Kingdom", cc: "gb" },
  { value: "IN", label: "India", cc: "in" },
  { value: "CA", label: "Canada", cc: "ca" },
  { value: "AU", label: "Australia", cc: "au" },
  { value: "DE", label: "Germany", cc: "de" },
  { value: "FR", label: "France", cc: "fr" },
  { value: "JP", label: "Japan", cc: "jp" },
  { value: "BR", label: "Brazil", cc: "br" },
  { value: "KR", label: "South Korea", cc: "kr" },
  { value: "MX", label: "Mexico", cc: "mx" },
  { value: "ES", label: "Spain", cc: "es" },
  { value: "IT", label: "Italy", cc: "it" },
  { value: "NL", label: "Netherlands", cc: "nl" },
  { value: "NZ", label: "New Zealand", cc: "nz" },
  { value: "ZA", label: "South Africa", cc: "za" },
  { value: "NG", label: "Nigeria", cc: "ng" },
];

export function languageOption(value: string): LanguageOption {
  return LANGUAGES.find((language) => language.value === value) ?? LANGUAGES[0];
}

export function countryOption(value: string): CountryOption {
  return COUNTRIES.find((country) => country.value === value) ?? COUNTRIES[0];
}
