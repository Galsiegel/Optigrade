"use client";

import { Alert, Box, Button, Container, Stack, Typography } from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawRedirect = searchParams.get("redirect") || "/";
  const redirectTo = rawRedirect.startsWith("/") ? rawRedirect : "/";

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirectTo as Parameters<typeof router.replace>[0]);
    }
  }, [user, loading, router, redirectTo]);

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      setSigningIn(true);
      await signInWithGoogle();
      router.replace(redirectTo as Parameters<typeof router.replace>[0]);
    } catch (err) {
      console.error("Sign-in error:", err);
      setError(err instanceof Error ? err.message : "ההתחברות נכשלה. נסה שוב.");
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <Container
        maxWidth="sm"
        role="status"
        aria-live="polite"
        aria-busy="true"
        sx={{ minHeight: "100vh", display: "flex", alignItems: "center" }}
      >
        <Typography color="text.secondary">טוען...</Typography>
      </Container>
    );
  }

  if (user) {
    return null; // Redirecting
  }

  return (
    <Container
      maxWidth="sm"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center"
      }}
    >
      <Stack spacing={4} alignItems="center" width="100%">
        <Typography variant="overline" color="primary" sx={{ letterSpacing: 2 }}>
          גמרים
        </Typography>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600, textAlign: "center" }}>
          התחבר כדי להמשיך
        </Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center">
          השתמש בחשבון Google שלך כדי להיכנס לאפליקציה.
        </Typography>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ width: "100%", maxWidth: 360 }}>
            {error}
          </Alert>
        )}
        <Button
          variant="contained"
          size="large"
          startIcon={<GoogleIcon />}
          onClick={handleGoogleSignIn}
          disabled={signingIn}
          sx={{ minWidth: 240 }}
        >
          {signingIn ? "מתחבר..." : "התחבר עם Google"}
        </Button>
      </Stack>
    </Container>
  );
}
