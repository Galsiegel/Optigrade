"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  ClickAwayListener,
  Dialog,
  DialogActions,
  DialogTitle,
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
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseDb } from "@/firebase/config";
import {
  clearUserGrades,
  deleteUserGrade,
  replaceUserGrades,
  setUserGrade,
  setUserGradeWithSemester
} from "@/lib/users";
import { getApiBaseUrl, getApiBaseUrlSameOriginMisconfigMessage } from "@/lib/api";
import { gradesWithSemesterFromTranscriptPayload } from "@/lib/transcriptImport";
import {
  formatTranscriptSemesterHebrewLabel,
  technionJsonUrlFromTranscriptSemester
} from "@/lib/transcriptSemester";
import { fetchTechnionUgCoursesJson } from "@/lib/technionUgCourses";
import { findTechnionCourseItem } from "@/lib/technionCourseResolve";
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
  PASS_FAIL_GRADE_DB,
  buildGradeSemesterGroups,
  formatGradeForDisplay,
  formatTotalNakazLabel,
  isPassFailGradeStored,
  parseNumericGrade0to100,
  pointsWeightFromLabel,
  sanitizeGradeInputOnChange,
  type GradeRowItem
} from "@/lib/userGradesFormat";
import {
  ADD_GRADE_FORM_GRID,
  GRADES_LIST_VIEWPORT_BREAKOUT_SX,
  GRADES_ROW_GRID,
  courseTitleRowSx,
  gradeCatalogLabelSx,
  gradeNameCellSx,
  gradePointsCellSx
} from "@/components/userCourses/gradesTableSx";
import { AnimatedWeightedAverageBlock } from "@/components/userCourses/AnimatedWeightedAverageBlock";

