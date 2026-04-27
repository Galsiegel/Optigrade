"use client";

import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DirectionsRunRoundedIcon from "@mui/icons-material/DirectionsRunRounded";
import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import AssessmentRoundedIcon from "@mui/icons-material/AssessmentRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import { Box, Button, Grid, Paper, Stack, Typography } from "@mui/material";
import { useOnboardingViewContext } from "@/app/onboarding/context/OnboardingViewContext";

export function TrackSelectionStep() {
  const {
    selectedTrack,
    setSelectedTrack,
    trackOptions,
    error,
    trackSaving,
    handleSaveTrack
  } = useOnboardingViewContext();

  return (
    <Box>
      <Grid container spacing={2}>
        {trackOptions.map((opt, idx) => {
          const selected = selectedTrack === opt.id;
          const icon =
            idx === 0 ? (
              <DirectionsRunRoundedIcon />
            ) : idx === 1 ? (
              <CategoryRoundedIcon />
            ) : idx === 2 ? (
              <AssessmentRoundedIcon />
            ) : (
              <FlagRoundedIcon />
            );

          return (
            <Grid item xs={12} sm={6} md={4} key={opt.id} sx={{ display: "flex" }}>
              <Paper
                component="button"
                type="button"
                onClick={() => setSelectedTrack(opt.id)}
                elevation={0}
                aria-pressed={selected}
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  p: 2.5,
                  borderRadius: 3,
                  border: "2px solid",
                  borderColor: selected ? "primary.main" : "divider",
                  bgcolor: selected ? "primary.light" : "background.paper",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "transform 120ms ease, border-color 120ms ease"
                }}
              >
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    mx: "auto",
                    mb: 1,
                    flexShrink: 0,
                    bgcolor: selected ? "primary.main" : "divider",
                    color: selected ? "primary.contrastText" : "text.secondary",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {icon}
                </Box>

                <Typography variant="h6" fontWeight={900} sx={{ flexShrink: 0 }}>
                  {opt.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, flexShrink: 0 }}>
                  {opt.description}
                </Typography>

                <Box
                  sx={{
                    mt: "auto",
                    pt: 1,
                    minHeight: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }}
                  aria-hidden={!selected}
                >
                  {selected ? <CheckCircleRoundedIcon color="primary" fontSize="small" /> : null}
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 2, textAlign: "center" }}>
          {error}
        </Typography>
      )}

      <Stack direction="row" justifyContent="center" sx={{ mt: 4, gap: 2, flexWrap: "wrap" }}>
        <Button variant="outlined" disabled>
          אחורה
        </Button>
        <Button
          variant="contained"
          disabled={trackSaving || !selectedTrack}
          onClick={handleSaveTrack}
          sx={{ minWidth: 180 }}
        >
          {trackSaving ? "שומר..." : "המשך"}
        </Button>
      </Stack>
    </Box>
  );
}

