"use client";

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode
} from "react";
import type { PaletteMode } from "@mui/material";

type ThemeModeContextValue = {
  mode: PaletteMode;
  toggleMode: () => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeModeProvider({
  children,
  mode,
  onToggle
}: {
  children: ReactNode;
  mode: PaletteMode;
  onToggle: () => void;
}) {
  const value: ThemeModeContextValue = {
    mode,
    toggleMode: useCallback(onToggle, [onToggle])
  };
  return (
    <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within ThemeModeProvider");
  }
  return context;
}
