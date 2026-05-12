"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  ClickAwayListener,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { firebaseDb } from "@/firebase/config";
import { useCatalogCourseList } from "@/hooks/useCatalogCourseList";
import { useCourseSearch, type CourseSearchDataSource } from "@/hooks/useCourseSearch";
import { CourseSuggestListbox } from "@/components/courses/CourseSuggestListbox";
import type { CourseListItem } from "@/lib/courses";
import { expandCourseIdVariants } from "@/lib/courseNumberNormalize";
import {
  appendCourseToRequirementFlat,
  appendCourseToRequirementSemester,
  appendRequirementSemester,
  removeCourseFromRequirementFlat,
  removeCourseFromRequirementSemester,
  type RequirementRow,
  type RequirementSemester
} from "@/lib/requirements";

type SemesterBoxProps = {
  requirementId: string;
  semesterIndex: number;
  semester: RequirementSemester;
  catalogId: string;
  catalogYear: number;
  mergedCourses: CourseListItem[] | null;
  coursesLoading: boolean;
  coursesFetchError: string | null;
  onUpdated: () => void;
};

function RequirementSemesterBox({
  requirementId,
  semesterIndex,
  semester,
  catalogId,
  catalogYear,
  mergedCourses,
  coursesLoading,
  coursesFetchError,
  onUpdated
}: SemesterBoxProps) {
  const [addCourseExpanded, setAddCourseExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<CourseListItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearch = useDeferredValue(search);

  const dataSource: CourseSearchDataSource = useMemo(
    () => ({
      type: "memory",
      items: mergedCourses ?? [],
      loading: coursesLoading
    }),
    [mergedCourses, coursesLoading]
  );

  const disabledIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of semester.courses) {
      for (const v of expandCourseIdVariants(id)) s.add(v);
    }
    return s;
  }, [semester.courses]);

  const { results, searching, error: searchError, dismissSuggestions } = useCourseSearch({
    db: firebaseDb,
    searchTerm: deferredSearch,
    enabled:
      addCourseExpanded && Boolean(catalogId) && catalogYear > 0 && !picked && !adding && !coursesLoading,
    dataSource,
    debounceMs: 180,
    minChars: 2,
    maxResults: 80
  });

  const suggestOpen =
    addCourseExpanded &&
    !picked &&
    !adding &&
    search.trim().length >= 2 &&
    (searching || results.length > 0 || Boolean(searchError));

  useEffect(() => {
    if (!addCourseExpanded) return;
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [addCourseExpanded]);

  const listboxId = `admin-req-${requirementId}-sem-${semesterIndex}-suggest`;

  const clearPick = () => {
    setPicked(null);
    setSearch("");
    dismissSuggestions();
  };

  const closeAddCourseEditor = () => {
    setAddCourseExpanded(false);
    clearPick();
    setAddError(null);
  };

  const handleAddCourse = async () => {
    if (!picked) return;
    setAddError(null);
    setAdding(true);
    try {
      await appendCourseToRequirementSemester(firebaseDb, requirementId, semesterIndex, picked.courseId);
      clearPick();
      setAddCourseExpanded(false);
      onUpdated();
    } catch (e) {
      console.error(e);
      setAddError("הוספת הקורס נכשלה.");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteCourse = async (storedCourseId: string) => {
    setAddError(null);
    setDeletingCourseId(storedCourseId);
    try {
      await removeCourseFromRequirementSemester(firebaseDb, requirementId, semesterIndex, storedCourseId);
      onUpdated();
    } catch (e) {
      console.error(e);
      setAddError("מחיקת הקורס נכשלה.");
    } finally {
      setDeletingCourseId(null);
    }
  };

  const courseTitleLookup = useMemo(() => {
    const m = new Map<string, string>();
    if (!mergedCourses) return m;
    for (const c of mergedCourses) {
      for (const v of expandCourseIdVariants(c.courseId)) {
        if (!m.has(v)) m.set(v, c.courseName);
      }
    }
    return m;
  }, [mergedCourses]);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        height: "100%",
        minHeight: 240,
        display: "flex",
        flexDirection: "column",
        bgcolor: (theme) => (theme.palette.mode === "dark" ? "grey.900" : "grey.50")
      }}
    >
      <Typography variant="subtitle1" fontWeight={700} gutterBottom component="h4">
        {semester.name.trim() ? semester.name : "—"}
      </Typography>
      {coursesFetchError ? (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {coursesFetchError}
        </Alert>
      ) : null}
      {addError ? (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setAddError(null)}>
          {addError}
        </Alert>
      ) : null}
      <Box
        component="ul"
        sx={{
          listStyle: "none",
          m: 0,
          p: 0,
          mb: 1.5,
          width: "100%",
          flex: 1,
          minHeight: 48,
          display: "flex",
          flexDirection: "column",
          gap: 1
        }}
      >
        {semester.courses.length === 0 ? (
          <Typography component="li" variant="body2" color="text.secondary" sx={{ py: 1 }}>
            אין קורסים בסמסטר זה.
          </Typography>
        ) : (
          semester.courses.map((cid, ci) => {
            const label =
              [...expandCourseIdVariants(cid)].map((v) => courseTitleLookup.get(v)).find(Boolean) ?? cid;
            return (
              <Box
                key={`${cid}-${ci}`}
                component="li"
                sx={(theme) => ({
                  width: "100%",
                  minHeight: 64,
                  px: 1.75,
                  py: 1.25,
                  borderRadius: 1,
                  border: `1px solid ${theme.palette.divider}`,
                  bgcolor: theme.palette.mode === "dark" ? "grey.800" : "background.paper",
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 1,
                  justifyContent: "space-between",
                  textAlign: "right"
                })}
              >
                <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {cid}
                  </Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.35 }}>
                    {label}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`מחק קורס ${cid}`}
                  disabled={adding || Boolean(deletingCourseId)}
                  onClick={() => void handleDeleteCourse(cid)}
                  edge="end"
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            );
          })
        )}
      </Box>
      <Box sx={{ mt: "auto", pt: 1 }}>
      {!addCourseExpanded ? (
        <Button
          variant="outlined"
          size="small"
          fullWidth
          onClick={() => {
            setAddError(null);
            setAddCourseExpanded(true);
          }}
          disabled={adding || coursesLoading}
        >
          הוספת קורס
        </Button>
      ) : (
        <ClickAwayListener
          onClickAway={() => {
            dismissSuggestions();
          }}
        >
          <Box sx={{ mt: 0.5 }}>
            <Box ref={anchorRef} sx={{ position: "relative", width: "100%" }}>
              <TextField
                inputRef={searchInputRef}
                label="שם או מספר קורס"
                InputLabelProps={{ shrink: true }}
                size="small"
                fullWidth
                value={picked ? picked.courseName : search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPicked(null);
                }}
                disabled={adding || coursesLoading}
                dir="rtl"
                inputProps={{
                  autoComplete: "off",
                  role: "combobox",
                  "aria-expanded": suggestOpen,
                  "aria-controls": listboxId
                }}
                InputProps={{
                  readOnly: Boolean(picked),
                  endAdornment: picked ? (
                    <InputAdornment position="end" sx={{ marginInlineStart: 0 }}>
                      <IconButton
                        size="small"
                        aria-label="בטל בחירת קורס"
                        edge="end"
                        onClick={clearPick}
                        disabled={adding}
                      >
                        <ClearRoundedIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined
                }}
                sx={{
                  "& .MuiInputBase-input": { textAlign: "right", direction: "rtl" }
                }}
              />
              <CourseSuggestListbox
                open={suggestOpen}
                anchorEl={anchorRef.current}
                listboxId={listboxId}
                results={results}
                searching={searching}
                error={searchError}
                disabledIds={disabledIds}
                listBusy={adding}
                onSelect={(c) => {
                  setPicked(c);
                  setSearch(c.courseName);
                  dismissSuggestions();
                }}
              />
            </Box>
            <Stack direction="row" spacing={1} justifyContent="flex-start" sx={{ mt: 1.5 }} flexWrap="wrap">
              <Button variant="outlined" size="small" onClick={closeAddCourseEditor} disabled={adding}>
                ביטול
              </Button>
              <Button variant="contained" size="small" disabled={!picked || adding} onClick={() => void handleAddCourse()}>
                {adding ? "מוסיף…" : "שמירה"}
              </Button>
            </Stack>
          </Box>
        </ClickAwayListener>
      )}
      </Box>
    </Paper>
  );
}

