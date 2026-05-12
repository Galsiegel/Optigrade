/** RTL: title (מספר+שם) | נק״ז | ציון | פעולות */
export const GRADES_ROW_GRID =
  "minmax(0, 1fr) minmax(3.5rem, auto) minmax(5.5rem, 5.5rem) auto";

/** Add-row layout: give the search field more width than the table rows. */
export const ADD_GRADE_FORM_GRID =
  "minmax(0, 1fr) minmax(3rem, auto) minmax(4.75rem, 4.75rem) auto";

/** Keep grades list fluid/responsive inside layout (no forced viewport overflow). */
export const GRADES_LIST_VIEWPORT_BREAKOUT_SX = {
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box" as const
};

export const gradeNameCellSx = {
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

export const gradeCatalogLabelSx = {
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

export const courseTitleRowSx = {
  gridColumn: "1",
  display: "flex",
  flexDirection: "row" as const,
  alignItems: "center",
  gap: 1,
  minWidth: 0,
  width: "100%"
};

export const gradePointsCellSx = {
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
