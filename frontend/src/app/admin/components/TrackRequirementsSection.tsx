"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
  type SelectChangeEvent
} from "@mui/material";
import { FirebaseError } from "firebase/app";
import { firebaseDb } from "@/firebase/config";
import { fetchCatalogRecords, type CatalogRecord } from "@/lib/catalogs";
import { formatAcademicYearSpan } from "@/lib/hebrewYear";
import { fetchTrackRecords, type TrackRecord } from "@/lib/tracks";
import { createRequirement, listRequirements, type RequirementRow } from "@/lib/requirements";
import { AddCourseRequirementsDialog } from "./AddCourseRequirementsDialog";
import { RequirementCard } from "./RequirementCard";

export function TrackRequirementsSection() {
  const [tracks, setTracks] = useState<TrackRecord[]>([]);
  const [tracksError, setTracksError] = useState<string | null>(null);
  const [catalogs, setCatalogs] = useState<CatalogRecord[]>([]);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string>("");
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("");
  const [rows, setRows] = useState<RequirementRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const selectedCatalogYear = useMemo(() => {
    const c = catalogs.find((x) => x.id === selectedCatalogId);
    return c?.year ?? 0;
  }, [catalogs, selectedCatalogId]);

  useEffect(() => {
    let cancelled = false;
    fetchTrackRecords(firebaseDb)
      .then((list) => {
        if (!cancelled) {
          setTracks(list);
          setTracksError(null);
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          if (err instanceof FirebaseError && err.code === "permission-denied") {
            setTracksError(
              "הגישה למסלולים נחסמה. הוסיפו בחוקי Firestore קריאה ל-collection בשם tracks למשתמשים מחוברים, ופרסו את ה-rules."
            );
          } else {
            setTracksError("טעינת מסלולים נכשלה. נסו שוב.");
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCatalogRecords(firebaseDb)
      .then((list) => {
        if (!cancelled) {
          setCatalogs(list);
          setCatalogsError(null);
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setCatalogsError("טעינת קטלוגים נכשלה. בדוק הרשאות Firestore.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTrack = useMemo(
    () => tracks.find((t) => t.id === selectedTrackId) ?? null,
    [tracks, selectedTrackId]
  );
  const selectedCatalog = useMemo(
    () => catalogs.find((c) => c.id === selectedCatalogId) ?? null,
    [catalogs, selectedCatalogId]
  );

  const canAdd = Boolean(selectedTrackId && selectedCatalogId);

  const refreshRows = useCallback(async () => {
    if (!selectedTrackId || !selectedCatalogId) {
      setRows([]);
      setGroupsError(null);
      return;
    }
    setRowsLoading(true);
    setGroupsError(null);
    try {
      const list = await listRequirements(firebaseDb, selectedTrackId, selectedCatalogId);
      setRows(list);
    } catch (err) {
      console.error(err);
      setRows([]);
      const perm =
        err instanceof FirebaseError && err.code === "permission-denied"
          ? "אין הרשאה (לרוב: חוקי Firestore לא פורסו לפרויקט, או שהמשתמש לא מוגדר כ־admin במסמך users). הריצו מתוך frontend: npm run deploy:rules"
          : "טעינת הדרישות נכשלה.";
      setGroupsError(perm);
    } finally {
      setRowsLoading(false);
    }
  }, [selectedCatalogId, selectedTrackId]);

  useEffect(() => {
    void refreshRows();
  }, [refreshRows]);

  const handleTrackChange = (e: SelectChangeEvent<string>) => {
    setSelectedTrackId(e.target.value);
  };

  const handleCatalogChange = (e: SelectChangeEvent<string>) => {
    setSelectedCatalogId(e.target.value);
  };

  return (
    <Box
      component="section"
      aria-labelledby="track-requirements-heading"
      sx={(theme) => ({
        p: 3,
        borderRadius: 2,
        border: "1px solid",
        borderColor: theme.palette.divider,
        bgcolor: theme.palette.background.paper
      })}
    >
      <Typography id="track-requirements-heading" variant="h6" component="h2" gutterBottom>
        דרישות מסלול
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        בחרו מסלול וקטלוג. כל דרישה מוצגת בבלוק נפרד; ניתן להוסיף סמסטרים וקורסים כשמופעלת חלוקה לסמסטרים.
      </Typography>
      {tracksError ? (
        <Typography color="error" variant="body2" sx={{ mb: 2 }} role="alert">
          {tracksError}
        </Typography>
      ) : null}
      {catalogsError ? (
        <Typography color="error" variant="body2" sx={{ mb: 2 }} role="alert">
          {catalogsError}
        </Typography>
      ) : null}
      {groupsError ? (
        <Alert severity="error" sx={{ mb: 2 }} role="alert">
          {groupsError}
        </Alert>
      ) : null}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} sx={{ mb: 2 }}>
        <FormControl fullWidth size="small" variant="outlined">
          <InputLabel id="admin-track-label" shrink>
            מסלול
          </InputLabel>
          <Select
            labelId="admin-track-label"
            label="מסלול"
            value={selectedTrackId}
            onChange={handleTrackChange}
            displayEmpty
            disabled={tracks.length === 0}
            renderValue={(v) => {
              if (!v) return <Typography color="text.secondary">בחר מסלול</Typography>;
              const t = tracks.find((o) => o.id === v);
              return t?.title ?? v;
            }}
          >
            <MenuItem value="">
              <em>בחר מסלול</em>
            </MenuItem>
            {tracks.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.title}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth size="small" variant="outlined">
          <InputLabel id="admin-catalog-label" shrink>
            קטלוג
          </InputLabel>
          <Select
            labelId="admin-catalog-label"
            label="קטלוג"
            value={selectedCatalogId}
            onChange={handleCatalogChange}
            displayEmpty
            disabled={catalogs.length === 0}
            renderValue={(v) => {
              if (!v) return <Typography color="text.secondary">בחר קטלוג</Typography>;
              const c = catalogs.find((x) => x.id === v);
              if (!c) return v;
              return `${c.hebYear} (${formatAcademicYearSpan(c.year)})`;
            }}
          >
            <MenuItem value="">
              <em>בחר קטלוג</em>
            </MenuItem>
            {catalogs.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.hebYear} ({formatAcademicYearSpan(c.year)})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="contained" disabled={!canAdd} onClick={() => setDialogOpen(true)} sx={{ flexShrink: 0 }}>
          הוספת דרישות קורסים
        </Button>
      </Stack>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        דרישות קיימות
      </Typography>
      {rowsLoading ? (
        <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">
          טוען…
        </Typography>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          אין עדיין דרישות למסלול ולקטלוג שנבחרו.
        </Typography>
      ) : (
        <Box sx={{ mt: 1 }}>
          {rows.map((r) => (
            <RequirementCard
              key={r.id}
              requirement={r}
              catalogYear={selectedCatalogYear}
              onUpdated={() => void refreshRows()}
            />
          ))}
        </Box>
      )}
      <AddCourseRequirementsDialog
        open={dialogOpen}
        onClose={() => {
          if (submitting) return;
          setDialogOpen(false);
          setSubmitError(null);
        }}
        track={selectedTrack}
        catalog={selectedCatalog}
        submitting={submitting}
        errorMessage={submitError}
        onSubmit={async (values) => {
          if (!selectedTrackId || !selectedCatalogId) return;
          setSubmitting(true);
          setSubmitError(null);
          try {
            await createRequirement(firebaseDb, {
              name: values.name,
              track: selectedTrackId,
              catalog: selectedCatalogId,
              hasSemesters: values.splitBySemesters,
              minCredits:
                values.creditRequirement && values.creditPoints != null && values.creditPoints > 0
                  ? values.creditPoints
                  : 0,
              minCourses:
                values.courseCountRequirement && values.courseCount != null && values.courseCount > 0
                  ? values.courseCount
                  : 0
            });
            setDialogOpen(false);
            await refreshRows();
          } catch (err) {
            console.error(err);
            setSubmitError("השמירה נכשלה. ודאו שחוקי Firestore כוללים את collection requirements למנהלים.");
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </Box>
  );
}
