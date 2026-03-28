"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppBar, Toolbar, Typography, Box, Button } from "@mui/material";
import Link from "next/link";
import { ThemeToggleButton } from "./ThemeToggleButton";
import { useAuth } from "@/contexts/AuthContext";

const isDev = process.env.NODE_ENV === "development";

export function AppHeader() {
  const {
    user,
    profile,
    isAdmin,
    viewAsRegularUser,
    setViewAsRegularUser,
    resetOnboarding
  } = useAuth();
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const actualIsAdmin = profile?.role === "admin";

  const handleResetOnboarding = async () => {
    setResetting(true);
    try {
      await resetOnboarding();
      if (actualIsAdmin) {
        router.replace("/onboarding");
      }
    } finally {
      setResetting(false);
    }
  };

  const handleToggleViewAsRegular = () => {
    const next = !viewAsRegularUser;
    setViewAsRegularUser(next);
    if (next) {
      router.push("/");
    }
  };

  return (
    <AppBar
      position="sticky"
      component="header"
      elevation={0}
      aria-label="ניווט ראשי"
      sx={{ bgcolor: "background.paper", color: "text.primary", borderBottom: 1, borderColor: "divider" }}
    >
      <Toolbar sx={{ justifyContent: "space-between" }} component="nav" aria-label="קישורים ופעולות">
        <Typography
          component={Link}
          href="/"
          variant="h6"
          fontWeight={600}
          color="primary"
          sx={{ textDecoration: "none" }}
        >
          גמרים
        </Typography>
        <Box display="flex" alignItems="center" gap={0.5}>
          {isDev && user && actualIsAdmin && (
            <>
              <Button
                size="small"
                color="inherit"
                onClick={handleToggleViewAsRegular}
                variant={viewAsRegularUser ? "outlined" : "text"}
                sx={{ fontSize: "0.75rem", minWidth: "auto", px: 1 }}
              >
                {viewAsRegularUser ? "יציאה ממצב משתמש" : "תצוגה כמשתמש"}
              </Button>
              <Button
                size="small"
                color="inherit"
                onClick={handleResetOnboarding}
                disabled={resetting}
                sx={{ fontSize: "0.75rem", minWidth: "auto", px: 1 }}
              >
                {resetting ? "..." : "איפוס אונבורדינג"}
              </Button>
            </>
          )}
          <ThemeToggleButton />
        </Box>
      </Toolbar>
    </AppBar>
  );
}
