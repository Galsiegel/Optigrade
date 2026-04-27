"use client";

import { Box, Button, TextField, Typography } from "@mui/material";
import { fadeIn } from "@/app/onboarding/styles/animations";
import { useOnboardingViewContext } from "@/app/onboarding/context/OnboardingViewContext";

export function NameStep() {
  const {
    firstName,
    lastName,
    nameSaving,
    error,
    setFirstName,
    setLastName,
    setError,
    handleSaveName
  } = useOnboardingViewContext();

  return (
    <Box component="form" onSubmit={handleSaveName} sx={{ animation: `${fadeIn} 0.6s ease-out`, textAlign: "center" }}>
      <Typography color="text.secondary" sx={{ mb: 4, maxWidth: 420, mx: "auto" }}>
        לפני שנתחיל, יש לכתוב שם ושם משפחה כפי שרשומים בטכניון
      </Typography>

      <Box sx={{ display: "flex", gap: 2, mb: 3, flexDirection: { xs: "column", sm: "row" } }}>
        <TextField
          fullWidth
          placeholder="שם פרטי"
          value={firstName}
          onChange={(e) => {
            setFirstName(e.target.value);
            setError(null);
          }}
          disabled={nameSaving}
          autoFocus
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 3,
              fontSize: "1.125rem",
              "& fieldset": { borderWidth: 2 },
              "&:hover fieldset": { borderWidth: 2 }
            }
          }}
          inputProps={{ maxLength: 50, "aria-label": "שם פרטי" }}
        />
        <TextField
          fullWidth
          placeholder="שם משפחה"
          value={lastName}
          onChange={(e) => {
            setLastName(e.target.value);
            setError(null);
          }}
          disabled={nameSaving}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 3,
              fontSize: "1.125rem",
              "& fieldset": { borderWidth: 2 },
              "&:hover fieldset": { borderWidth: 2 }
            }
          }}
          inputProps={{ maxLength: 50, "aria-label": "שם משפחה" }}
        />
      </Box>

      {error && (
        <Typography color="error" variant="body2" sx={{ mb: 2, mt: -2 }}>
          {error}
        </Typography>
      )}

      <Button
        type="submit"
        variant="contained"
        size="large"
        disabled={nameSaving || !firstName.trim() || !lastName.trim()}
        sx={{ px: 4, py: 1.5, fontSize: "1rem", fontWeight: 700, borderRadius: 3 }}
      >
        {nameSaving ? "שומר..." : "המשך"}
      </Button>
    </Box>
  );
}

