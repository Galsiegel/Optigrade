"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseDb } from "@/firebase/config";
import { FirebaseError } from "firebase/app";
import { doc, getDoc } from "firebase/firestore";
import {
  setOnboardingCompleted,
  updateUserName,
  updateUserTrack,
  updateUserStudyAndCatalog,
  getDisplayName
} from "@/lib/users";
import {
  OnboardingViewProvider,
  type OnboardingViewContextValue
} from "@/app/onboarding/context/OnboardingViewContext";
import { NameStep } from "@/app/onboarding/steps/NameStep";
import { FinishStep } from "@/app/onboarding/steps/FinishStep";
import { TrackSelectionStep } from "@/app/onboarding/steps/TrackSelectionStep";
import { UserCoursesGradesPanel } from "@/components/userCourses/UserCoursesGradesPanel";
import { buildStudyYearSelectOptions, formatAcademicYearSpan } from "@/lib/hebrewYear";
import {
  fetchCatalogRecords,
  filterCatalogsFromStudyStart,
  type CatalogRecord
} from "@/lib/catalogs";
import { fetchTrackRecords, type TrackRecord } from "@/lib/tracks";
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
  keyframes
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const progressFlow = keyframes`
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
`;

const isDev = process.env.NODE_ENV === "development";

type OnboardingStage = "name" | "track";
const STEP_LABELS = ["מסלול", "קטלוג", "ציונים", "סיום"] as const;

const STEP_DESCRIPTIONS = [
  "בחרו את מסלול הלימודים המתאים. הבחירה תישמר בפרופיל.",
  "בחרו את שנת ההתחלה בעברית ואת קטלוג הקורסים הרלוונטי ללימודים שלכם.",
  "הזנת ציונים והתאמה לדרישות — תוכן מלא יתווסף בשלב זה.",
  "סיכום פרטים וסיום תהליך ההגעה לאפליקציה."
] as const;

/** Larger stepper (scrolls with the page — not fixed, avoids covering content) */
const STEPPER_CIRCLE_PX = 52;
const STEPPER_RAIL_HEIGHT_PX = 5;

/** Padding below fixed theme/dev controls only */
const TRACK_PAGE_TOP_SAFE_PX = 64;

const TRACK_STEP_CARD_HEIGHT_MS = 480;
const TRACK_STEP_CARD_HEIGHT_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Reversible number ↔ check crossfade inside step circles */
const STEPPER_ICON_MS = 460;
const STEPPER_ICON_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const STEPPER_ICON_EASE_SPRING = "cubic-bezier(0.33, 1.2, 0.55, 1)";

