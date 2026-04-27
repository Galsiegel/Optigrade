"use client";

import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { getDisplayName } from "@/lib/users";
import { useOnboardingViewContext } from "@/app/onboarding/context/OnboardingViewContext";

export function FinishStep() {
  const {
    profile,
    summaryTrackLabel,
    finishStepCatalogLoading,
    finishStepCatalogSummary
  } = useOnboardingViewContext();

  return (
    <Box
      component="section"
      aria-labelledby="onboarding-finish-summary-heading"
      sx={{
        textAlign: "right",
        maxWidth: 560,
        mx: "auto",
        py: 1,
        px: { xs: 0, sm: 1 }
      }}
    >
      <Typography
        id="onboarding-finish-summary-heading"
        variant="h5"
        component="h2"
        fontWeight={900}
        sx={{ mb: 3, letterSpacing: "-0.02em" }}
      >
        הסטודנט: {getDisplayName(profile) ?? "—"}
      </Typography>
      <Stack component="dl" spacing={2.5} sx={{ m: 0 }}>
        <Box>
          <Typography component="dt" variant="subtitle2" fontWeight={700} color="text.secondary" sx={{ mb: 0.5 }}>
            מסלול
          </Typography>
          <Typography component="dd" variant="body1" sx={{ m: 0, fontWeight: 600 }}>
            {summaryTrackLabel ?? "—"}
          </Typography>
        </Box>
        <Box>
          <Typography component="dt" variant="subtitle2" fontWeight={700} color="text.secondary" sx={{ mb: 0.5 }}>
            קטלוג
          </Typography>
          <Box component="dd" sx={{ m: 0, minHeight: 28, display: "flex", alignItems: "center" }}>
            {finishStepCatalogLoading ? (
              <CircularProgress size={22} aria-label="טוען פרטי קטלוג" />
            ) : (
              <Typography
                component="span"
                variant="body1"
                fontWeight={600}
                dir="ltr"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {finishStepCatalogSummary ?? "—"}
              </Typography>
            )}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}