type FlatBoxProps = {
  requirementId: string;
  flatCourseIds: string[];
  catalogId: string;
  catalogYear: number;
  mergedCourses: CourseListItem[] | null;
  coursesLoading: boolean;
  coursesFetchError: string | null;
  onUpdated: () => void;
};

function RequirementFlatCoursesBox({
  requirementId,
  flatCourseIds,
  catalogId,
  catalogYear,
  mergedCourses,
  coursesLoading,
  coursesFetchError,
  onUpdated
}: FlatBoxProps) {
  const [addCourseExpanded, setAddCourseExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<CourseListItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearch = useDeferredValue(search);

  const dataSource: CourseSearchDataSource = useMemo(
    () => ({
      type: "memory",
      items: mergedCourses ?? [],
      loading: coursesLoading
    }),
    [mergedCourses, coursesLoading]
  );

  const disabledIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of flatCourseIds) {
      for (const v of expandCourseIdVariants(id)) s.add(v);
    }
    return s;
  }, [flatCourseIds]);

  const { results, searching, error: searchError, dismissSuggestions } = useCourseSearch({
    db: firebaseDb,
    searchTerm: deferredSearch,
    enabled:
      addCourseExpanded && Boolean(catalogId) && catalogYear > 0 && !picked && !adding && !coursesLoading,
    dataSource,
    debounceMs: 180,
    minChars: 2,
    maxResults: 80
  });

  const suggestOpen =
    addCourseExpanded &&
    !picked &&
    !adding &&
    search.trim().length >= 2 &&
    (searching || results.length > 0 || Boolean(searchError));

  useEffect(() => {
    if (!addCourseExpanded) return;
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [addCourseExpanded]);

  const listboxId = `admin-req-${requirementId}-flat-suggest`;

  const clearPick = () => {
    setPicked(null);
    setSearch("");
    dismissSuggestions();
  };

  const closeAddCourseEditor = () => {
    setAddCourseExpanded(false);
    clearPick();
    setAddError(null);
  };

  const handleAddCourse = async () => {
    if (!picked) return;
    setAddError(null);
    setAdding(true);
    try {
      await appendCourseToRequirementFlat(firebaseDb, requirementId, picked.courseId);
      clearPick();
      setAddCourseExpanded(false);
      onUpdated();
    } catch (e) {
      console.error(e);
      setAddError("הוספת הקורס נכשלה.");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteCourse = async (storedCourseId: string) => {
    setAddError(null);
    setDeletingCourseId(storedCourseId);
    try {
      await removeCourseFromRequirementFlat(firebaseDb, requirementId, storedCourseId);
      onUpdated();
    } catch (e) {
      console.error(e);
      setAddError("מחיקת הקורס נכשלה.");
    } finally {
      setDeletingCourseId(null);
    }
  };

  const courseTitleLookup = useMemo(() => {
    const m = new Map<string, string>();
    if (!mergedCourses) return m;
    for (const c of mergedCourses) {
      for (const v of expandCourseIdVariants(c.courseId)) {
        if (!m.has(v)) m.set(v, c.courseName);
      }
    }
    return m;
  }, [mergedCourses]);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        minHeight: 240,
        display: "flex",
        flexDirection: "column",
        bgcolor: (theme) => (theme.palette.mode === "dark" ? "grey.900" : "grey.50")
      }}
    >
      <Typography variant="subtitle1" fontWeight={700} gutterBottom component="h4">
        קורסים
      </Typography>
      {coursesFetchError ? (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {coursesFetchError}
        </Alert>
      ) : null}
      {addError ? (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setAddError(null)}>
          {addError}
        </Alert>
      ) : null}
      <Box
        component="ul"
        sx={{
          listStyle: "none",
          m: 0,
          p: 0,
          mb: 1.5,
          width: "100%",
          flex: 1,
          minHeight: 48,
          display: "flex",
          flexDirection: "column",
          gap: 1
        }}
      >
        {flatCourseIds.length === 0 ? (
          <Typography component="li" variant="body2" color="text.secondary" sx={{ py: 1 }}>
            אין קורסים בדרישה זו.
          </Typography>
        ) : (
          flatCourseIds.map((cid, ci) => {
            const label =
              [...expandCourseIdVariants(cid)].map((v) => courseTitleLookup.get(v)).find(Boolean) ?? cid;
            return (
              <Box
                key={`${cid}-${ci}`}
                component="li"
                sx={(theme) => ({
                  width: "100%",
                  minHeight: 64,
                  px: 1.75,
                  py: 1.25,
                  borderRadius: 1,
                  border: `1px solid ${theme.palette.divider}`,
                  bgcolor: theme.palette.mode === "dark" ? "grey.800" : "background.paper",
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 1,
                  justifyContent: "space-between",
                  textAlign: "right"
                })}
              >
                <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {cid}
                  </Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.35 }}>
                    {label}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`מחק קורס ${cid}`}
                  disabled={adding || Boolean(deletingCourseId)}
                  onClick={() => void handleDeleteCourse(cid)}
                  edge="end"
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            );
          })
        )}
      </Box>
      <Box sx={{ mt: "auto", pt: 1 }}>
        {!addCourseExpanded ? (
          <Button
            variant="outlined"
            size="small"
            fullWidth
            onClick={() => {
              setAddError(null);
              setAddCourseExpanded(true);
            }}
            disabled={adding || coursesLoading}
          >
            הוספת קורס
          </Button>
        ) : (
          <ClickAwayListener
            onClickAway={() => {
              dismissSuggestions();
            }}
          >
            <Box sx={{ mt: 0.5 }}>
              <Box ref={anchorRef} sx={{ position: "relative", width: "100%" }}>
                <TextField
                  inputRef={searchInputRef}
                  label="שם או מספר קורס"
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  fullWidth
                  value={picked ? picked.courseName : search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPicked(null);
                  }}
                  disabled={adding || coursesLoading}
                  dir="rtl"
                  inputProps={{
                    autoComplete: "off",
                    role: "combobox",
                    "aria-expanded": suggestOpen,
                    "aria-controls": listboxId
                  }}
                  InputProps={{
                    readOnly: Boolean(picked),
                    endAdornment: picked ? (
                      <InputAdornment position="end" sx={{ marginInlineStart: 0 }}>
                        <IconButton
                          size="small"
                          aria-label="בטל בחירת קורס"
                          edge="end"
                          onClick={clearPick}
                          disabled={adding}
                        >
                          <ClearRoundedIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : undefined
                  }}
                  sx={{
                    "& .MuiInputBase-input": { textAlign: "right", direction: "rtl" }
                  }}
                />
                <CourseSuggestListbox
                  open={suggestOpen}
                  anchorEl={anchorRef.current}
                  listboxId={listboxId}
                  results={results}
                  searching={searching}
                  error={searchError}
                  disabledIds={disabledIds}
                  listBusy={adding}
                  onSelect={(c) => {
                    setPicked(c);
                    setSearch(c.courseName);
                    dismissSuggestions();
                  }}
                />
              </Box>
              <Stack direction="row" spacing={1} justifyContent="flex-start" sx={{ mt: 1.5 }} flexWrap="wrap">
                <Button variant="outlined" size="small" onClick={closeAddCourseEditor} disabled={adding}>
                  ביטול
                </Button>
                <Button variant="contained" size="small" disabled={!picked || adding} onClick={() => void handleAddCourse()}>
                  {adding ? "מוסיף…" : "שמירה"}
                </Button>
              </Stack>
            </Box>
          </ClickAwayListener>
        )}
      </Box>
    </Paper>
  );
}

