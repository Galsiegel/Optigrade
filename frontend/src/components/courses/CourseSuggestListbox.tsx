"use client";

import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Popper,
  Typography
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { CourseListItem } from "@/lib/courses";

const suggestNameSx = {
  minWidth: 0,
  fontWeight: 800,
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis"
};

const suggestCatalogSx = {
  flexShrink: 0,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums" as const,
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
  color: "text.secondary" as const,
  maxWidth: "7.5rem"
};

export type CourseSuggestListboxProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  listboxId: string;
  results: CourseListItem[];
  searching: boolean;
  error: string | null;
  onSelect: (course: CourseListItem) => void;
  /** Course ids that cannot be chosen again (e.g. already have a grade). */
  disabledIds?: ReadonlySet<string>;
  listBusy?: boolean;
};

/**
 * RTL course suggest dropdown (Popper + listbox). Pair with a combobox `TextField` in the parent.
 */
export function CourseSuggestListbox({
  open,
  anchorEl,
  listboxId,
  results,
  searching,
  error,
  onSelect,
  disabledIds,
  listBusy = false
}: CourseSuggestListboxProps) {
  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="bottom"
      modifiers={[
        { name: "offset", options: { offset: [0, 4] } },
        {
          name: "sameWidth",
          enabled: true,
          phase: "beforeWrite",
          requires: ["computeStyles"],
          fn: ({ state }) => {
            const w = state.rects.reference.width;
            if (Number.isFinite(w)) state.styles.popper.width = `${w}px`;
          },
          effect: ({ state }) => {
            const el = state.elements.reference as HTMLElement;
            const w = el?.offsetWidth;
            if (w) state.elements.popper.style.width = `${w}px`;
          }
        }
      ]}
      sx={{ zIndex: (theme) => theme.zIndex.modal }}
    >
      <Paper
        variant="outlined"
        elevation={0}
        id={listboxId}
        role="listbox"
        sx={(theme) => ({
          maxHeight: 220,
          overflowY: "auto",
          borderRadius: 2,
          border: "1px solid",
          ...(theme.palette.mode === "light"
            ? {
                borderColor: "divider",
                bgcolor: theme.palette.background.paper,
                boxShadow: `0 4px 16px ${alpha(theme.palette.common.black, 0.07)}, 0 1px 3px ${alpha(theme.palette.common.black, 0.05)}`
              }
            : {
                bgcolor: "#1e293b",
                borderColor: alpha(theme.palette.common.white, 0.18),
                boxShadow: `0 0 0 1px ${alpha(theme.palette.common.white, 0.06)}, 0 12px 40px ${alpha("#000", 0.55)}, 0 0 24px ${alpha(theme.palette.primary.light, 0.08)}`
              })
        })}
      >
        <List dense disablePadding component="div" aria-label="תוצאות חיפוש קורס" sx={{ direction: "rtl" }}>
          {searching ? (
            <ListItemButton
              disabled
              role="option"
              aria-busy="true"
              sx={{
                py: 0.75,
                px: 1.5,
                "&.Mui-disabled": { opacity: 1 },
                borderBottom: "1px solid",
                borderColor: "divider"
              }}
            >
              <ListItemText
                primary="מחפש קורסים..."
                primaryTypographyProps={{
                  sx: { textAlign: "right", width: "100%", color: "text.secondary" }
                }}
              />
            </ListItemButton>
          ) : (
            <>
              {error ? (
                <ListItemButton
                  disabled
                  role="option"
                  sx={{
                    py: 0.75,
                    px: 1.5,
                    "&.Mui-disabled": { opacity: 1 },
                    borderBottom: "1px solid",
                    borderColor: "divider"
                  }}
                >
                  <ListItemText
                    primary={error}
                    primaryTypographyProps={{
                      sx: { textAlign: "right", width: "100%", color: "error.main" }
                    }}
                  />
                </ListItemButton>
              ) : null}
              {results.map((c, index) => {
                const taken = disabledIds?.has(c.courseId) ?? false;
                const isLast = index === results.length - 1;
                return (
                  <ListItemButton
                    key={c.courseId}
                    disabled={listBusy || taken}
                    role="option"
                    onClick={() => {
                      if (taken) return;
                      onSelect(c);
                    }}
                    sx={{
                      py: 0.75,
                      px: 1.5,
                      alignItems: "flex-start",
                      "&.Mui-disabled": { opacity: 0.55 },
                      borderBottom: isLast ? "none" : "1px solid",
                      borderColor: "divider"
                    }}
                  >
                    <ListItemText
                      disableTypography
                      primary={
                        <Box sx={{ width: "100%", minWidth: 0, textAlign: "right" }}>
                          <Box
                            component="span"
                            sx={{
                              display: "flex",
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 1,
                              width: "100%",
                              minWidth: 0,
                              justifyContent: "flex-start"
                            }}
                          >
                            <Typography
                              component="span"
                              variant="subtitle1"
                              sx={{ ...suggestCatalogSx, maxWidth: "7rem", fontSize: "1rem" }}
                            >
                              {c.courseNumber}
                            </Typography>
                            <Typography
                              component="span"
                              variant="subtitle1"
                              sx={{
                                ...suggestNameSx,
                                flex: 1,
                                minWidth: 0,
                                fontSize: "1rem",
                                fontWeight: taken ? 600 : 700
                              }}
                              title={c.courseName}
                            >
                              {c.courseName}
                            </Typography>
                            {c.pointsLabel ? (
                              <Typography
                                component="span"
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                  fontWeight: 700,
                                  fontVariantNumeric: "tabular-nums",
                                  flexShrink: 0,
                                  whiteSpace: "nowrap"
                                }}
                              >
                                {c.pointsLabel}
                              </Typography>
                            ) : null}
                          </Box>
                          {taken ? (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                display: "block",
                                mt: 0.35,
                                width: "100%",
                                textAlign: "right",
                                fontSize: "0.6875rem",
                                fontWeight: 500,
                                lineHeight: 1.2
                              }}
                            >
                              כבר ברשימה
                            </Typography>
                          ) : null}
                        </Box>
                      }
                    />
                  </ListItemButton>
                );
              })}
            </>
          )}
        </List>
      </Paper>
    </Popper>
  );
}