const uploadArrowBounce = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
`;

const GRADES_FILE_ACCEPT = "application/pdf,image/*" as const;

function isAcceptedGradesFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (file.type === "application/pdf") return true;
  return /\.pdf$/i.test(file.name);
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** TEMPORARY: table + weighted average show deterministic fake grades in [70, 100]; Firestore + edit/save still use real values. */
const TEMP_DISPLAY_FAKE_GRADES_70_PLUS = true;

function fakeNumericGradeForCourseId(courseId: string): number {
  let h = 2166136261;
  for (let i = 0; i < courseId.length; i++) {
    h ^= courseId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 70 + ((h >>> 0) % 31);
}

function gradeLabelForTableDisplay(courseId: string, actualGrade: string): string {
  if (!TEMP_DISPLAY_FAKE_GRADES_70_PLUS) return formatGradeForDisplay(actualGrade);
  if (isPassFailGradeStored(actualGrade)) return formatGradeForDisplay(actualGrade);
  return String(fakeNumericGradeForCourseId(courseId));
}

export type UserCoursesGradesPanelProps = {
  /** When false, skip global drag/drop and defer Technion merge until active (e.g. onboarding non‑grades steps). */
  active?: boolean;
  /** Hide the onboarding-style one-line intro above the upload/list area (e.g. on the main dashboard). */
  hideIntro?: boolean;
};

export function UserCoursesGradesPanel({ active = true, hideIntro = false }: UserCoursesGradesPanelProps) {
  const { user, profile, refreshProfile } = useAuth();

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

  const [catalogMeta, setCatalogMeta] = useState<{ id: string; year: number } | null>(null);

  useEffect(() => {
    const id = profile?.catalog?.trim();
    if (!id) {
      setCatalogMeta(null);
      return;
    }
    let cancelled = false;
    void getDoc(doc(firebaseDb, "catalogs", id))
      .then((snap) => {
        if (cancelled || !snap.exists()) {
          if (!cancelled) setCatalogMeta(null);
          return;
        }
        const d = snap.data();
        const y = typeof d.year === "number" ? d.year : Number(d.year);
        if (Number.isFinite(y)) setCatalogMeta({ id, year: y });
        else setCatalogMeta(null);
      })
      .catch(() => {
        if (!cancelled) setCatalogMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.catalog]);

  const persistedGradesByCourse = useMemo(
    () => profile?.gradesWithSemester ?? {},
    [profile?.gradesWithSemester]
  );
  const persistedGradeEntries = useMemo(() => {
    const fromByCourse = Object.entries(persistedGradesByCourse);
    if (fromByCourse.length > 0) {
      return fromByCourse.map(([courseId, v]) => [courseId, v.grade, v.semester ?? null] as const);
    }
    return Object.entries(profile?.grades ?? {}).map(
      ([courseId, grade]) => [courseId, String(grade), null] as const
    );
  }, [persistedGradesByCourse, profile?.grades]);
  const hasPersistedGrades = persistedGradeEntries.length > 0;
  const gradesPresent = gradesUploaded || hasPersistedGrades;

  useEffect(() => {
    if (!active) return;
    if (persistedGradeEntries.length > 0) {
      setGradesUploaded(true);
    }
  }, [active, persistedGradeEntries.length]);

  const selectedCatalogMeta = useMemo(() => {
    const id = catalogMeta?.id ?? profile?.catalog?.trim() ?? null;
    const year = catalogMeta?.year ?? null;
    return { id, year };
  }, [catalogMeta, profile?.catalog]);

  const technionCoursesFetchEnabled =
    gradesPresent && active && selectedCatalogMeta.id != null && selectedCatalogMeta.year != null;

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
      active &&
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
    (coursesSearching || addCourseResults.length > 0 || Boolean(coursesSearchError));

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
    if (!active || gradesPresent) return;

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
  }, [active, gradesPresent, startGradesFileUpload]);

  useEffect(() => {
    if (!gradesPresent) return;
    if (!profile) return;

    const entries = persistedGradeEntries;
    if (entries.length === 0) {
      setGradesCourses([]);
      return;
    }

    const technionReady = technionCatalogCourses != null && !technionCatalogCoursesLoading;
    const mergedList = technionReady ? technionCatalogCourses ?? [] : [];

    const offeringMap = profile.transcriptOfferingByCourse ?? {};

    const waitForTechnion =
      gradesPresent &&
      active &&
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

            const semesterLabel =
              semEn.trim() !== "" ? formatTranscriptSemesterHebrewLabel(semEn) : null;

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
    active,
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
      const w = pointsWeightFromLabel(row.coursePoints);
      if (w === null) continue;
      const g = TEMP_DISPLAY_FAKE_GRADES_70_PLUS
        ? isPassFailGradeStored(row.grade)
          ? null
          : fakeNumericGradeForCourseId(row.courseId)
        : (() => {
            if (isPassFailGradeStored(row.grade)) return null;
            return parseNumericGrade0to100(row.grade);
          })();
      if (g === null) continue;
      sumGW += g * w;
      sumW += w;
    }
    if (sumW <= 0) return null;
    return Math.round((sumGW / sumW) * 100) / 100;
  }, [gradesCourses]);

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

  const handleGradesSheetInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) startGradesFileUpload(file);
  };

  if (!active) {
    return null;
  }

  return (
    <>
      <Box sx={{ mb: 3 }}>
        {!hideIntro ? (
          <Typography color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.6 }}>
            העלו את גיליון הציונים שלכם.
          </Typography>
        ) : null}

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
                    : alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.06 : 0.04),
                cursor: "pointer",
                overflow: "hidden",
                transition: "border-color 180ms ease, background-color 180ms ease, box-shadow 180ms ease",
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
                    שחררו את גיליון הציונים בחלון כולו — כאן או מעל התוכן. גם לחיצה על האזור תפתח בחירת
                    קובץ.
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
                  <AnimatedWeightedAverageBlock target={gradesWeightedAverage} showDivider={false} />
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
                  mt: gradesWeightedAverage !== null || gradesTotalNakaz !== null ? 0.5 : 2,
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
                                      item.coursePoints ? `נקודות זכות: ${item.coursePoints}` : undefined
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
                                    {gradeLabelForTableDisplay(item.courseId, item.grade)}
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
                                          onClick={() => handleEditGradeStart(item.courseId, item.grade)}
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
                                  <Box ref={courseSearchAnchorRef} sx={{ position: "relative", width: "100%" }}>
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
            העלאת גיליון חדש תמחק את כל הציונים השמורים בפרופיל ותאפס את הרשימה. לא ניתן לשחזר את הרשימה
            הקודמת אוטומטית.
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
              alpha(theme.palette.common.black, theme.palette.mode === "dark" ? 0.72 : 0.48),
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
    </>
  );
}