type CardProps = {
  requirement: RequirementRow;
  catalogYear: number;
  onUpdated: () => void;
};

export function RequirementCard({ requirement, catalogYear, onUpdated }: CardProps) {
  const [semesterDialogOpen, setSemesterDialogOpen] = useState(false);
  const [semesterName, setSemesterName] = useState("סמסטר א'");
  const [semesterSaving, setSemesterSaving] = useState(false);
  const [semesterDialogError, setSemesterDialogError] = useState<string | null>(null);

  const hasCoursesStructure = requirement.hasSemesters;
  const catalogListEnabled = Boolean(requirement.catalog) && catalogYear > 0;

  const {
    courses: mergedCourses,
    loading: coursesLoading,
    error: coursesFetchError
  } = useCatalogCourseList({
    db: firebaseDb,
    catalogId: requirement.catalog,
    catalogYear,
    enabled: catalogListEnabled,
    /** Placeholder: full course table from אביב for the catalog’s Technion year (e.g. אביב תשפ״ו when year matches). */
    source: "pinnedSemester",
    pinnedSemesterIndex: 1
  });

  const openNewSemesterDialog = () => {
    setSemesterName(
      requirement.courses.semesters.length === 0 ? "סמסטר א'" : `סמסטר ${requirement.courses.semesters.length + 1}`
    );
    setSemesterDialogError(null);
    setSemesterDialogOpen(true);
  };

  const submitSemester = async () => {
    const trimmed = semesterName.trim();
    if (!trimmed) {
      setSemesterDialogError("נא להזין שם סמסטר");
      return;
    }
    setSemesterSaving(true);
    setSemesterDialogError(null);
    try {
      await appendRequirementSemester(firebaseDb, requirement.id, trimmed);
      setSemesterDialogOpen(false);
      onUpdated();
    } catch (e) {
      console.error(e);
      setSemesterDialogError("השמירה נכשלה.");
    } finally {
      setSemesterSaving(false);
    }
  };

  const metaChips = (
    <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
      {requirement.hasSemesters ? <Chip size="small" color="primary" variant="outlined" label="חלוקה לסמסטרים" /> : null}
      {requirement.minCredits > 0 ? (
        <Typography variant="body2" color="text.secondary" component="span">
          מינימום {requirement.minCredits} נק״ז
        </Typography>
      ) : null}
      {requirement.minCourses > 0 ? (
        <Typography variant="body2" color="text.secondary" component="span">
          מינימום {requirement.minCourses} קורסים
        </Typography>
      ) : null}
    </Stack>
  );

  return (
    <Paper
      elevation={0}
      sx={(theme) => ({
        p: 2.5,
        mb: 2,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        bgcolor: theme.palette.background.paper
      })}
    >
      <Typography variant="h6" component="h3" fontWeight={700} gutterBottom>
        {requirement.name}
      </Typography>
      {metaChips}

      {hasCoursesStructure ? (
        <>
          {requirement.courses.semesters.length === 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                יש ליצור את הסמסטר הראשון לפני הוספת קורסים.
              </Typography>
              <Button variant="contained" size="small" onClick={openNewSemesterDialog}>
                הוספת סמסטר
              </Button>
            </Alert>
          ) : (
            <>
              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  mb: 2,
                  alignItems: "stretch",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                    md: "repeat(3, minmax(0, 1fr))"
                  }
                }}
              >
                {requirement.courses.semesters.map((sem, idx) => (
                  <Box key={`${requirement.id}-sem-${idx}`} sx={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                    <RequirementSemesterBox
                      requirementId={requirement.id}
                      semesterIndex={idx}
                      semester={sem}
                      catalogId={requirement.catalog}
                      catalogYear={catalogYear}
                      mergedCourses={mergedCourses}
                      coursesLoading={coursesLoading}
                      coursesFetchError={coursesFetchError}
                      onUpdated={onUpdated}
                    />
                  </Box>
                ))}
              </Box>
              <Button variant="outlined" size="small" onClick={openNewSemesterDialog}>
                הוספת סמסטר
              </Button>
            </>
          )}
        </>
      ) : (
        <RequirementFlatCoursesBox
          requirementId={requirement.id}
          flatCourseIds={requirement.flatCourseIds}
          catalogId={requirement.catalog}
          catalogYear={catalogYear}
          mergedCourses={mergedCourses}
          coursesLoading={coursesLoading}
          coursesFetchError={coursesFetchError}
          onUpdated={onUpdated}
        />
      )}

      <Dialog
        open={semesterDialogOpen}
        onClose={() => {
          if (!semesterSaving) setSemesterDialogOpen(false);
        }}
        fullWidth
        maxWidth="xs"
        aria-labelledby="add-semester-title"
      >
        <DialogTitle id="add-semester-title">הוספת סמסטר</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="שם הסמסטר"
            fullWidth
            value={semesterName}
            onChange={(e) => setSemesterName(e.target.value)}
            disabled={semesterSaving}
            sx={{ mt: 1 }}
          />
          {semesterDialogError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {semesterDialogError}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSemesterDialogOpen(false)} disabled={semesterSaving}>
            ביטול
          </Button>
          <Button variant="contained" onClick={() => void submitSemester()} disabled={semesterSaving}>
            {semesterSaving ? "שומר…" : "הוספה"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
