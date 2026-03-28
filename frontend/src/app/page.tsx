"use client";

import { Box, Button, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getDisplayName } from "@/lib/users";

export default function HomePage() {
  const { user, profile, isAdmin, signOut } = useAuth();

  return (
    <Container
      maxWidth="lg"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center"
      }}
    >
      <Stack spacing={6} direction={{ xs: "column", md: "row" }} alignItems="center" width="100%">
        <Box flex={1}>
          <Typography variant="overline" color="primary" sx={{ letterSpacing: 2 }}>
            גמרים
          </Typography>
          <Typography variant="h3" component="h1" sx={{ mt: 1, fontWeight: 600 }}>
            שלום, {getDisplayName(profile) ?? user?.email ?? "משתמש"}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 2, maxWidth: 480 }}>
            אתה מחובר עם Google. זו דף הבית המוגן שלך.
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
            {isAdmin && (
              <Button component={Link} href="/admin" variant="contained" size="large">
                לוח בקרה למנהלים
              </Button>
            )}
            <Button variant="outlined" size="large" onClick={() => signOut()}>
              התנתק
            </Button>
          </Stack>
        </Box>
        <Box
          flex={1}
          sx={(theme) => ({
            borderRadius: 3,
            p: 3,
            border: "1px solid",
            borderColor: theme.palette.divider,
            background:
              theme.palette.mode === "light"
                ? "radial-gradient(circle at top left, #e3f2fd, #f5f5f5)"
                : "radial-gradient(circle at top left, #1e3a8a, #020617)"
          })}
        >
          <Typography variant="subtitle2" color="text.secondary">
            הצעדים הבאים
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            - הגדר Firebase ב־<code>src/firebase/config.ts</code>
            <br />
            - התאם את העיצוב ב־<code>src/theme/theme.ts</code>
            <br />
            - התחל לבנות דפים ב־<code>src/app</code>
          </Typography>
        </Box>
      </Stack>
    </Container>
  );
}

