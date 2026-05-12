"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress, Typography } from "@mui/material";

/** Root `/` redirects signed-in users to the main dashboard (see `/dashboard`). */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <Box
      role="status"
      aria-live="polite"
      aria-busy="true"
      sx={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2
      }}
    >
      <CircularProgress aria-hidden size={32} />
      <Typography color="text.secondary">מעבירים ללוח הבקרה...</Typography>
    </Box>
  );
}
