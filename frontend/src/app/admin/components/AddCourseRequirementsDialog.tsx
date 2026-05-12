"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { formatAcademicYearSpan } from "@/lib/hebrewYear";
import type { CatalogRecord } from "@/lib/catalogs";
import type { TrackOption } from "@/lib/tracks";

type Props = {
  open: boolean;
  onClose: () => void;
  track: TrackOption | null;
  catalog: CatalogRecord | null;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: {
    name: string;
    splitBySemesters: boolean;
    creditRequirement: boolean;
    creditPoints: number | null;
    courseCountRequirement: boolean;
    courseCount: number | null;
  }) => void | Promise<void>;
};

export function AddCourseRequirementsDialog({
  open,
  onClose,
  track,
  catalog,
  submitting,
  errorMessage,
  onSubmit
}: Props) {
  const [name, setName] = useState("");
  const [splitBySemesters, setSplitBySemesters] = useState(false);
  const [creditRequirement, setCreditRequirement] = useState(false);
  const [creditPointsStr, setCreditPointsStr] = useState("");
  const [courseCountRequirement, setCourseCountRequirement] = useState(false);
  const [courseCountStr, setCourseCountStr] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setSplitBySemesters(false);
    setCreditRequirement(false);
    setCreditPointsStr("");
    setCourseCountRequirement(false);
    setCourseCountStr("");
    setLocalError(null);
  }, [open]);

  const catalogSummary =
    catalog != null ? `${catalog.hebYear} (${formatAcademicYearSpan(catalog.year)})` : "";

  const handleCreate = async () => {
    setLocalError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError("נא להזין שם");
      return;
    }
    let creditPoints: number | null = null;
    if (creditRequirement) {
      const n = Number.parseFloat(creditPointsStr.replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) {
        setLocalError("נא להזין מספר נק״ז חיובי");
        return;
      }
      creditPoints = n;
    }
    let courseCount: number | null = null;
    if (courseCountRequirement) {
      const t = courseCountStr.trim();
      if (!/^\d+$/.test(t)) {
        setLocalError("נא להזין מספר שלם חיובי של קורסים");
        return;
      }
      const n = Number.parseInt(t, 10);
      if (!Number.isFinite(n) || n < 1) {
        setLocalError("נא להזין מספר שלם חיובי של קורסים");
        return;
      }
      courseCount = n;
    }
    await onSubmit({
      name: trimmed,
      splitBySemesters,
      creditRequirement,
      creditPoints,
      courseCountRequirement,
      courseCount
    });
  };

  const combinedError = localError ?? errorMessage;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="add-course-requirements-title"
    >
      <DialogTitle id="add-course-requirements-title">הוספת דרישות קורסים</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {track && catalog ? (
            <Typography variant="body2" color="text.secondary">
              מסלול: {track.title} · קטלוג: {catalogSummary}
            </Typography>
          ) : null}
          <TextField
            label="שם"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            autoFocus
            disabled={submitting}
            inputProps={{ "aria-required": true }}
          />
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={splitBySemesters}
                  onChange={(_, v) => setSplitBySemesters(v)}
                  disabled={submitting}
                />
              }
              label="חלוקה לסמסטרים"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={creditRequirement}
                  onChange={(_, v) => {
                    setCreditRequirement(v);
                    if (!v) setCreditPointsStr("");
                  }}
                  disabled={submitting}
                />
              }
              label='דרישת נק״ז'
            />
            <TextField
              label="מספר נק״ז"
              type="text"
              value={creditPointsStr}
              onChange={(e) => setCreditPointsStr(e.target.value)}
              disabled={!creditRequirement || submitting}
              fullWidth
              inputProps={{
                inputMode: "decimal",
                dir: "ltr",
                "aria-label": "מספר נק״ז נדרש"
              }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={courseCountRequirement}
                  onChange={(_, v) => {
                    setCourseCountRequirement(v);
                    if (!v) setCourseCountStr("");
                  }}
                  disabled={submitting}
                />
              }
              label="דרישת כמות קורסים"
            />
            <TextField
              label="מספר קורסים"
              type="text"
              value={courseCountStr}
              onChange={(e) => setCourseCountStr(e.target.value)}
              disabled={!courseCountRequirement || submitting}
              fullWidth
              inputProps={{
                inputMode: "numeric",
                dir: "ltr",
                "aria-label": "מספר קורסים נדרש"
              }}
            />
          </FormGroup>
          {combinedError ? (
            <Alert severity="error" role="alert">
              {combinedError}
            </Alert>
          ) : null}
          {submitting ? (
            <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">
              שומר…
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          ביטול
        </Button>
        <Button variant="contained" onClick={() => void handleCreate()} disabled={submitting}>
          יצירה
        </Button>
      </DialogActions>
    </Dialog>
  );
}
