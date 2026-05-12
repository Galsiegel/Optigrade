"use client";

import type { ReactNode } from "react";
import { Box, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getDisplayName } from "@/lib/users";
import { UserCoursesGradesPanel } from "@/components/userCourses/UserCoursesGradesPanel";

export default function DashboardPage() {
  const { profile, isAdmin, user } = useAuth();

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>


        <DashboardSectionCard title="הקורסים שלך">
          <UserCoursesGradesPanel active hideIntro />
        </DashboardSectionCard>

        {isAdmin ? (
          <Typography variant="body2">
            <Link href="/admin" style={{ fontWeight: 700 }}>
              לוח בקרה למנהלים
            </Link>
          </Typography>
        ) : null}
      </Stack>
    </Container>
  );
}

function DashboardSectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      aria-labelledby="dashboard-courses-heading"
      sx={(theme) => ({
        p: { xs: 2, sm: 3 },
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        boxShadow: theme.palette.mode === "dark" ? theme.shadows[4] : theme.shadows[1]
      })}
    >
      <Typography id="dashboard-courses-heading" variant="h6" component="h2" fontWeight={800} sx={{ mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}
