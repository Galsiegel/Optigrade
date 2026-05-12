"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

/** Ease-out: fast start, slows like a pump display settling. */
function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4;
}

export function AnimatedWeightedAverageBlock({
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
