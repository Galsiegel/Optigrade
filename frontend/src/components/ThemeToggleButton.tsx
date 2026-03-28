"use client";

import { IconButton, Tooltip } from "@mui/material";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { useThemeMode } from "@/theme/ThemeModeContext";

export function ThemeToggleButton() {
  const { mode, toggleMode } = useThemeMode();

  return (
    <Tooltip title={mode === "dark" ? "מצב בהיר" : "מצב כהה"}>
      <IconButton
        onClick={toggleMode}
        color="inherit"
        role="switch"
        aria-checked={mode === "dark"}
        aria-label={mode === "dark" ? "עבור למצב בהיר" : "עבור למצב כהה"}
      >
        {mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  );
}
