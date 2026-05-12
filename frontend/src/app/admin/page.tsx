"use client";

import { Box, Button, Container, Stack, Typography } from "@mui/material";
import { useAuth } from "@/contexts/AuthContext";
import { getDisplayName } from "@/lib/users";
import { AdminRoute } from "@/components/AdminRoute";
import { TrackRequirementsSection } from "@/app/admin/components/TrackRequirementsSection";
import Link from "next/link";

function AdminPageContent() {
  const { user, profile, signOut } = useAuth();

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <TrackRequirementsSection />
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
