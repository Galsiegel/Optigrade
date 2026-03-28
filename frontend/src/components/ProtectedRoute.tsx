"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Box, CircularProgress, Typography } from "@mui/material";

const PUBLIC_PATHS = ["/login"];
const ONBOARDING_PATH = "/onboarding";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, needsOnboarding } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    pathname === path || pathname.startsWith(`${path}/`)
  );
  const isOnboardingPath = pathname === ONBOARDING_PATH || pathname?.startsWith(`${ONBOARDING_PATH}/`);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublicPath) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname ?? "/")}`);
      return;
    }
    if (user && needsOnboarding && !isOnboardingPath) {
      router.replace(`/onboarding?redirect=${encodeURIComponent(pathname ?? "/")}`);
    } else if (user && !needsOnboarding && isOnboardingPath) {
      const redirect = new URLSearchParams(window.location.search).get("redirect") || "/";
      router.replace(
        (redirect.startsWith("/") ? redirect : "/") as Parameters<typeof router.replace>[0]
      );
    }
  }, [user, loading, needsOnboarding, isPublicPath, isOnboardingPath, pathname, router]);

  if (loading && !user) {
    return (
      <Box
        role="status"
        aria-live="polite"
        aria-busy="true"
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2
        }}
      >
        <CircularProgress aria-hidden />
        <Typography color="text.secondary">טוען...</Typography>
      </Box>
    );
  }

  if (!user && !isPublicPath) {
    return null;
  }
  if (user && needsOnboarding && !isOnboardingPath) {
    return null;
  }

  return <>{children}</>;
}