export default function OnboardingPage() {
  const { user, profile, viewAsRegularUser, setViewAsRegularUser, refreshProfile, loading } =
    useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectTo = useMemo(() => {
    const raw = searchParams.get("redirect") || "/dashboard";
    return raw.startsWith("/") ? raw : "/dashboard";
  }, [searchParams]);

  const stage: OnboardingStage | "done" = useMemo(() => {
    if (!profile) return "name";
    const hasName = !!profile.firstName?.trim() && !!profile.lastName?.trim();
    if (!hasName) return "name";
    // steps UI start only after name; completion is driven by onboardingCompleted
    if (!profile.track?.trim()) return "track";
    if (!profile.onboardingCompleted) return "track";
    return "done";
  }, [profile]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [trackSaving, setTrackSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [studyStartHebrewYearStr, setStudyStartHebrewYearStr] = useState("");
  const [selectedCatalogIdLocal, setSelectedCatalogIdLocal] = useState<string>("");
  const [allTracks, setAllTracks] = useState<TrackRecord[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState<string | null>(null);
  const [allCatalogs, setAllCatalogs] = useState<CatalogRecord[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);
  const [catalogFetchNonce, setCatalogFetchNonce] = useState(0);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [finishStepCatalogSummary, setFinishStepCatalogSummary] = useState<string | null>(null);
  const [finishStepCatalogLoading, setFinishStepCatalogLoading] = useState(false);

  const trackStepCardInnerRef = useRef<HTMLDivElement | null>(null);
  const [trackStepCardHeight, setTrackStepCardHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setSelectedTrack(profile.track ?? null);
    setStudyStartHebrewYearStr(
      profile.startingYear != null && Number.isFinite(profile.startingYear)
        ? String(profile.startingYear)
        : ""
    );
    setSelectedCatalogIdLocal(profile.catalog ?? "");
  }, [profile]);

  useEffect(() => {
    if (loading) return;
    if (stage !== "done") return;
    router.replace(redirectTo as Parameters<typeof router.replace>[0]);
  }, [loading, stage, router, redirectTo]);

  const stepRaw = searchParams.get("step");
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  useEffect(() => {
    const stepParam = Number(stepRaw || "1");
    const normalized = Number.isFinite(stepParam) && stepParam >= 1 && stepParam <= 4 ? stepParam : 1;
    setCurrentStep(normalized as 1 | 2 | 3 | 4);
  }, [stepRaw]);

  const activeStepIndex = currentStep - 1;

  useEffect(() => {
    if (stage !== "track" || !user) return;
    let cancelled = false;
    setTracksLoading(true);
    setTracksError(null);
    fetchTrackRecords(firebaseDb)
      .then((rows) => {
        if (!cancelled) setAllTracks(rows);
      })
      .catch((err: unknown) => {
        console.error("fetchTrackRecords:", err);
        if (!cancelled) {
          if (err instanceof FirebaseError && err.code === "permission-denied") {
            setTracksError(
              "הגישה למסלולים נחסמה. עדכנו את חוקי האבטחה ל-collection בשם tracks למשתמשים מחוברים, ופרסו את ה-rules."
            );
          } else {
            setTracksError("לא הצלחנו לטעון את רשימת המסלולים. נסו שוב.");
          }
        }
      })
      .finally(() => {
        if (!cancelled) setTracksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stage, user]);

  const studyYearSelectOptions = useMemo(() => buildStudyYearSelectOptions(new Date()), []);

  useEffect(() => {
    if (stage !== "track" || currentStep !== 2 || !user) return;
    let cancelled = false;
    setCatalogsLoading(true);
    setCatalogsError(null);
    fetchCatalogRecords(firebaseDb)
      .then((rows) => {
        if (!cancelled) setAllCatalogs(rows);
      })
      .catch((err: unknown) => {
        console.error("fetchCatalogRecords:", err);
        if (!cancelled) {
          if (err instanceof FirebaseError && err.code === "permission-denied") {
            setCatalogsError(
              "הגישה לקטלוגים נחסמה. עדכנו את חוקי האבטחה ב-Firestore כך שיקראו ל-collection בשם catalogs למשתמשים מחוברים, ואז הריצו deploy של ה-rules (למשל: firebase deploy --only firestore:rules)."
            );
          } else {
            setCatalogsError("לא הצלחנו לטעון את רשימת הקטלוגים. נסו שוב.");
          }
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stage, currentStep, user, catalogFetchNonce]);

  const filteredCatalogs = useMemo(() => {
    const hy = Number.parseInt(studyStartHebrewYearStr, 10);
    if (!Number.isFinite(hy)) return [];
    return filterCatalogsFromStudyStart(allCatalogs, hy);
  }, [allCatalogs, studyStartHebrewYearStr]);

  useEffect(() => {
    if (!selectedCatalogIdLocal) return;
    if (!filteredCatalogs.some((c) => c.id === selectedCatalogIdLocal)) {
      setSelectedCatalogIdLocal("");
    }
  }, [filteredCatalogs, selectedCatalogIdLocal]);

  useEffect(() => {
    if (stage !== "track" || currentStep !== 4 || !profile?.catalog) {
      setFinishStepCatalogSummary(null);
      setFinishStepCatalogLoading(false);
      return;
    }
    let cancelled = false;
    setFinishStepCatalogLoading(true);
    setFinishStepCatalogSummary(null);
    getDoc(doc(firebaseDb, "catalogs", profile.catalog))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setFinishStepCatalogSummary("—");
          return;
        }
        const d = snap.data();
        const y = typeof d.year === "number" ? d.year : Number(d.year);
        const heb = d.hebYear != null ? String(d.hebYear).trim() : "";
        if (heb && Number.isFinite(y)) {
          setFinishStepCatalogSummary(`${heb} ${formatAcademicYearSpan(y)}`);
        } else {
          setFinishStepCatalogSummary(
            heb || (Number.isFinite(y) ? formatAcademicYearSpan(y) : "—")
          );
        }
      })
      .catch(() => {
        if (!cancelled) setFinishStepCatalogSummary("—");
      })
      .finally(() => {
        if (!cancelled) setFinishStepCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stage, currentStep, profile?.catalog]);

  useLayoutEffect(() => {
    if (stage !== "track" || currentStep === 1) {
      setTrackStepCardHeight(null);
      return;
    }
    const el = trackStepCardInnerRef.current;
    if (!el) return;

    const update = () => {
      setTrackStepCardHeight(el.scrollHeight);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [
    stage,
    currentStep,
    catalogsLoading,
    catalogsError,
    studyStartHebrewYearStr,
    filteredCatalogs.length,
    selectedCatalogIdLocal,
    allCatalogs.length
  ]);

  const trackOptions = allTracks;

  const summaryTrackLabel = useMemo(() => {
    if (!profile?.track) return null;
    const opt = trackOptions.find((o) => o.id === profile.track);
    return opt?.title ?? profile.track;
  }, [profile?.track, trackOptions]);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      setError("נא להזין שם פרטי ושם משפחה");
      return;
    }

    setNameSaving(true);
    try {
      await updateUserName(firebaseDb, user.uid, trimmedFirst, trimmedLast);
      await refreshProfile();
    } catch (err) {
      console.error(err);
      setError("משהו השתבש. נסה שוב.");
    } finally {
      setNameSaving(false);
    }
  }

  const handleSaveTrack = async () => {
    if (!user) return;
    if (!selectedTrack) return;
    setError(null);
    setTrackSaving(true);
    try {
      await updateUserTrack(firebaseDb, user.uid, selectedTrack);
      await refreshProfile();
      // advance to next onboarding step (placeholders for now)
      router.replace(
        (`/onboarding?step=2&redirect=${encodeURIComponent(redirectTo)}`) as Parameters<
          typeof router.replace
        >[0]
      );
    } catch (err) {
      console.error(err);
      setError("משהו השתבש. נסה שוב.");
    } finally {
      setTrackSaving(false);
    }
  };

  const handleSaveCatalogStep = async () => {
    if (!user) return;
    const hy = Number.parseInt(studyStartHebrewYearStr, 10);
    if (!Number.isFinite(hy) || !selectedCatalogIdLocal) return;
    setError(null);
    setCatalogSaving(true);
    try {
      await updateUserStudyAndCatalog(firebaseDb, user.uid, {
        startingYear: hy,
        catalog: selectedCatalogIdLocal
      });
      await refreshProfile();
      router.replace(
        (`/onboarding?step=3&redirect=${encodeURIComponent(redirectTo)}`) as Parameters<
          typeof router.replace
        >[0]
      );
    } catch (err) {
      console.error(err);
      setError("משהו השתבש. נסה שוב.");
    } finally {
      setCatalogSaving(false);
    }
  };

  const onboardingViewContextValue = useMemo<OnboardingViewContextValue>(
    () => ({
      firstName,
      lastName,
      nameSaving,
      error,
      setFirstName,
      setLastName,
      setError,
      handleSaveName,
      profile,
      summaryTrackLabel,
      finishStepCatalogLoading,
      finishStepCatalogSummary,
      selectedTrack,
      setSelectedTrack,
      trackOptions,
      tracksLoading,
      tracksError,
      trackSaving,
      handleSaveTrack
    }),
    [
      firstName,
      lastName,
      nameSaving,
      error,
      profile,
      summaryTrackLabel,
      finishStepCatalogLoading,
      finishStepCatalogSummary,
      selectedTrack,
      trackOptions,
      tracksLoading,
      tracksError,
      trackSaving
    ]
  );

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: stage === "track" ? "flex-start" : "center",
        justifyContent: "center",
        background: (theme) =>
          theme.palette.mode === "dark"
            ? "radial-gradient(ellipse at 30% 20%, rgba(37, 99, 235, 0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(147, 51, 234, 0.1) 0%, transparent 50%)"
            : "radial-gradient(ellipse at 30% 20%, rgba(37, 99, 235, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(147, 51, 234, 0.06) 0%, transparent 50%)"
      }}
    >
      <Box
        sx={{
          position: "fixed",
          top: 16,
          right: 16,
          left: 16,
          zIndex: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start"
        }}
      >
        {isDev && profile?.role === "admin" && viewAsRegularUser ? (
          <Button
            size="small"
            color="inherit"
            onClick={() => {
              setViewAsRegularUser(false);
              router.push("/dashboard");
            }}
            sx={{ fontSize: "0.75rem" }}
          >
            יציאה ממצב משתמש
          </Button>
        ) : (
          <Box />
        )}
        <ThemeToggleButton />
      </Box>

      <Container
        maxWidth={stage === "track" ? "lg" : "sm"}
        sx={
          stage === "track"
            ? {
                width: "100%",
                pt: `${TRACK_PAGE_TOP_SAFE_PX}px`,
                pb: 6
              }
            : { py: 6 }
        }
      >
        <OnboardingViewProvider value={onboardingViewContextValue}>
        {stage === "track" && (
          <>
            <Box sx={{ width: "100%", pt: 1, pb: 1.25 }}>
                <Box
                  component="nav"
                  aria-label="התקדמות באשף הקליטה"
                  sx={(theme) => {
                    const circle = STEPPER_CIRCLE_PX;
                    const railH = STEPPER_RAIL_HEIGHT_PX;
                    const top = circle / 2 - railH / 2;
                    const n = STEP_LABELS.length;
                    const progress =
                      STEP_LABELS.length <= 1 ? 0 : activeStepIndex / (STEP_LABELS.length - 1);
                    const railInset = n >= 1 ? `calc(100% / ${2 * n})` : "0px";

                    return {
                      position: "relative",
                      isolation: "isolate",
                      "&::before": {
                        content: '""',
                        position: "absolute",
                        insetInline: railInset,
                        top,
                        height: railH,
                        borderRadius: 999,
                        backgroundColor: theme.palette.divider,
                        opacity: theme.palette.mode === "dark" ? 0.55 : 1,
                        zIndex: 0,
                        pointerEvents: "none"
                      },
                      "&::after": {
                        content: '""',
                        position: "absolute",
                        insetInline: railInset,
                        top,
                        height: railH,
                        borderRadius: 999,
                        background:
                          theme.palette.mode === "dark"
                            ? "linear-gradient(90deg, rgba(96,165,250,0.9), rgba(196,181,253,0.9), rgba(96,165,250,0.9))"
                            : "linear-gradient(90deg, rgba(37,99,235,0.9), rgba(147,51,234,0.9), rgba(37,99,235,0.9))",
                        backgroundSize: "200% 100%",
                        animation: `${progressFlow} 2.2s linear infinite`,
                        transform: `scaleX(${progress})`,
                        transformOrigin: "right",
                        transition: "transform 520ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                        boxShadow:
                          theme.palette.mode === "dark"
                            ? "0 0 22px rgba(96,165,250,0.4)"
                            : "0 0 20px rgba(37,99,235,0.3)",
                        zIndex: 0,
                        pointerEvents: "none"
                      }
                    };
                  }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    sx={{ position: "relative", zIndex: 1 }}
                  >
                    {STEP_LABELS.map((label, idx) => {
                      const state =
                        idx < activeStepIndex
                          ? "done"
                          : idx === activeStepIndex
                            ? "active"
                            : "todo";

                      const circleSxBase =
                        state === "active"
                          ? { bgcolor: "primary.main", color: "primary.contrastText" }
                          : state === "done"
                            ? { bgcolor: "primary.light", color: "primary.contrastText" }
                            : null;

                      return (
                        <Box key={label} sx={{ textAlign: "center", flex: 1, px: 0.5 }}>
                          <Box
                            sx={(theme) => ({
                              width: STEPPER_CIRCLE_PX,
                              height: STEPPER_CIRCLE_PX,
                              borderRadius: "50%",
                              mx: "auto",
                              position: "relative",
                              zIndex: 1,
                              transition: `background-color ${STEPPER_ICON_MS}ms ${STEPPER_ICON_EASE}, color ${STEPPER_ICON_MS}ms ${STEPPER_ICON_EASE}`,
                              ...(circleSxBase ??
                                (theme.palette.mode === "dark"
                                  ? { bgcolor: theme.palette.grey[800], color: "text.secondary" }
                                  : { bgcolor: theme.palette.grey[300], color: "text.secondary" })),
                              "&::before": {
                                content: '""',
                                position: "absolute",
                                inset: -14,
                                borderRadius: "50%",
                                background:
                                  state === "todo"
                                    ? "transparent"
                                    : theme.palette.mode === "dark"
                                      ? "radial-gradient(circle, rgba(96,165,250,0.35), transparent 62%)"
                                      : "radial-gradient(circle, rgba(37,99,235,0.25), transparent 62%)",
                                filter: "blur(2px)",
                                opacity: state === "active" ? 1 : 0.7,
                                zIndex: -1,
                                transition: `opacity ${STEPPER_ICON_MS}ms ${STEPPER_ICON_EASE}, background ${STEPPER_ICON_MS}ms ${STEPPER_ICON_EASE}`
                              }
                            })}
                          >
                            <Box
                              aria-hidden={state === "done"}
                              sx={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transitionProperty: "opacity, transform",
                                transitionDuration: `${STEPPER_ICON_MS}ms`,
                                transitionTimingFunction:
                                  state === "done"
                                    ? STEPPER_ICON_EASE
                                    : STEPPER_ICON_EASE_SPRING,
                                opacity: state === "done" ? 0 : 1,
                                transform:
                                  state === "done"
                                    ? "scale(0.68) translateY(14%)"
                                    : "scale(1) translateY(0)",
                                pointerEvents: "none"
                              }}
                            >
                              <Typography
                                component="span"
                                variant="body1"
                                sx={(t) => ({
                                  fontWeight: 800,
                                  lineHeight: 1,
                                  fontSize: "1.0625rem",
                                  color: "inherit",
                                  fontFamily: t.typography.fontFamily
                                })}
                              >
                                {idx + 1}
                              </Typography>
                            </Box>
                            <Box
                              aria-hidden={state !== "done"}
                              sx={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transitionProperty: "opacity, transform",
                                transitionDuration: `${STEPPER_ICON_MS}ms`,
                                transitionTimingFunction:
                                  state === "done"
                                    ? STEPPER_ICON_EASE_SPRING
                                    : STEPPER_ICON_EASE,
                                opacity: state === "done" ? 1 : 0,
                                transform:
                                  state === "done"
                                    ? "scale(1) rotate(0deg)"
                                    : "scale(0.38) rotate(-58deg)",
                                pointerEvents: "none"
                              }}
                            >
                              <CheckCircleRoundedIcon
                                sx={{
                                  fontSize: Math.round(STEPPER_CIRCLE_PX * 0.54),
                                  display: "block",
                                  filter:
                                    state === "done"
                                      ? "drop-shadow(0 1px 2px rgba(0,0,0,0.12))"
                                      : "none",
                                  transition: `filter ${STEPPER_ICON_MS}ms ${STEPPER_ICON_EASE}`
                                }}
                              />
                            </Box>
                          </Box>
                          <Typography
                            variant="body2"
                            sx={{
                              display: "block",
                              mt: 1.25,
                              fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                              lineHeight: 1.25,
                              fontWeight: state === "active" ? 800 : 600,
                              color: state === "todo" ? "text.secondary" : "text.primary"
                            }}
                          >
                            {label}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
            </Box>

            <Box sx={{ mb: 3, animation: `${fadeIn} 0.5s ease-out` }}>
              <Typography variant="h4" component="h1" fontWeight={900} sx={{ mb: 1, textAlign: "center" }}>
                {STEP_LABELS[activeStepIndex]}
              </Typography>
              <Typography color="text.secondary" sx={{ textAlign: "center", mb: 0 }}>
                {STEP_DESCRIPTIONS[activeStepIndex]}
              </Typography>
            </Box>
          </>
        )}

        {stage === "name" && (
          <NameStep />
        )}

        {stage === "track" && currentStep === 1 && (
          <TrackSelectionStep />
        )}

        {stage === "track" && currentStep !== 1 && (
          <Box sx={{ animation: `${fadeIn} 0.5s ease-out`, textAlign: "center" }}>
            <Paper
              elevation={0}
              sx={(theme) => ({
                p: 4,
                borderRadius: 3,
                border: "1px solid",
                borderColor: theme.palette.divider,
                bgcolor: "background.paper",
                // Step 3 grades list is viewport-bleed + document scroll; hidden would clip and trap sticky.
                overflow: currentStep === 3 ? "visible" : "hidden"
              })}
            >
              <Box
                sx={{
                  overflow: currentStep === 3 ? "visible" : "hidden",
                  height: trackStepCardHeight == null ? "auto" : `${trackStepCardHeight}px`,
                  transition: `height ${TRACK_STEP_CARD_HEIGHT_MS}ms ${TRACK_STEP_CARD_HEIGHT_EASE}`,
                  "@media (prefers-reduced-motion: reduce)": {
                    transition: "none"
                  }
                }}
              >
                <Box ref={trackStepCardInnerRef}>
                  {currentStep === 2 ? (
                    <Box sx={{ textAlign: "center" }}>
                      <Typography
                        component="h2"
                        variant="h5"
                        fontWeight={900}
                        sx={{
                          mb: 2.5,
                          lineHeight: 1.25,
                          maxWidth: 520,
                          mx: "auto",
                          letterSpacing: "-0.02em"
                        }}
                      >
                        שנת תחילת התואר
                      </Typography>

                      <TextField
                        select
                        SelectProps={{ native: true }}
                        fullWidth
                        label="שנת התחלת לימודים"
                        value={studyStartHebrewYearStr}
                        onChange={(e) => {
                          setStudyStartHebrewYearStr(e.target.value);
                          setSelectedCatalogIdLocal("");
                        }}
                        sx={{ maxWidth: 420, mx: "auto", mb: 2, textAlign: "right", display: "block" }}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{
                          id: "study-hebrew-year-select"
                        }}
                      >
                        <option value="">בחרו שנה...</option>
                        {studyYearSelectOptions.map((o) => (
                          <option key={o.hebrewYear} value={String(o.hebrewYear)}>
                            {o.label} {formatAcademicYearSpan(o.gregorianYear)}
                          </option>
                        ))}
                      </TextField>

                      {catalogsLoading ? (
                        <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
                          <CircularProgress aria-label="טוען קטלוגים" />
                        </Box>
                      ) : catalogsError ? (
                        <Stack spacing={2} alignItems="center" sx={{ py: 1 }}>
                          <Typography color="error" role="alert" sx={{ textAlign: "center", maxWidth: 560 }}>
                            {catalogsError}
                          </Typography>
                          <Button
                            type="button"
                            variant="outlined"
                            size="small"
                            onClick={() => setCatalogFetchNonce((n) => n + 1)}
                          >
                            נסו שוב
                          </Button>
                        </Stack>
                      ) : !studyStartHebrewYearStr ? (
                        <Typography color="text.secondary">בחרו שנה כדי לראות קטלוגים זמינים.</Typography>
                      ) : (
                        <Box sx={{ width: "100%" }}>
                          <Typography
                            component="h3"
                            variant="h6"
                            fontWeight={900}
                            sx={{
                              mb: 0.75,
                              textAlign: "center",
                              letterSpacing: "-0.02em"
                            }}
                          >
                            בחרו קטלוג
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              mb: 2.5,
                              textAlign: "center",
                              lineHeight: 1.65,
                              maxWidth: 520,
                              mx: "auto"
                            }}
                          >
                            ניתן לסגור את התואר לפי כל קטלוג מהשנה שבה התחלתם
                          </Typography>
                          <Grid container spacing={2} sx={{ mt: 0, textAlign: "center" }}>
                          {filteredCatalogs.map((c) => {
                            const selected = selectedCatalogIdLocal === c.id;
                            return (
                              <Grid
                                item
                                xs={12}
                                sm={6}
                                md={4}
                                key={c.id}
                                sx={{ display: "flex", alignItems: "stretch" }}
                              >
                                <Paper
                                  component="button"
                                  type="button"
                                  onClick={() => setSelectedCatalogIdLocal(c.id)}
                                  elevation={0}
                                  aria-pressed={selected}
                                  aria-label={`קטלוג ${c.hebYear}, ${formatAcademicYearSpan(c.year)}`}
                                  sx={(theme) => ({
                                    boxSizing: "border-box",
                                    width: "100%",
                                    flex: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    p: 2.5,
                                    borderRadius: 3,
                                    border: "2px solid",
                                    borderColor: selected ? "primary.main" : "divider",
                                    bgcolor: selected
                                      ? alpha(
                                          theme.palette.primary.main,
                                          theme.palette.mode === "dark" ? 0.14 : 0.09
                                        )
                                      : "background.paper",
                                    cursor: "pointer",
                                    textAlign: "center",
                                    transition:
                                      "border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease",
                                    font: "inherit",
                                    color: "inherit",
                                    boxShadow: "none",
                                    "&:focus-visible": {
                                      outline: `2px solid ${theme.palette.primary.main}`,
                                      outlineOffset: 2
                                    },
                                    "@media (prefers-reduced-motion: reduce)": {
                                      transition: "none"
                                    }
                                  })}
                                >
                                  <Box
                                    sx={{
                                      flex: 1,
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      width: "100%",
                                      minHeight: 0
                                    }}
                                  >
                                    <Typography variant="h6" fontWeight={900} sx={{ mb: 0.5 }}>
                                      {c.hebYear}
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                      sx={{ fontVariantNumeric: "tabular-nums" }}
                                      dir="ltr"
                                    >
                                      {formatAcademicYearSpan(c.year)}
                                    </Typography>
                                  </Box>
                                  <Box
                                    sx={{
                                      height: 28,
                                      flexShrink: 0,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      mt: 1
                                    }}
                                    aria-hidden
                                  >
                                    {selected ? (
                                      <CheckCircleRoundedIcon
                                        color="primary"
                                        sx={{ fontSize: "1.35rem", display: "block" }}
                                      />
                                    ) : (
                                      <Box
                                        sx={{ width: "1.35rem", height: "1.35rem", visibility: "hidden" }}
                                      />
                                    )}
                                  </Box>
                                </Paper>
                              </Grid>
                            );
                          })}
                        </Grid>
                        </Box>
                      )}

                      {error && currentStep === 2 ? (
                        <Typography color="error" variant="body2" sx={{ mt: 2 }} role="alert">
                          {error}
                        </Typography>
                      ) : null}
                    </Box>
                  ) : currentStep === 3 ? (
                    <UserCoursesGradesPanel active />
                  ) : (
                    <FinishStep />
                  )}
                </Box>
              </Box>
            </Paper>
            <Stack direction="row" justifyContent="center" sx={{ gap: 2, flexWrap: "wrap", mt: 3 }}>
              <Button
                variant="outlined"
                onClick={() =>
                  router.replace(
                    (`/onboarding?step=${Math.max(1, currentStep - 1)}&redirect=${encodeURIComponent(redirectTo)}`) as Parameters<
                      typeof router.replace
                    >[0]
                  )
                }
              >
                אחורה
              </Button>
              {currentStep < 4 ? (
                <Button
                  variant="contained"
                  disabled={
                    currentStep === 2 &&
                    (catalogSaving ||
                      !studyStartHebrewYearStr ||
                      !selectedCatalogIdLocal ||
                      Boolean(catalogsError) ||
                      catalogsLoading ||
                      filteredCatalogs.length === 0)
                  }
                  onClick={() => {
                    if (currentStep === 2) {
                      void handleSaveCatalogStep();
                      return;
                    }
                    router.replace(
                      (`/onboarding?step=${currentStep + 1}&redirect=${encodeURIComponent(redirectTo)}`) as Parameters<
                        typeof router.replace
                      >[0]
                    );
                  }}
                >
                  {currentStep === 2 && catalogSaving ? "שומר..." : "המשך"}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={async () => {
                    if (!user) return;
                    await setOnboardingCompleted(firebaseDb, user.uid, true);
                    await refreshProfile();
                    router.replace(redirectTo as Parameters<typeof router.replace>[0]);
                  }}
                >
                  סיום
                </Button>
              )}
            </Stack>
          </Box>
        )}
        </OnboardingViewProvider>
      </Container>
    </Box>
  );
}
