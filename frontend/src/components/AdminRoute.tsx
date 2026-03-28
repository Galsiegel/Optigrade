"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Box, Button, Container, Typography } from "@mui/material";

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isAdmin) {
      router.replace("/");
    }
  }, [user, isAdmin, loading, router]);

  if (loading) {
    return (
      <Box
        role="status"
        aria-live="polite"
        aria-busy="true"
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Typography color="text.secondary">טוען...</Typography>
      </Box>
    );
  }

  if (!user || !isAdmin) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: "center" }}>
        <Typography variant="h6" component="h1" color="text.secondary" gutterBottom>
          אין גישה
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          נדרשות הרשאות מנהל כדי לצפות בדף זה.
        </Typography>
        <Button variant="contained" onClick={() => router.push("/")}>
          חזרה לבית
        </Button>
      </Container>
    );
  }

  return <>{children}</>;
}
