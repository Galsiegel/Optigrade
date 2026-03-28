import { alpha, createTheme, ThemeOptions } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    accent: Palette["primary"];
  }
  interface PaletteOptions {
    accent?: PaletteOptions["primary"];
  }
}

export const lightPalette = {
  mode: "light" as const,
  primary: {
    main: "#2563eb",
    light: "#60a5fa",
    dark: "#1d4ed8"
  },
  secondary: {
    main: "#9333ea"
  },
  accent: {
    main: "#f97316"
  },
  background: {
    default: "#f9fafb",
    paper: "#ffffff"
  }
};

export const darkPalette = {
  mode: "dark" as const,
  primary: {
    main: "#60a5fa",
    light: "#93c5fd",
    dark: "#1d4ed8"
  },
  secondary: {
    main: "#c4b5fd"
  },
  accent: {
    main: "#fb923c"
  },
  background: {
    default: "#020617",
    paper: "#020617"
  }
};

const baseTypography = {
  fontFamily: "var(--font-heebo), system-ui, sans-serif"
};

const baseComponents: ThemeOptions["components"] = {
  MuiCssBaseline: {
    styleOverrides: (theme) => {
      const dark = theme.palette.mode === "dark";
      const track = dark
        ? alpha(theme.palette.common.white, 0.06)
        : alpha(theme.palette.common.black, 0.06);
      const thumb = dark
        ? alpha(theme.palette.common.white, 0.22)
        : alpha(theme.palette.common.black, 0.2);
      const thumbHover = dark
        ? alpha(theme.palette.common.white, 0.34)
        : alpha(theme.palette.common.black, 0.32);

      return {
        "button, input, select, textarea": {
          fontFamily: "inherit",
          fontSize: "inherit",
          letterSpacing: "inherit"
        },
        "*": {
          scrollbarWidth: "thin",
          scrollbarColor: `${thumb} ${track}`
        },
        "*::-webkit-scrollbar": {
          width: 9,
          height: 9
        },
        "*::-webkit-scrollbar-track": {
          backgroundColor: track,
          borderRadius: 999
        },
        "*::-webkit-scrollbar-thumb": {
          backgroundColor: thumb,
          borderRadius: 999,
          border: `2px solid ${track}`
        },
        "*::-webkit-scrollbar-thumb:hover": {
          backgroundColor: thumbHover
        }
      };
    }
  },
  MuiButton: {
    defaultProps: {
      disableElevation: true
    },
    styleOverrides: {
      root: {
        borderRadius: 999,
        textTransform: "none",
        fontWeight: 600
      }
    }
  },
  MuiContainer: {
    defaultProps: {
      maxWidth: "lg"
    }
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        borderRadius: 16
      }
    }
  },
  MuiInputBase: {
    styleOverrides: {
      input: {
        textAlign: "right",
        "&::placeholder": {
          textAlign: "right",
          direction: "rtl",
          opacity: 0.7
        }
      }
    }
  },
  MuiOutlinedInput: {
    styleOverrides: {
      input: {
        textAlign: "right"
      },
      // MUI NotchedOutline defaults fieldset to textAlign:left; RTL labels need the gap on the right.
      notchedOutline: {
        textAlign: "right"
      }
    }
  },
  // MUI InputLabel uses fixed LTR geometry (left:0, translateX positive); mirror for RTL Hebrew.
  MuiInputLabel: {
    styleOverrides: {
      root: ({ theme }) =>
        theme.direction === "rtl"
          ? {
              "&.MuiInputLabel-formControl": {
                left: "auto",
                right: 0,
                transformOrigin: "top right",
                textAlign: "right"
              },
              "&.MuiInputLabel-outlined:not(.MuiInputLabel-shrink)": {
                transform: "translate(-14px, 16px) scale(1)"
              },
              "&.MuiInputLabel-outlined.MuiInputLabel-sizeSmall:not(.MuiInputLabel-shrink)": {
                transform: "translate(-14px, 9px) scale(1)"
              },
              "&.MuiInputLabel-outlined.MuiInputLabel-shrink": {
                transform: "translate(-14px, -9px) scale(0.75)"
              }
            }
          : {}
    }
  }
};

export const createAppTheme = (mode: "light" | "dark") =>
  createTheme({
    direction: "rtl",
    palette: mode === "light" ? lightPalette : darkPalette,
    typography: baseTypography,
    components: baseComponents
  });

