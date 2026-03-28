"use client";

import { CssBaseline, GlobalStyles, PaletteMode } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { ReactNode, useEffect, useMemo, useState, useCallback } from "react";
import { createAppTheme } from "./theme";
import { ThemeModeProvider } from "./ThemeModeContext";

type Props = {
  children: ReactNode;
};

const STORAGE_KEY = "gmarim-color-mode";

export default function ThemeRegistry({ children }: Props) {
  const [mode, setMode] = useState<PaletteMode>("light");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as PaletteMode | null;
    if (stored === "light" || stored === "dark") {
      setMode(stored);
    } else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      setMode("dark");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, mode);
    document.documentElement.setAttribute("data-color-mode", mode);
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <ThemeModeProvider mode={mode} onToggle={toggleMode}>
        <CssBaseline />
        <GlobalStyles
          styles={{
            ".skip-to-content": {
              position: "fixed",
              insetInlineStart: 8,
              top: 8,
              zIndex: 10000,
              padding: "10px 16px",
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: "none",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              clip: "rect(0, 0, 0, 0)",
              clipPath: "inset(50%)",
              height: 1,
              width: 1,
              overflow: "hidden",
              whiteSpace: "nowrap",
              border: 0
            },
            ".skip-to-content:is(:focus, :focus-visible)": {
              clip: "auto",
              clipPath: "none",
              height: "auto",
              width: "auto",
              overflow: "visible",
              whiteSpace: "normal"
            }
          }}
        />
        {children}
      </ThemeModeProvider>
    </ThemeProvider>
  );
}

