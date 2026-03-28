"use client";

import { Box, Button, Container, Stack, Typography } from "@mui/material";
import { useAuth } from "@/contexts/AuthContext";
import { getDisplayName } from "@/lib/users";
import { AdminRoute } from "@/components/AdminRoute";
import Link from "next/link";

function AdminPageContent() {
  const { user, profile, signOut } = useAuth();

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h4" component="h1" fontWeight={600}>
            לוח בקרה למנהלים
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button component={Link} href="/" variant="outlined">
              בית
            </Button>
            <Button variant="contained" onClick={() => signOut()}>
              התנתק
            </Button>
          </Stack>
        </Box>
        <Typography color="text.secondary">
          שלום, {getDisplayName(profile) ?? user?.email}. יש לך הרשאות מנהל.
        </Typography>
        <Box
          sx={(theme) => ({
            p: 3,
            borderRadius: 2,
            border: "1px solid",
            borderColor: theme.palette.divider,
            bgcolor: theme.palette.background.paper
          })}
        >
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            תוכן למנהלים בלבד
          </Typography>
          <Typography variant="body2">
            דף זה מוצג רק למשתמשים עם תפקיד מנהל. הוסף כאן את תכונות הניהול שלך.
          </Typography>
        </Box>
      </Stack>
    </Container>
  );
}

export default function AdminPage() {
  return (
    <AdminRoute>
      <AdminPageContent />
    </AdminRoute>
  );
}
