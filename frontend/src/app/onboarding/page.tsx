"use client";

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseDb } from "@/firebase/config";
import { FirebaseError } from "firebase/app";
import { doc, getDoc } from "firebase/firestore";
import {
  setOnboardingCompleted,
  setUserGrade,
  setUserGradeWithSemester,
  deleteUserGrade,
  clearUserGrades,
  replaceUserGrades,
  updateUserName,
  updateUserTrack,
  updateUserStudyAndCatalog,
  getDisplayName
} from "@/lib/users";
import { getApiBaseUrl, getApiBaseUrlSameOriginMisconfigMessage } from "@/lib/api";
import {
  gradesWithSemesterFromTranscriptPayload
} from "@/lib/transcriptImport";
import { technionJsonUrlFromTranscriptSemester, parseTranscriptSemesterEn } from "@/lib/transcriptSemester";
import { fetchTechnionUgCoursesJson } from "@/lib/technionUgCourses";
import { findTechnionCourseItem } from "@/lib/technionCourseResolve";
import { fetchSemesterLabelsByIndexForCatalog } from "@/lib/semesters";
import { textContainsHebrew, type CourseListItem } from "@/lib/courses";
import {
  expandCourseIdVariants,
  normalizeCourseIdKey,
  toSapEightDigitCourseIdForStorage
} from "@/lib/courseNumberNormalize";
import { useCourseSearch, type CourseSearchDataSource } from "@/hooks/useCourseSearch";
import { useCatalogCourseList } from "@/hooks/useCatalogCourseList";
import { CourseSuggestListbox } from "@/components/courses/CourseSuggestListbox";
import {
  OnboardingViewProvider,
  type OnboardingViewContextValue
} from "@/app/onboarding/context/OnboardingViewContext";
import { NameStep } from "@/app/onboarding/steps/NameStep";
import { FinishStep } from "@/app/onboarding/steps/FinishStep";
import { TrackSelectionStep } from "@/app/onboarding/steps/TrackSelectionStep";
import { buildStudyYearSelectOptions, formatAcademicYearSpan } from "@/lib/hebrewYear";
import {
  fetchCatalogRecords,
  filterCatalogsFromStudyStart,
  type CatalogRecord
} from "@/lib/catalogs";
import {
  Box,
  Button,
  CircularProgress,
  ClickAwayListener,
  Container,
  Dialog,
  DialogActions,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  keyframes
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DirectionsRunRoundedIcon from "@mui/icons-material/DirectionsRunRounded";
import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import AssessmentRoundedIcon from "@mui/icons-material/AssessmentRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const progressFlow = keyframes`
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
`;

/** Upload dropzone: cloud/arrow nudge (hover + global file drag) */
const uploadArrowBounce = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
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

/** RTL: title (מספר+שם) | נק״ז | ציון | פעולות */
const GRADES_ROW_GRID =
  "minmax(0, 1fr) minmax(3.5rem, auto) minmax(5.5rem, 5.5rem) auto";
/** Add-row layout: give the search field more width than the table rows. */
const ADD_GRADE_FORM_GRID =
  "minmax(0, 1fr) minmax(3rem, auto) minmax(4.75rem, 4.75rem) auto";

const GRADES_FILE_ACCEPT = "application/pdf,image/*" as const;

function isAcceptedGradesFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (file.type === "application/pdf") return true;
  return /\.pdf$/i.test(file.name);
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Stored in Firestore for pass/fail (עובר בינארי). */
const PASS_FAIL_GRADE_DB = "-1";

function isPassFailGradeStored(grade: string): boolean {
  return String(grade).trim() === PASS_FAIL_GRADE_DB;
}

function formatGradeForDisplay(grade: string): string {
  if (isPassFailGradeStored(grade)) return "עובר";
  return String(grade).trim();
}

function parseNumericGrade0to100(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

/** Keeps prior value if the new string would parse to > 100 (no clamping to 100). */
function sanitizeGradeInputOnChange(raw: string, previous: string): string {
  let s = raw.replace(/[^\d.,]/g, "").replace(",", ".");
  if (s === "") return "";
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return s.slice(0, -1);
  if (n > 100) return previous;
  if (n < 0) return "0";
  return s;
}

/** Parse leading number from points label e.g. "5.5 נק״ז" → 5.5 */
function pointsWeightFromLabel(label: string | null): number | null {
  if (!label) return null;
  const m = /^[\s]*([0-9]+(?:\.[0-9]+)?)/.exec(label.replace(",", "."));
  if (!m) return null;
  const w = Number(m[1]);
  return Number.isFinite(w) && w > 0 ? w : null;
}

/** Display sum of נק״ז for summary lines (trim trailing zeros). */
function formatTotalNakazLabel(total: number): string {
  const rounded = Math.round(total * 100) / 100;
  const s = rounded % 1 === 0 ? String(rounded) : String(rounded);
  return `${s} נק״ז`;
}

const gradeNameCellSx = {
  minWidth: 0,
  fontWeight: 700,
  textAlign: "right" as const,
  whiteSpace: "normal" as const,
  lineHeight: 1.25,
  display: "-webkit-box",
  WebkitBoxOrient: "vertical" as const,
  WebkitLineClamp: 2,
  wordBreak: "break-word" as const,
  overflow: "hidden",
  textOverflow: "ellipsis"
};

const gradeCatalogLabelSx = {
  alignSelf: "stretch" as const,
  width: "100%",
  fontWeight: 500,
  fontSize: "0.74rem",
  lineHeight: 1.1,
  fontVariantNumeric: "tabular-nums" as const,
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
  color: "text.secondary" as const,
  maxWidth: "100%"
};

const courseTitleRowSx = {
  gridColumn: "1",
  display: "flex",
  flexDirection: "row" as const,
  alignItems: "center",
  gap: 1,
  minWidth: 0,
  width: "100%"
};

const gradePointsCellSx = {
  gridColumn: "2" as const,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums" as const,
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
  color: "text.secondary" as const,
  minWidth: 0,
  justifySelf: "start",
  alignSelf: "center"
};

type GradeRowItem = {
  courseId: string;
  courseName: string;
  courseNumber: string;
  coursePoints: string | null;
  grade: string;
  /** From `semesters` + `catalogs.year` when transcript semester matches a Firestore semester index. */
  semesterLabel: string | null;
  /** Raw transcript line e.g. `2025-2026 Winter` — used to group and sort terms. */
  transcriptSemesterEn: string | null;
};

type GradeSemesterGroup = {
  key: string;
  title: string;
  order: { y: number; s: number };
  rows: GradeRowItem[];
};

function buildGradeSemesterGroups(grades: GradeRowItem[]): GradeSemesterGroup[] {
  const m = new Map<
    string,
    { key: string; rows: GradeRowItem[]; order: { y: number; s: number } }
  >();
  for (const row of grades) {
    const sem = row.transcriptSemesterEn?.trim() || null;
    const key = sem ?? "__none__";
    if (!m.has(key)) {
      const parsed = sem ? parseTranscriptSemesterEn(sem) : null;
      const order = parsed
        ? { y: parsed.jsonYear, s: parsed.semester0to2 }
        : { y: 9_999, s: 9 };
      m.set(key, { key, rows: [], order });
    }
    m.get(key)!.rows.push(row);
  }
  const list: GradeSemesterGroup[] = [];
  for (const g of m.values()) {
    const title =
      g.rows.find((r) => r.semesterLabel)?.semesterLabel ??
      (g.key === "__none__" ? "ללא סמסטר" : g.key);
    list.push({ key: g.key, title, order: g.order, rows: g.rows });
  }
  list.sort((a, b) => a.order.y - b.order.y || a.order.s - b.order.s);
  return list;
}

/** Keep grades list fluid/responsive inside layout (no forced viewport overflow). */
const GRADES_LIST_VIEWPORT_BREAKOUT_SX = {
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box" as const
};

/** Ease-out: fast start, slows like a pump display settling. */
function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4;
}

function AnimatedWeightedAverageBlock({
  target,
  showDivider = true
}: {
  target: number;
  showDivider?: boolean;
}) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const from = displayRef.current;
    const dest = target;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (Math.abs(dest - from) < 0.01) {
      displayRef.current = dest;
      setDisplay(dest);
      return;
    }

    const duration = Math.min(1200, 420 + Math.abs(dest - from) * 22);
    const t0 = performance.now();

    const tick = (now: number) => {
      if (cancelled) return;
      const u = Math.min(1, (now - t0) / duration);
      const v = from + (dest - from) * easeOutQuart(u);
      displayRef.current = v;
      setDisplay(v);
      if (u < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayRef.current = dest;
        setDisplay(dest);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target]);

  return (
    <Box
      sx={{
        textAlign: "center",
        py: showDivider ? 1.25 : 0,
        px: 1,
        ...(showDivider
          ? {
              borderBottom: "1px solid",
              borderColor: "divider",
              mb: 2
            }
          : {})
      }}
    >
      <Typography
        component="h3"
        variant="h6"
        sx={{
          fontWeight: 700,
          color: "text.secondary",
          mb: 0.35,
          lineHeight: 1.25,
          fontSize: { xs: "0.9375rem", sm: "1rem" }
        }}
      >
        ממוצע משוקלל
      </Typography>
      <Typography
        component="div"
        aria-live="polite"
        aria-atomic="true"
        sx={(theme) => ({
          fontSize: { xs: "2.5rem", sm: "3rem" },
          fontWeight: 900,
          lineHeight: 1.05,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
          color: "text.primary",
          textShadow: `0 1px 0 ${alpha(theme.palette.common.black, 0.04)}`
        })}
      >
        {display.toFixed(2)}
      </Typography>
    </Box>
  );
}

export default function OnboardingPage() {
  const { user, profile, viewAsRegularUser, setViewAsRegularUser, refreshProfile, loading } =
    useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectTo = useMemo(() => {
    const raw = searchParams.get("redirect") || "/";
    return raw.startsWith("/") ? raw : "/";
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
  const [allCatalogs, setAllCatalogs] = useState<CatalogRecord[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);
  const [catalogFetchNonce, setCatalogFetchNonce] = useState(0);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [finishStepCatalogSummary, setFinishStepCatalogSummary] = useState<string | null>(null);
  const [finishStepCatalogLoading, setFinishStepCatalogLoading] = useState(false);

  const [gradesUploadFileName, setGradesUploadFileName] = useState<string | null>(null);
  const [gradesUploaded, setGradesUploaded] = useState(false);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [gradesLoadError, setGradesLoadError] = useState<string | null>(null);
  const [gradesCourses, setGradesCourses] = useState<GradeRowItem[]>([]);

  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingGrade, setEditingGrade] = useState<string>("");
  const [editingPassBinary, setEditingPassBinary] = useState(false);
  const [gradesMutating, setGradesMutating] = useState(false);

  const [addCourseSearch, setAddCourseSearch] = useState("");
  const [addSelectedCourseId, setAddSelectedCourseId] = useState<string | null>(null);
  const [addSelectedCatalogNumber, setAddSelectedCatalogNumber] = useState<string>("");
  const [addSelectedPointsLabel, setAddSelectedPointsLabel] = useState<string | null>(null);
  const [addGrade, setAddGrade] = useState("");
  const [addGradePassBinary, setAddGradePassBinary] = useState(false);
  const [addGradeExpanded, setAddGradeExpanded] = useState(false);
  const [addTargetSemesterKey, setAddTargetSemesterKey] = useState<string | null>(null);
  const [addSemesterCourses, setAddSemesterCourses] = useState<CourseListItem[]>([]);
  const [addSemesterCoursesLoading, setAddSemesterCoursesLoading] = useState(false);
  const courseSearchAnchorRef = useRef<HTMLDivElement | null>(null);
  const trackStepCardInnerRef = useRef<HTMLDivElement | null>(null);
  const [trackStepCardHeight, setTrackStepCardHeight] = useState<number | null>(null);
  const gradesDummyLoadTimerRef = useRef<number | null>(null);
  const gradesDummyLoadingRef = useRef(false);
  const gradesDragDepthRef = useRef(0);

  const [gradesDummyUploadLoading, setGradesDummyUploadLoading] = useState(false);
  const [gradesGlobalDragActive, setGradesGlobalDragActive] = useState(false);
  const [gradesUploadRejectMessage, setGradesUploadRejectMessage] = useState<string | null>(null);
  const [deleteGradeDialog, setDeleteGradeDialog] = useState<{
    courseId: string;
    courseName: string;
  } | null>(null);
  const [reuploadSheetDialogOpen, setReuploadSheetDialogOpen] = useState(false);

  const persistedGradesByCourse = useMemo(
    () => profile?.gradesWithSemester ?? {},
    [profile?.gradesWithSemester]
  );
  const persistedGradeEntries = useMemo(() => {
    const fromByCourse = Object.entries(persistedGradesByCourse);
    if (fromByCourse.length > 0) {
      return fromByCourse.map(([courseId, v]) => [courseId, v.grade, v.semester ?? null] as const);
    }
    return Object.entries(profile?.grades ?? {}).map(([courseId, grade]) => [courseId, String(grade), null] as const);
  }, [persistedGradesByCourse, profile?.grades]);
  const hasPersistedGrades = persistedGradeEntries.length > 0;
  const gradesPresent = gradesUploaded || hasPersistedGrades;

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

  useEffect(() => {
    if (stage !== "track" || currentStep !== 3) return;
    if (persistedGradeEntries.length > 0) {
      setGradesUploaded(true);
    }
  }, [stage, currentStep, persistedGradeEntries.length]);

  const activeStepIndex = currentStep - 1;

  const studyYearSelectOptions = useMemo(() => buildStudyYearSelectOptions(new Date()), []);

  const selectedCatalogMeta = useMemo(() => {
    const id = selectedCatalogIdLocal.trim();
    if (!id) return { id: null as string | null, year: null as number | null };
    const row = allCatalogs.find((c) => c.id === id);
    return { id, year: row?.year ?? null };
  }, [allCatalogs, selectedCatalogIdLocal]);

  const technionCoursesFetchEnabled =
    gradesPresent &&
    currentStep === 3 &&
    selectedCatalogMeta.id != null &&
    selectedCatalogMeta.year != null;

  const {
    courses: technionCatalogCourses,
    loading: technionCatalogCoursesLoading,
    error: technionCatalogCoursesError
  } = useCatalogCourseList({
    db: firebaseDb,
    catalogId: technionCoursesFetchEnabled ? selectedCatalogMeta.id : null,
    catalogYear: technionCoursesFetchEnabled ? selectedCatalogMeta.year : null,
    enabled: technionCoursesFetchEnabled
  });

  const addTargetSemesterUrl = useMemo(() => {
    if (!addTargetSemesterKey || addTargetSemesterKey === "__none__") return null;
    return technionJsonUrlFromTranscriptSemester(addTargetSemesterKey);
  }, [addTargetSemesterKey]);

  useEffect(() => {
    if (!addGradeExpanded) {
      setAddSemesterCourses([]);
      setAddSemesterCoursesLoading(false);
      return;
    }
    if (!addTargetSemesterKey || addTargetSemesterKey === "__none__") {
      setAddSemesterCourses(technionCatalogCourses ?? []);
      setAddSemesterCoursesLoading(technionCatalogCoursesLoading);
      return;
    }
    if (!addTargetSemesterUrl) {
      setAddSemesterCourses([]);
      setAddSemesterCoursesLoading(false);
      return;
    }

    let cancelled = false;
    setAddSemesterCoursesLoading(true);
    fetchTechnionUgCoursesJson(addTargetSemesterUrl)
      .then((items) => {
        if (!cancelled) setAddSemesterCourses(items);
      })
      .catch((e) => {
        console.warn("add-course semester JSON:", addTargetSemesterUrl, e);
        if (!cancelled) setAddSemesterCourses([]);
      })
      .finally(() => {
        if (!cancelled) setAddSemesterCoursesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    addGradeExpanded,
    addTargetSemesterKey,
    addTargetSemesterUrl,
    technionCatalogCourses,
    technionCatalogCoursesLoading
  ]);

  const courseSearchDataSource: CourseSearchDataSource = useMemo(
    () => ({
      type: "memory",
      items: addSemesterCourses,
      loading: addSemesterCoursesLoading
    }),
    [addSemesterCourses, addSemesterCoursesLoading]
  );
  const deferredAddCourseSearch = useDeferredValue(addCourseSearch);

  const {
    results: addCourseResults,
    searching: coursesSearching,
    error: coursesSearchError,
    dismissSuggestions
  } = useCourseSearch({
    db: firebaseDb,
    searchTerm: deferredAddCourseSearch,
    enabled:
      gradesPresent &&
      currentStep === 3 &&
      addGradeExpanded &&
      addTargetSemesterKey != null &&
      !addSelectedCourseId &&
      !gradesMutating,
    dataSource: courseSearchDataSource,
    debounceMs: 180,
    minChars: 2,
    maxResults: 8
  });

  const closeAddGradeForm = () => {
    setAddGradeExpanded(false);
    setAddTargetSemesterKey(null);
    setAddCourseSearch("");
    setAddSelectedCourseId(null);
    setAddSelectedCatalogNumber("");
    setAddSelectedPointsLabel(null);
    setAddGrade("");
    setAddGradePassBinary(false);
  };

  const courseSuggestPopperOpen =
    addGradeExpanded &&
    addTargetSemesterKey != null &&
    !addSelectedCourseId &&
    !gradesMutating &&
    addCourseSearch.trim().length >= 2 &&
    (coursesSearching ||
      addCourseResults.length > 0 ||
      Boolean(coursesSearchError));

  const openAddGradeForm = (semesterKey: string) => {
    setEditingCourseId(null);
    setEditingGrade("");
    setEditingPassBinary(false);
    setAddGradeExpanded(true);
    setAddTargetSemesterKey(semesterKey);
    setAddCourseSearch("");
    setAddSelectedCourseId(null);
    setAddSelectedCatalogNumber("");
    setAddSelectedPointsLabel(null);
    setAddGrade("");
    setAddGradePassBinary(false);
  };

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
    allCatalogs.length,
    gradesCourses.length
  ]);

  useEffect(() => {
    if (currentStep !== 3) {
      if (gradesDummyLoadTimerRef.current) {
        clearTimeout(gradesDummyLoadTimerRef.current);
        gradesDummyLoadTimerRef.current = null;
      }
      gradesDummyLoadingRef.current = false;
      gradesDragDepthRef.current = 0;
      setGradesDummyUploadLoading(false);
      setGradesGlobalDragActive(false);
      setGradesUploadRejectMessage(null);
      setDeleteGradeDialog(null);
      setReuploadSheetDialogOpen(false);
      setGradesUploadFileName(null);
      setGradesUploaded(false);
      setGradesLoading(false);
      setGradesLoadError(null);
      setGradesCourses([]);
      setEditingCourseId(null);
      setEditingGrade("");
      setGradesMutating(false);
      setAddCourseSearch("");
      setAddSelectedCourseId(null);
      setAddSelectedCatalogNumber("");
      setAddSelectedPointsLabel(null);
      setAddGrade("");
      setAddGradePassBinary(false);
      setAddGradeExpanded(false);
      setAddTargetSemesterKey(null);
      setAddSemesterCourses([]);
      setAddSemesterCoursesLoading(false);
      setEditingPassBinary(false);
    }
  }, [currentStep]);

  const startGradesFileUpload = useCallback(
    (file: File) => {
      if (gradesDummyLoadingRef.current) return;
      if (gradesPresent) return;
      if (!isAcceptedGradesFile(file)) {
        setGradesUploadRejectMessage("נא להעלות קובץ PDF או תמונה.");
        window.setTimeout(() => setGradesUploadRejectMessage(null), 4000);
        return;
      }
      setGradesUploadRejectMessage(null);
      setGradesLoadError(null);

      if (isPdfFile(file)) {
        const base = getApiBaseUrl();
        if (!base) {
          setGradesUploadRejectMessage(
            "חסרה כתובת השרת. הוסיפו NEXT_PUBLIC_API_URL ב-.env.local (למשל http://localhost:8000)."
          );
          window.setTimeout(() => setGradesUploadRejectMessage(null), 8000);
          return;
        }
        const originBug = getApiBaseUrlSameOriginMisconfigMessage(base);
        if (originBug) {
          setGradesUploadRejectMessage(originBug);
          window.setTimeout(() => setGradesUploadRejectMessage(null), 12000);
          return;
        }
        if (!user) {
          setGradesUploadRejectMessage("יש להתחבר כדי להעלות גיליון ציונים.");
          window.setTimeout(() => setGradesUploadRejectMessage(null), 5000);
          return;
        }

        gradesDummyLoadingRef.current = true;
        setGradesDummyUploadLoading(true);
        setGradesUploadFileName(file.name);

        void (async () => {
          try {
            const token = await user.getIdToken();
            const body = new FormData();
            body.append("file", file);
            const res = await fetch(`${base}/api/v1/transcripts/parse-pdf`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body
            });
            const text = await res.text();
            if (!res.ok) {
              let msg = text || res.statusText;
              try {
                const parsed = JSON.parse(text) as { detail?: unknown };
                if (typeof parsed.detail === "string") {
                  msg = parsed.detail;
                } else if (Array.isArray(parsed.detail)) {
                  const first = parsed.detail[0] as { msg?: string } | undefined;
                  if (first && typeof first.msg === "string") msg = first.msg;
                }
              } catch {
                /* keep msg */
              }
              throw new Error(msg);
            }
            let payload: { courses?: unknown };
            try {
              payload = JSON.parse(text) as { courses?: unknown };
            } catch {
              throw new Error("תשובת השרת אינה JSON תקין.");
            }
            const coursesArr = Array.isArray(payload.courses) ? payload.courses : [];
            // eslint-disable-next-line no-console
            console.info("[Optigrade] POST /transcripts/parse-pdf (server response)", {
              httpStatus: res.status,
              ok: res.ok,
              coursesInBody: coursesArr.length,
              sampleCourseIds: coursesArr.slice(0, 5).map((row: unknown) => {
                if (row && typeof row === "object" && "course_id" in row) {
                  return String((row as { course_id?: unknown }).course_id ?? "");
                }
                return String(row);
              })
            });
            const gradesObject = gradesWithSemesterFromTranscriptPayload(payload.courses);
            if (Object.keys(gradesObject).length === 0) {
              throw new Error("לא זוהו קורסים בקובץ. ודאו שזה גיליון ציונים רשמי באנגלית.");
            }
            await replaceUserGrades(firebaseDb, user.uid, gradesObject);
            await refreshProfile();
            gradesDummyLoadingRef.current = false;
            setGradesUploaded(true);
            setGradesDummyUploadLoading(false);
          } catch (err) {
            console.error("transcripts/parse-pdf:", err);
            gradesDummyLoadingRef.current = false;
            setGradesDummyUploadLoading(false);
            setGradesUploadFileName(null);
            setGradesUploadRejectMessage(
              err instanceof Error ? err.message : "העלאת הגיליון נכשלה. נסו שוב."
            );
            window.setTimeout(() => setGradesUploadRejectMessage(null), 8000);
          }
        })();
        return;
      }

      gradesDummyLoadingRef.current = true;
      setGradesDummyUploadLoading(true);
      setGradesUploadFileName(file.name);
      if (gradesDummyLoadTimerRef.current) clearTimeout(gradesDummyLoadTimerRef.current);
      gradesDummyLoadTimerRef.current = window.setTimeout(() => {
        gradesDummyLoadTimerRef.current = null;
        gradesDummyLoadingRef.current = false;
        setGradesUploaded(true);
        setGradesDummyUploadLoading(false);
      }, 2600);
    },
    [gradesPresent, user, refreshProfile]
  );

  useEffect(() => {
    if (stage !== "track" || currentStep !== 3 || gradesPresent) return;

    const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes("Files") ?? false;

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      gradesDragDepthRef.current += 1;
      setGradesGlobalDragActive(true);
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      gradesDragDepthRef.current -= 1;
      if (gradesDragDepthRef.current <= 0) {
        gradesDragDepthRef.current = 0;
        setGradesGlobalDragActive(false);
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };

    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      gradesDragDepthRef.current = 0;
      setGradesGlobalDragActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) startGradesFileUpload(file);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      gradesDragDepthRef.current = 0;
    };
  }, [stage, currentStep, gradesPresent, startGradesFileUpload]);

  useEffect(() => {
    if (!gradesPresent) return;
    if (!profile) return;

    const entries = persistedGradeEntries;
    if (entries.length === 0) {
      setGradesCourses([]);
      return;
    }

    const technionReady =
      technionCatalogCourses != null && !technionCatalogCoursesLoading;
    const mergedList = technionReady ? technionCatalogCourses ?? [] : [];

    const offeringMap = profile.transcriptOfferingByCourse ?? {};

    // Wait for merged catalog JSON (all semesters); transcript-only fetch is a single semester.
    const waitForTechnion =
      gradesPresent &&
      currentStep === 3 &&
      selectedCatalogMeta.id != null &&
      selectedCatalogMeta.year != null &&
      technionCatalogCoursesLoading;

    if (waitForTechnion) {
      setGradesLoading(true);
      return () => {};
    }

    let cancelled = false;
    async function loadCourses() {
      setGradesLoading(true);
      setGradesLoadError(null);

      const catalogIdForLabels = selectedCatalogMeta.id ?? profile?.catalog ?? null;
      let semesterLabels = new Map<number, string>();
      if (catalogIdForLabels) {
        try {
          semesterLabels = await fetchSemesterLabelsByIndexForCatalog(
            firebaseDb,
            catalogIdForLabels
          );
        } catch (e) {
          console.warn("fetchSemesterLabelsByIndexForCatalog:", e);
        }
      }

      function rowFromTechnionItem(ext: CourseListItem): {
        courseName: string;
        courseNumber: string;
        coursePoints: string | null;
      } {
        return {
          courseName: ext.courseName,
          courseNumber: ext.courseNumber,
          coursePoints: ext.pointsLabel
        };
      }

      /** Prefer Hebrew `שם מקצוע` when Technion dumps use English (no Firestore `courses` — Technion only). */
      function pickDisplayRow(
        merged: CourseListItem | undefined,
        semester: CourseListItem | undefined
      ): { courseName: string; courseNumber: string; coursePoints: string | null } | null {
        const candidates: { courseName: string; courseNumber: string; coursePoints: string | null }[] = [];
        if (merged) candidates.push(rowFromTechnionItem(merged));
        if (semester) candidates.push(rowFromTechnionItem(semester));
        if (candidates.length === 0) return null;
        const hebrew = candidates.find((c) => textContainsHebrew(c.courseName));
        return hebrew ?? candidates[0];
      }

      try {
        const results = await Promise.all(
          entries.map(async ([courseId, grade, semesterFromEntry]): Promise<GradeRowItem> => {
            const gradeStr = String(grade);
            const nk = normalizeCourseIdKey(courseId);
            const storageId = toSapEightDigitCourseIdForStorage(courseId);
            const semEn =
              semesterFromEntry ??
              offeringMap[courseId] ??
              offeringMap[nk] ??
              offeringMap[storageId] ??
              "";

            let semesterLabel: string | null = null;
            if (semEn) {
              const parsedSem = parseTranscriptSemesterEn(semEn);
              if (parsedSem) {
                semesterLabel = semesterLabels.get(parsedSem.semester0to2) ?? null;
              }
            }

            let semesterExt: CourseListItem | undefined;
            if (semEn) {
              const url = technionJsonUrlFromTranscriptSemester(semEn);
              if (url) {
                try {
                  const items = await fetchTechnionUgCoursesJson(url);
                  semesterExt = findTechnionCourseItem(items, courseId);
                } catch (e) {
                  console.warn("Technion JSON for transcript semester:", url, e);
                }
              }
            }

            const mergedExt =
              mergedList.length > 0 ? findTechnionCourseItem(mergedList, courseId) : undefined;

            const chosen = pickDisplayRow(mergedExt, semesterExt);
            if (!chosen) {
              // eslint-disable-next-line no-console
              console.info("[Optigrade] grade row: no Technion name/credits match", {
                courseId,
                storageId,
                semEn: semEn || null,
                mergedListLen: mergedList.length,
                hadMergedExt: Boolean(mergedExt),
                hadSemesterExt: Boolean(semesterExt)
              });
            }
            const displayNumber = toSapEightDigitCourseIdForStorage(
              chosen?.courseNumber ?? courseId
            );

            return {
              courseId,
              courseName: chosen?.courseName ?? "—",
              courseNumber: displayNumber,
              coursePoints: chosen?.coursePoints ?? null,
              grade: gradeStr,
              semesterLabel,
              transcriptSemesterEn: semEn || null
            };
          })
        );

        if (!cancelled) setGradesCourses(results);
      } catch (err) {
        console.error(err);
        if (!cancelled) setGradesLoadError("משהו השתבש בטעינת הקורסים.");
      } finally {
        if (!cancelled) setGradesLoading(false);
      }
    }

    void loadCourses();
    return () => {
      cancelled = true;
    };
  }, [
    gradesPresent,
    currentStep,
    profile,
    persistedGradeEntries,
    profile?.transcriptOfferingByCourse,
    profile?.catalog,
    selectedCatalogMeta.id,
    selectedCatalogMeta.year,
    technionCatalogCourses,
    technionCatalogCoursesLoading
  ]);

  const existingGradeCourseIds = useMemo(() => {
    const s = new Set<string>();
    for (const [k] of persistedGradeEntries) {
      s.add(k);
      s.add(normalizeCourseIdKey(k));
      s.add(toSapEightDigitCourseIdForStorage(k));
      for (const v of expandCourseIdVariants(k)) s.add(v);
    }
    return s;
  }, [persistedGradeEntries]);

  const gradesWeightedAverage = useMemo(() => {
    let sumW = 0;
    let sumGW = 0;
    for (const row of gradesCourses) {
      if (isPassFailGradeStored(row.grade)) continue;
      const g = parseNumericGrade0to100(row.grade);
      if (g === null) continue;
      const w = pointsWeightFromLabel(row.coursePoints);
      if (w === null) continue;
      sumGW += g * w;
      sumW += w;
    }
    if (sumW <= 0) return null;
    return Math.round((sumGW / sumW) * 100) / 100;
  }, [gradesCourses]);

  /** Sum נק״ז for every graded course that has points (includes עובר בינארי). */
  const gradesTotalNakaz = useMemo(() => {
    let sum = 0;
    let counted = false;
    for (const row of gradesCourses) {
      const w = pointsWeightFromLabel(row.coursePoints);
      if (w === null) continue;
      counted = true;
      sum += w;
    }
    return counted ? Math.round(sum * 100) / 100 : null;
  }, [gradesCourses]);

  const gradeSemesterGroups = useMemo(
    () => buildGradeSemesterGroups(gradesCourses),
    [gradesCourses]
  );

  const handleEditGradeStart = (courseId: string, grade: string) => {
    closeAddGradeForm();
    setEditingCourseId(courseId);
    const pass = isPassFailGradeStored(grade);
    setEditingPassBinary(pass);
    setEditingGrade(pass ? "" : String(grade).trim());
  };

  const handleEditGradeCancel = () => {
    setEditingCourseId(null);
    setEditingGrade("");
    setEditingPassBinary(false);
  };

  const handleSaveEditedGrade = async () => {
    if (!user) return;
    if (!editingCourseId) return;

    const valueToSave = editingPassBinary
      ? PASS_FAIL_GRADE_DB
      : (() => {
          const n = parseNumericGrade0to100(editingGrade);
          return n === null ? null : String(n);
        })();
    if (valueToSave === null) return;

    setGradesMutating(true);
    try {
      const editingRow = gradesCourses.find((r) => r.courseId === editingCourseId);
      await setUserGrade(
        firebaseDb,
        user.uid,
        editingCourseId,
        valueToSave,
        editingRow?.transcriptSemesterEn ?? null
      );
      await refreshProfile();
      handleEditGradeCancel();
    } catch (err) {
      console.error(err);
    } finally {
      setGradesMutating(false);
    }
  };

  const closeDeleteGradeDialog = () => setDeleteGradeDialog(null);

  const confirmDeleteGrade = async () => {
    if (!user || !deleteGradeDialog) return;
    const { courseId } = deleteGradeDialog;
    closeDeleteGradeDialog();
    setGradesMutating(true);
    try {
      await deleteUserGrade(firebaseDb, user.uid, courseId);
      await refreshProfile();
    } catch (err) {
      console.error(err);
    } finally {
      setGradesMutating(false);
    }
  };

  const closeReuploadSheetDialog = () => setReuploadSheetDialogOpen(false);

  const confirmReuploadSheet = async () => {
    if (!user) return;
    setReuploadSheetDialogOpen(false);
    setGradesMutating(true);
    try {
      await clearUserGrades(firebaseDb, user.uid);
      await refreshProfile();
      setGradesUploadFileName(null);
      setGradesUploaded(false);
      setGradesCourses([]);
      setGradesLoading(false);
      setGradesLoadError(null);
      setEditingCourseId(null);
      setEditingGrade("");
      setAddCourseSearch("");
      setAddSelectedCourseId(null);
      setAddSelectedCatalogNumber("");
      setAddSelectedPointsLabel(null);
      setAddGrade("");
      setAddGradePassBinary(false);
      setAddGradeExpanded(false);
      setAddTargetSemesterKey(null);
      setAddSemesterCourses([]);
      setAddSemesterCoursesLoading(false);
      setEditingPassBinary(false);
      setGradesUploadRejectMessage(null);
      gradesDragDepthRef.current = 0;
      setGradesGlobalDragActive(false);
    } catch (err) {
      console.error(err);
      setGradesUploadRejectMessage("לא הצלחנו לאפס את הציונים. נסה שוב.");
    } finally {
      setGradesMutating(false);
    }
  };

  const handlePickCourse = (
    courseId: string,
    courseName: string,
    catalogNumber: string,
    pointsLabel: string | null
  ) => {
    setAddSelectedCourseId(courseId);
    setAddSelectedCatalogNumber(catalogNumber);
    setAddSelectedPointsLabel(pointsLabel);
    setAddCourseSearch(courseName);
  };

  const clearPickedCourse = () => {
    setAddSelectedCourseId(null);
    setAddSelectedCatalogNumber("");
    setAddSelectedPointsLabel(null);
    setAddCourseSearch("");
    setAddGradePassBinary(false);
  };

  const handleAddCourseGrade = async () => {
    if (!user) return;
    if (!addSelectedCourseId) return;

    const valueToSave = addGradePassBinary
      ? PASS_FAIL_GRADE_DB
      : (() => {
          const n = parseNumericGrade0to100(addGrade);
          return n === null ? null : String(n);
        })();
    if (valueToSave === null) return;

    setGradesMutating(true);
    try {
      await setUserGradeWithSemester(
        firebaseDb,
        user.uid,
        toSapEightDigitCourseIdForStorage(addSelectedCourseId),
        valueToSave,
        addTargetSemesterKey === "__none__" ? null : addTargetSemesterKey
      );
      await refreshProfile();
      closeAddGradeForm();
    } catch (err) {
      console.error(err);
    } finally {
      setGradesMutating(false);
    }
  };

  const trackOptions = useMemo(
    () => [
      { id: "הנדסת חשמל", title: "הנדסת חשמל", description: "מסלול" },
      { id: "הנדסת מחשבים", title: "הנדסת מחשבים", description: "מסלול" },
      { id: "הנדסת מחשבים ותוכנה", title: "הנדסת מחשבים ותוכנה", description: "מסלול" },
      { id: "הנדסת חשמל ומתמטיקה", title: "הנדסת חשמל ומתמטיקה", description: "מסלול" },
      { id: "הנדסת חשמל ופיזיקה", title: "הנדסת חשמל ופיזיקה", description: "מסלול" }
    ],
    []
  );

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

  const handleGradesSheetInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) startGradesFileUpload(file);
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
              router.push("/");
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
                <Box sx={{ mb: 3 }}>
                  <Typography color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.6 }}>
                    העלו את גיליון הציונים שלכם.
                  </Typography>

                  {!gradesPresent ? (
                    <>
                      <Box
                        component="label"
                        htmlFor="grades-sheet-file-input"
                        sx={{
                          position: "relative",
                          display: "block",
                          width: "100%",
                          maxWidth: "100%",
                          mx: "auto",
                          borderRadius: 3,
                          border: "2px dashed",
                          borderColor: gradesGlobalDragActive ? "primary.main" : "divider",
                          background: (theme) =>
                            gradesGlobalDragActive
                              ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.14 : 0.1)
                              : alpha(
                                  theme.palette.primary.main,
                                  theme.palette.mode === "dark" ? 0.06 : 0.04
                                ),
                          cursor: "pointer",
                          overflow: "hidden",
                          transition:
                            "border-color 180ms ease, background-color 180ms ease, box-shadow 180ms ease",
                          boxShadow: gradesGlobalDragActive
                            ? (theme) =>
                                `0 0 0 3px ${alpha(theme.palette.primary.main, 0.25)}, ${theme.shadows[4]}`
                            : (theme) => theme.shadows[1],
                          "&:focus-within": {
                            borderColor: "primary.main",
                            boxShadow: (theme) => `0 0 0 3px ${alpha(theme.palette.primary.main, 0.2)}`
                          },
                          "@media (prefers-reduced-motion: no-preference)": {
                            "&:hover .grades-upload-arrow": {
                              animation: `${uploadArrowBounce} 0.75s ease-in-out infinite`
                            },
                            ...(gradesGlobalDragActive
                              ? {
                                  "& .grades-upload-arrow": {
                                    animation: `${uploadArrowBounce} 0.75s ease-in-out infinite`
                                  }
                                }
                              : {})
                          }
                        }}
                      >
                        <input
                          id="grades-sheet-file-input"
                          type="file"
                          hidden
                          accept={GRADES_FILE_ACCEPT}
                          onChange={handleGradesSheetInputChange}
                        />
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: { xs: "column", sm: "row" },
                            alignItems: "center",
                            justifyContent: "center",
                            gap: { xs: 2, sm: 3 },
                            py: { xs: 3, sm: 3.5 },
                            px: { xs: 2, sm: 4 },
                            textAlign: "center"
                          }}
                        >
                          <Box
                            sx={{
                              width: 88,
                              height: 88,
                              borderRadius: "22px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              background: (theme) =>
                                `linear-gradient(145deg, ${alpha(theme.palette.primary.main, 0.22)} 0%, ${alpha(theme.palette.secondary?.main ?? theme.palette.primary.light, 0.12)} 100%)`,
                              border: "1px solid",
                              borderColor: (theme) => alpha(theme.palette.primary.main, 0.35),
                              boxShadow: (theme) =>
                                `inset 0 1px 0 ${alpha("#fff", theme.palette.mode === "dark" ? 0.08 : 0.35)}`
                            }}
                          >
                            <Box
                              className="grades-upload-arrow"
                              sx={{
                                display: "flex",
                                lineHeight: 0
                              }}
                            >
                              <CloudUploadRoundedIcon
                                sx={{
                                  fontSize: 46,
                                  color: "primary.light",
                                  opacity: 0.95,
                                  display: "block"
                                }}
                              />
                            </Box>
                          </Box>
                          <Box sx={{ minWidth: 0, flex: 1, maxWidth: 520 }}>
                            <Typography
                              variant="h6"
                              fontWeight={900}
                              sx={{ mb: 0.75, letterSpacing: "-0.02em", lineHeight: 1.3 }}
                            >
                              אפשר לגרור את הקובץ לכל מקום על המסך
                            </Typography>
                            <Typography color="text.secondary" variant="body2" sx={{ lineHeight: 1.65 }}>
                              שחררו את גיליון הציונים בחלון כולו — כאן או מעל התוכן. גם לחיצה על האזור תפתח
                              בחירת קובץ.
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", mt: 1.25, opacity: 0.9 }}
                            >
                              PDF או תמונה
                            </Typography>
                          </Box>
                        </Box>
                      </Box>

                      {gradesUploadFileName && !gradesDummyUploadLoading && (
                        <Typography color="text.secondary" sx={{ mt: 1.5, textAlign: "center" }}>
                          נבחר קובץ: {gradesUploadFileName}
                        </Typography>
                      )}
                    </>
                  ) : (
                    <Button
                      variant="outlined"
                      size="large"
                      onClick={() => setReuploadSheetDialogOpen(true)}
                      disabled={gradesMutating || gradesDummyUploadLoading}
                      sx={{ mb: 2.5, fontWeight: 700, px: 3, py: 1 }}
                    >
                      העלאת גיליון מחדש
                    </Button>
                  )}

                  {gradesUploadRejectMessage ? (
                    <Typography color="error" variant="body2" sx={{ mt: 1, mb: 0.5, textAlign: "center" }}>
                      {gradesUploadRejectMessage}
                    </Typography>
                  ) : null}

                  {gradesPresent && (
                    <Box sx={{ mt: 3 }}>
                      {gradesWeightedAverage !== null || gradesTotalNakaz !== null ? (
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "row",
                            flexWrap: "wrap",
                            justifyContent: "center",
                            alignItems: "flex-start",
                            gap: { xs: 2, sm: 4 },
                            borderBottom: "1px solid",
                            borderColor: "divider",
                            mb: 2,
                            py: 1.25,
                            px: 1
                          }}
                        >
                          {gradesWeightedAverage !== null ? (
                            <AnimatedWeightedAverageBlock
                              target={gradesWeightedAverage}
                              showDivider={false}
                            />
                          ) : null}
                          {gradesTotalNakaz !== null ? (
                            <Box sx={{ textAlign: "center", px: 1, minWidth: "min(100%, 9rem)" }}>
                              <Typography
                                component="h3"
                                variant="h6"
                                sx={{
                                  fontWeight: 700,
                                  color: "text.secondary",
                                  mb: 0.35,
                                  lineHeight: 1.25,
                                  fontSize: { xs: "0.9375rem", sm: "1rem" }
                                }}
                              >
                                סה״כ נק״ז
                              </Typography>
                              <Typography
                                component="div"
                                sx={(theme) => ({
                                  fontSize: { xs: "2.5rem", sm: "3rem" },
                                  fontWeight: 900,
                                  lineHeight: 1.05,
                                  fontVariantNumeric: "tabular-nums",
                                  letterSpacing: "-0.02em",
                                  color: "text.primary",
                                  textShadow: `0 1px 0 ${alpha(theme.palette.common.black, 0.04)}`
                                })}
                              >
                                {formatTotalNakazLabel(gradesTotalNakaz)}
                              </Typography>
                            </Box>
                          ) : null}
                        </Box>
                      ) : null}

                      {technionCatalogCoursesError ? (
                        <Typography
                          color="error"
                          variant="body2"
                          sx={{ mb: 1.5 }}
                          role="status"
                          aria-live="polite"
                        >
                          {technionCatalogCoursesError}
                        </Typography>
                      ) : null}

                      {gradesLoading ? (
                        <Typography color="text.secondary">טוען קורסים...</Typography>
                      ) : gradesLoadError ? (
                        <Typography color="error">{gradesLoadError}</Typography>
                      ) : (
                        <Box
                          role="region"
                          aria-label="קורסים וציונים"
                          sx={{
                            ...GRADES_LIST_VIEWPORT_BREAKOUT_SX,
                            mt:
                              gradesWeightedAverage !== null || gradesTotalNakaz !== null
                                ? 0.5
                                : 2,
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                            px: { xs: 2, sm: 2.5 },
                            pb: 1.5
                          }}
                        >

                          {gradesCourses.length === 0 ? (
                            <Typography color="text.secondary" sx={{ py: 0.5 }}>
                              לא נמצאו ציונים להצגה כרגע.
                            </Typography>
                          ) : (
                            <Box
                              sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                  xs: "minmax(0, 1fr)",
                                  md: "repeat(2, minmax(0, 1fr))"
                                },
                                gap: { xs: 1, sm: 1.25 },
                                pb: 0.5,
                                alignItems: "start"
                              }}
                            >
                              {gradeSemesterGroups.map((group, groupIdx) => (
                                <Box
                                  key={group.key}
                                  sx={{
                                    borderRadius: 2,
                                    border: "1px solid",
                                    borderColor: "divider",
                                    bgcolor: "background.paper",
                                    overflow: "hidden"
                                  }}
                                >
                                  <Box
                                    sx={(theme) => ({
                                      px: 1.5,
                                      py: 0.9,
                                      borderBottom: "1px solid",
                                      borderColor: "divider",
                                      bgcolor: alpha(
                                        theme.palette.primary.main,
                                        theme.palette.mode === "dark" ? 0.14 : 0.07
                                      )
                                    })}
                                  >
                                    <Typography
                                      component="h3"
                                      variant="subtitle2"
                                      fontWeight={800}
                                      sx={{ textAlign: "right", m: 0 }}
                                    >
                                      {group.title}
                                    </Typography>
                                  </Box>
                                  <Box
                                    sx={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 0.5,
                                      p: 0.75,
                                      pt: 0.9
                                    }}
                                  >
                                    {group.rows.map((item) => (
                                    <Box
                                      key={item.courseId}
                                      sx={{
                                        display: "grid",
                                        gridTemplateColumns: GRADES_ROW_GRID,
                                        columnGap: 1,
                                        alignItems: "center",
                                        py: 0.85,
                                        px: 1.25,
                                        minHeight: 44,
                                        borderRadius: 2,
                                        border: "1px solid",
                                        borderColor: "divider",
                                        bgcolor: (theme) =>
                                          theme.palette.mode === "dark"
                                            ? alpha(theme.palette.background.default, 0.5)
                                            : alpha(theme.palette.grey[100], 0.9)
                                      }}
                                    >
                                      <Box
                                        sx={{
                                          ...courseTitleRowSx,
                                          flexDirection: "column",
                                          alignItems: "stretch",
                                          gap: 0.2
                                        }}
                                      >
                                        <Typography
                                          component="div"
                                          sx={gradeCatalogLabelSx}
                                          title={item.courseNumber}
                                        >
                                          {item.courseNumber}
                                        </Typography>
                                        <Typography
                                          component="div"
                                          sx={{ ...gradeNameCellSx, minWidth: 0 }}
                                          title={item.courseName}
                                        >
                                          {item.courseName}
                                        </Typography>
                                      </Box>

                                      {editingCourseId === item.courseId ? (
                                        <>
                                          <Typography
                                            component="div"
                                            variant="body2"
                                            sx={gradePointsCellSx}
                                            aria-label={
                                              item.coursePoints
                                                ? `נקודות זכות: ${item.coursePoints}`
                                                : undefined
                                            }
                                          >
                                            {item.coursePoints ?? "—"}
                                          </Typography>
                                          <Box
                                            sx={{
                                              gridColumn: "3",
                                              justifySelf: "stretch",
                                              alignSelf: "center",
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              width: "100%",
                                              minWidth: 0
                                            }}
                                          >
                                            {editingPassBinary ? (
                                              <Typography
                                                variant="body1"
                                                sx={{
                                                  fontWeight: 900,
                                                  textAlign: "center",
                                                  width: "100%",
                                                  py: 0.5
                                                }}
                                                aria-label="ציון"
                                              >
                                                עובר
                                              </Typography>
                                            ) : (
                                              <TextField
                                                value={editingGrade}
                                                onChange={(e) =>
                                                  setEditingGrade((prev) =>
                                                    sanitizeGradeInputOnChange(e.target.value, prev)
                                                  )
                                                }
                                                onKeyDown={(e) => {
                                                  if (e.key !== "Enter" || e.nativeEvent.isComposing) {
                                                    return;
                                                  }
                                                  e.preventDefault();
                                                  if (gradesMutating) return;
                                                  if (
                                                    !editingPassBinary &&
                                                    parseNumericGrade0to100(editingGrade) === null
                                                  ) {
                                                    return;
                                                  }
                                                  void handleSaveEditedGrade();
                                                }}
                                                size="small"
                                                dir="rtl"
                                                sx={{
                                                  width: "100%",
                                                  maxWidth: "5.5rem",
                                                  mx: "auto",
                                                  "& .MuiInputBase-input": {
                                                    textAlign: "center",
                                                    direction: "rtl"
                                                  }
                                                }}
                                                inputProps={{
                                                  inputMode: "decimal",
                                                  min: 0,
                                                  max: 100,
                                                  "aria-label": "ציון"
                                                }}
                                              />
                                            )}
                                          </Box>
                                          <Stack
                                            direction="row"
                                            sx={{
                                              gridColumn: "4",
                                              justifySelf: "end",
                                              flexWrap: "wrap",
                                              gap: 1.5,
                                              alignItems: "center"
                                            }}
                                          >
                                            <Button
                                              size="small"
                                              variant={editingPassBinary ? "contained" : "outlined"}
                                              disabled={gradesMutating}
                                              sx={{ whiteSpace: "nowrap" }}
                                              onClick={() => {
                                                setEditingPassBinary((p) => {
                                                  const next = !p;
                                                  if (next) setEditingGrade("");
                                                  return next;
                                                });
                                              }}
                                            >
                                              עובר
                                            </Button>
                                            <Button
                                              variant="contained"
                                              size="small"
                                              disabled={
                                                gradesMutating ||
                                                (!editingPassBinary &&
                                                  parseNumericGrade0to100(editingGrade) === null)
                                              }
                                              onClick={handleSaveEditedGrade}
                                            >
                                              שמירה
                                            </Button>
                                            <Button
                                              variant="outlined"
                                              size="small"
                                              disabled={gradesMutating}
                                              onClick={handleEditGradeCancel}
                                            >
                                              ביטול
                                            </Button>
                                          </Stack>
                                        </>
                                      ) : (
                                        <>
                                          <Typography component="div" variant="body2" sx={gradePointsCellSx}>
                                            {item.coursePoints ?? "—"}
                                          </Typography>
                                          <Typography
                                            component="div"
                                            sx={{
                                              fontWeight: 900,
                                              textAlign: "right",
                                              width: "100%",
                                              gridColumn: "3",
                                              justifySelf: "start"
                                            }}
                                          >
                                            {formatGradeForDisplay(item.grade)}
                                          </Typography>
                                          <Stack
                                            direction="row"
                                            sx={{
                                              gridColumn: "4",
                                              justifySelf: "end",
                                              alignItems: "center",
                                              gap: 0.25
                                            }}
                                          >
                                            <Tooltip title="ערוך">
                                              <span>
                                                <IconButton
                                                  size="small"
                                                  onClick={() =>
                                                    handleEditGradeStart(item.courseId, item.grade)
                                                  }
                                                  disabled={gradesMutating}
                                                  aria-label={`עריכת קורס ${item.courseName}`}
                                                >
                                                  <EditRoundedIcon fontSize="small" />
                                                </IconButton>
                                              </span>
                                            </Tooltip>
                                            <Tooltip title="מחק">
                                              <span>
                                                <IconButton
                                                  size="small"
                                                  color="error"
                                                  onClick={() =>
                                                    setDeleteGradeDialog({
                                                      courseId: item.courseId,
                                                      courseName: item.courseName
                                                    })
                                                  }
                                                  disabled={gradesMutating}
                                                  aria-label={`מחיקת קורס ${item.courseName}`}
                                                >
                                                  <DeleteOutlineRoundedIcon fontSize="small" />
                                                </IconButton>
                                              </span>
                                            </Tooltip>
                                          </Stack>
                                        </>
                                      )}
                                    </Box>
                                    ))}
                                  </Box>
                                  {addGradeExpanded && addTargetSemesterKey === group.key ? (
                                    <Box
                                      sx={{
                                        py: 1,
                                        px: 1.25,
                                        borderTop: "1px solid",
                                        borderColor: "divider",
                                        bgcolor: "background.default",
                                        textAlign: "right"
                                      }}
                                    >
                                      <Box
                                        sx={{
                                          display: "grid",
                                          gridTemplateColumns: ADD_GRADE_FORM_GRID,
                                          columnGap: 1,
                                          rowGap: 1,
                                          alignItems: "center",
                                          width: "100%",
                                          minWidth: 0
                                        }}
                                      >
                                        <ClickAwayListener
                                          onClickAway={() => {
                                            dismissSuggestions();
                                          }}
                                        >
                                          <Box
                                            sx={{
                                              gridColumn: "1",
                                              width: "100%",
                                              minWidth: 0,
                                              alignSelf: "center"
                                            }}
                                          >
                                            <Box
                                              ref={courseSearchAnchorRef}
                                              sx={{ position: "relative", width: "100%" }}
                                            >
                                              {addSelectedCatalogNumber ? (
                                                <Typography
                                                  component="div"
                                                  variant="caption"
                                                  color="text.secondary"
                                                  sx={{
                                                    mb: 0.35,
                                                    pr: 0.25,
                                                    fontWeight: 700,
                                                    fontVariantNumeric: "tabular-nums",
                                                    textAlign: "right",
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis"
                                                  }}
                                                  title={addSelectedCatalogNumber}
                                                >
                                                  {addSelectedCatalogNumber}
                                                </Typography>
                                              ) : null}
                                              <TextField
                                                label="שם או מספר קורס"
                                                size="small"
                                                value={addCourseSearch}
                                                onChange={(e) => {
                                                  setAddCourseSearch(e.target.value);
                                                  setAddSelectedCourseId(null);
                                                  setAddSelectedCatalogNumber("");
                                                  setAddSelectedPointsLabel(null);
                                                }}
                                                fullWidth
                                                disabled={gradesMutating}
                                                dir="rtl"
                                                inputProps={{
                                                  autoComplete: "off",
                                                  role: "combobox",
                                                  "aria-expanded": courseSuggestPopperOpen,
                                                  "aria-controls": `course-suggest-listbox-${groupIdx}`
                                                }}
                                                InputProps={{
                                                  readOnly: Boolean(addSelectedCourseId),
                                                  endAdornment: addSelectedCourseId ? (
                                                    <InputAdornment position="end" sx={{ marginInlineStart: 0 }}>
                                                      <IconButton
                                                        size="small"
                                                        aria-label="בטל בחירת קורס"
                                                        edge="end"
                                                        onClick={(e) => {
                                                          e.preventDefault();
                                                          clearPickedCourse();
                                                        }}
                                                        disabled={gradesMutating}
                                                      >
                                                        <ClearRoundedIcon fontSize="small" />
                                                      </IconButton>
                                                    </InputAdornment>
                                                  ) : undefined
                                                }}
                                                sx={{
                                                  "& .MuiInputBase-input": {
                                                    textAlign: "right",
                                                    direction: "rtl"
                                                  }
                                                }}
                                              />
                                              <CourseSuggestListbox
                                                open={courseSuggestPopperOpen}
                                                anchorEl={courseSearchAnchorRef.current}
                                                listboxId={`course-suggest-listbox-${groupIdx}`}
                                                results={addCourseResults}
                                                searching={coursesSearching}
                                                error={coursesSearchError}
                                                onSelect={(c) =>
                                                  handlePickCourse(
                                                    c.courseId,
                                                    c.courseName,
                                                    c.courseNumber,
                                                    c.pointsLabel
                                                  )
                                                }
                                                disabledIds={existingGradeCourseIds}
                                                listBusy={gradesMutating}
                                              />
                                            </Box>
                                          </Box>
                                        </ClickAwayListener>

                                        <Box
                                          sx={{
                                            ...gradePointsCellSx,
                                            alignSelf: "center",
                                            mt: addSelectedCatalogNumber ? 1.7 : 0
                                          }}
                                        >
                                          {addSelectedCourseId && addSelectedPointsLabel ? (
                                            <Typography
                                              variant="body2"
                                              color="text.secondary"
                                              sx={{
                                                fontWeight: 600,
                                                fontVariantNumeric: "tabular-nums",
                                                whiteSpace: "nowrap",
                                                textAlign: "right"
                                              }}
                                            >
                                              {addSelectedPointsLabel}
                                            </Typography>
                                          ) : addSelectedCourseId ? (
                                            <Typography variant="body2" color="text.disabled" sx={{ textAlign: "right" }}>
                                              —
                                            </Typography>
                                          ) : null}
                                        </Box>

                                        <Box
                                          sx={{
                                            gridColumn: "3",
                                            justifySelf: "stretch",
                                            alignSelf: "center",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            width: "100%",
                                            minWidth: 0,
                                            mt: addSelectedCatalogNumber ? 1.7 : 0
                                          }}
                                        >
                                          {addGradePassBinary ? (
                                            <Typography
                                              variant="body1"
                                              sx={{
                                                fontWeight: 900,
                                                textAlign: "center",
                                                width: "100%",
                                                py: 0.5,
                                                color: "text.primary"
                                              }}
                                              aria-label="ציון"
                                            >
                                              עובר
                                            </Typography>
                                          ) : (
                                            <TextField
                                              label="ציון"
                                              size="small"
                                              value={addGrade}
                                              onChange={(e) =>
                                                setAddGrade((prev) =>
                                                  sanitizeGradeInputOnChange(e.target.value, prev)
                                                )
                                              }
                                              dir="rtl"
                                              sx={{
                                                width: "100%",
                                                maxWidth: "4.4rem",
                                                mx: "auto",
                                                "& .MuiInputBase-input": {
                                                  textAlign: "center",
                                                  direction: "rtl"
                                                }
                                              }}
                                              disabled={gradesMutating || !addSelectedCourseId}
                                              inputProps={{
                                                inputMode: "decimal",
                                                min: 0,
                                                max: 100,
                                                "aria-label": "ציון"
                                              }}
                                            />
                                          )}
                                        </Box>
                                        <Box
                                          sx={{
                                            gridColumn: "4",
                                            justifySelf: "end",
                                            alignSelf: "center",
                                            display: "flex",
                                            flexDirection: "row",
                                            flexWrap: "wrap",
                                            gap: 1,
                                            alignItems: "center",
                                            mt: addSelectedCatalogNumber ? 1.7 : 0
                                          }}
                                        >
                                          <Button
                                            size="small"
                                            variant={addGradePassBinary ? "contained" : "outlined"}
                                            disabled={gradesMutating || !addSelectedCourseId}
                                            sx={{ whiteSpace: "nowrap", minWidth: 0, px: 1.1 }}
                                            onClick={() => {
                                              setAddGradePassBinary((p) => {
                                                const next = !p;
                                                if (next) setAddGrade("");
                                                return next;
                                              });
                                            }}
                                          >
                                            עובר
                                          </Button>
                                          <Tooltip title="הוסף">
                                            <span>
                                              <IconButton
                                                size="small"
                                                color="primary"
                                                disabled={
                                                  gradesMutating ||
                                                  !addSelectedCourseId ||
                                                  (!addGradePassBinary &&
                                                    parseNumericGrade0to100(addGrade) === null)
                                                }
                                                onClick={handleAddCourseGrade}
                                                aria-label="הוספת קורס"
                                              >
                                                <AddRoundedIcon fontSize="small" />
                                              </IconButton>
                                            </span>
                                          </Tooltip>
                                          <Tooltip title="ביטול">
                                            <span>
                                              <IconButton
                                                size="small"
                                                disabled={gradesMutating}
                                                onClick={closeAddGradeForm}
                                                aria-label="ביטול הוספת קורס"
                                              >
                                                <CloseRoundedIcon fontSize="small" />
                                              </IconButton>
                                            </span>
                                          </Tooltip>
                                        </Box>
                                      </Box>
                                    </Box>
                                  ) : (
                                    <Box sx={{ px: 1, pb: 1, pt: 0.5 }}>
                                      <Button
                                        variant="outlined"
                                        size="small"
                                        fullWidth
                                        onClick={() => openAddGradeForm(group.key)}
                                        disabled={gradesMutating}
                                      >
                                        + הוספת ציון לסמסטר
                                      </Button>
                                    </Box>
                                  )}
                                </Box>
                              ))}
                            </Box>
                          )}
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
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

      <Dialog
        open={Boolean(deleteGradeDialog)}
        onClose={closeDeleteGradeDialog}
        dir="rtl"
        maxWidth="sm"
        fullWidth
        aria-labelledby="delete-grade-dialog-title"
        slotProps={{
          backdrop: {
            sx: (theme) => ({
              backdropFilter: "blur(6px)",
              backgroundColor:
                theme.palette.mode === "light"
                  ? alpha(theme.palette.grey[800], 0.28)
                  : alpha(theme.palette.common.black, 0.55)
            })
          }
        }}
        PaperProps={{
          sx: (theme) =>
            theme.palette.mode === "light"
              ? {
                  borderRadius: 3,
                  bgcolor: theme.palette.background.paper,
                  backgroundImage: "none",
                  border: "1px solid",
                  borderColor: alpha(theme.palette.common.black, 0.09),
                  boxShadow: `0 1px 2px ${alpha("#0f172a", 0.06)}, 0 12px 32px ${alpha("#0f172a", 0.12)}`,
                  overflow: "hidden"
                }
              : {
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  background: `linear-gradient(165deg, ${alpha(theme.palette.background.paper, 0.98)} 0%, ${alpha(theme.palette.primary.dark, 0.12)} 100%)`,
                  boxShadow: theme.shadows[12],
                  overflow: "hidden"
                }
        }}
      >
        {deleteGradeDialog ? (
          <>
            <DialogTitle component="div" sx={{ pt: 3, px: 3, pb: 2 }}>
              <Typography
                id="delete-grade-dialog-title"
                variant="h6"
                component="p"
                fontWeight={800}
                sx={{ lineHeight: 1.45, textAlign: "right", m: 0 }}
              >
                למחוק את הציון ב
                <Box component="span" sx={{ fontWeight: 900 }}>
                  {deleteGradeDialog.courseName}
                </Box>
                ?
              </Typography>
            </DialogTitle>
            <DialogActions
              sx={{
                px: 3,
                pb: 3,
                pt: 1,
                gap: 1,
                justifyContent: "center",
                flexWrap: "wrap",
                width: "100%"
              }}
            >
              <Button
                variant="contained"
                color="error"
                onClick={confirmDeleteGrade}
                disabled={gradesMutating}
                sx={{ fontWeight: 800, minWidth: 120 }}
              >
                {gradesMutating ? "מוחק..." : "מחק ציון"}
              </Button>
              <Button
                variant="outlined"
                onClick={closeDeleteGradeDialog}
                disabled={gradesMutating}
                sx={{ fontWeight: 700 }}
              >
                ביטול
              </Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>

      <Dialog
        open={reuploadSheetDialogOpen}
        onClose={closeReuploadSheetDialog}
        dir="rtl"
        maxWidth="sm"
        fullWidth
        aria-labelledby="reupload-sheet-dialog-title"
        aria-describedby="reupload-sheet-dialog-desc"
        slotProps={{
          backdrop: {
            sx: (theme) => ({
              backdropFilter: "blur(6px)",
              backgroundColor:
                theme.palette.mode === "light"
                  ? alpha(theme.palette.grey[800], 0.28)
                  : alpha(theme.palette.common.black, 0.55)
            })
          }
        }}
        PaperProps={{
          sx: (theme) =>
            theme.palette.mode === "light"
              ? {
                  borderRadius: 3,
                  bgcolor: theme.palette.background.paper,
                  backgroundImage: "none",
                  border: "1px solid",
                  borderColor: alpha(theme.palette.common.black, 0.09),
                  boxShadow: `0 1px 2px ${alpha("#0f172a", 0.06)}, 0 12px 32px ${alpha("#0f172a", 0.12)}`,
                  overflow: "hidden"
                }
              : {
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  background: `linear-gradient(165deg, ${alpha(theme.palette.background.paper, 0.98)} 0%, ${alpha(theme.palette.primary.dark, 0.12)} 100%)`,
                  boxShadow: theme.shadows[12],
                  overflow: "hidden"
                }
        }}
      >
        <DialogTitle component="div" sx={{ pt: 3, px: 3, pb: 2 }}>
          <Typography
            id="reupload-sheet-dialog-title"
            variant="h6"
            component="p"
            fontWeight={800}
            sx={{ lineHeight: 1.45, textAlign: "right", m: 0, mb: 1.25 }}
          >
            להחליף את גיליון הציונים?
          </Typography>
          <Typography
            id="reupload-sheet-dialog-desc"
            variant="body2"
            color="text.secondary"
            component="p"
            sx={{ lineHeight: 1.65, textAlign: "right", m: 0 }}
          >
            העלאת גיליון חדש תמחק את כל הציונים השמורים בפרופיל ותאפס את הרשימה. לא ניתן לשחזר את
            הרשימה הקודמת אוטומטית.
          </Typography>
        </DialogTitle>
        <DialogActions
          sx={{
            px: 3,
            pb: 3,
            pt: 1,
            gap: 1,
            justifyContent: "center",
            flexWrap: "wrap",
            width: "100%"
          }}
        >
          <Button
            variant="contained"
            onClick={confirmReuploadSheet}
            disabled={gradesMutating}
            sx={{ fontWeight: 800, minWidth: 120 }}
          >
            {gradesMutating ? "מאפס..." : "המשך"}
          </Button>
          <Button
            variant="outlined"
            onClick={closeReuploadSheetDialog}
            disabled={gradesMutating}
            sx={{ fontWeight: 700 }}
          >
            ביטול
          </Button>
        </DialogActions>
      </Dialog>

      {gradesDummyUploadLoading ? (
        <Box
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="מעבדים את הקובץ שהועלה"
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: (theme) => theme.zIndex.modal + 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
            bgcolor: (theme) =>
              alpha(
                theme.palette.common.black,
                theme.palette.mode === "dark" ? 0.72 : 0.48
              ),
            backdropFilter: "blur(8px)"
          }}
        >
          <Paper
            elevation={12}
            sx={{
              p: { xs: 3, sm: 4 },
              textAlign: "center",
              maxWidth: 400,
              width: "100%",
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider"
            }}
          >
            <CircularProgress size={48} thickness={4} sx={{ mb: 2 }} aria-hidden />
            <Typography variant="h6" fontWeight={900} sx={{ mb: 0.5 }}>
              מעבדים את הקובץ...
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              רגע קצר, זה יימשך עוד רגע
            </Typography>
            {gradesUploadFileName ? (
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                title={gradesUploadFileName}
                sx={{ display: "block" }}
              >
                {gradesUploadFileName}
              </Typography>
            ) : null}
          </Paper>
        </Box>
      ) : null}
    </Box>
  );
}
