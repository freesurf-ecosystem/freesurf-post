import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Theme = "light" | "dark";
export type ThemeColors = {
  bg: string;
  bgAlt: string;
  surface: string;
  border: string;
  borderLight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  brand: string;
  brandDark: string;
  brandLight: string;
  brandSoft: string;
  success: string;
  warning: string;
  error: string;
};

const light: ThemeColors = {
  bg: "#ffffff",
  bgAlt: "#f8f8f6",
  surface: "#ffffff",
  border: "#e6e4df",
  borderLight: "#efeeea",
  text: "#1d1b18",
  textSecondary: "#5f5647",
  textMuted: "#8a8178",
  brand: "#1d1b18",
  brandDark: "#000000",
  brandLight: "#3d3a35",
  brandSoft: "#efefed",
  success: "#059669",
  warning: "#d97706",
  error: "#dc2626",
};

const dark: ThemeColors = {
  bg: "#0a0a0c",
  bgAlt: "#111115",
  surface: "#17171d",
  border: "#2c2c3a",
  borderLight: "#23232e",
  text: "#ffffff",
  textSecondary: "#b9b9c6",
  textMuted: "#8b8b9a",
  brand: "#6b8cff",
  brandDark: "#5a78e8",
  brandLight: "#8aa4ff",
  brandSoft: "#1b2440",
  success: "#34d399",
  warning: "#fbbf24",
  error: "#f87171",
};

type ThemeValue = { theme: Theme; colors: ThemeColors; toggleTheme: () => void };

const ThemeCtx = createContext<ThemeValue>({ theme: "light", colors: light, toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    AsyncStorage.getItem("freesurf-theme")
      .then((t) => { if (t === "dark" || t === "light") setTheme(t); })
      .catch(() => {});
  }, []);

  const value = useMemo<ThemeValue>(() => ({
    theme,
    colors: theme === "dark" ? dark : light,
    toggleTheme: () => {
      setTheme((prev) => {
        const next = prev === "dark" ? "light" : "dark";
        AsyncStorage.setItem("freesurf-theme", next).catch(() => {});
        return next;
      });
    },
  }), [theme]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
