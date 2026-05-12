"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode
} from "react";
import type { User } from "firebase/auth";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut
} from "firebase/auth";
import { firebaseAuth, firebaseDb } from "@/firebase/config";
import {
  getOrCreateUserProfile,
  resetOnboarding as resetOnboardingInDb,
  type UserProfile,
  type UserRole
} from "@/lib/users";

const VIEW_AS_REGULAR_KEY = "gmarim-view-as-regular-user";

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isAdmin: boolean;
  needsOnboarding: boolean;
  viewAsRegularUser: boolean;
  setViewAsRegularUser: (value: boolean) => void;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getStoredViewAsRegular(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(VIEW_AS_REGULAR_KEY) === "true";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewAsRegularUser, setViewAsRegularUserState] = useState(false);

  useEffect(() => {
    setViewAsRegularUserState(getStoredViewAsRegular());
  }, []);

  const setViewAsRegularUser = useCallback((value: boolean) => {
    setViewAsRegularUserState(value);
    if (typeof window !== "undefined") {
      localStorage.setItem(VIEW_AS_REGULAR_KEY, String(value));
    }
  }, []);

  const loadProfile = useCallback(async (u: User) => {
    const p = await getOrCreateUserProfile(firebaseDb, u);
    setProfile(p);
    return p;
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = onAuthStateChanged(firebaseAuth, async (u) => {
        setUser(u);
        if (u) {
          try {
            const p = await getOrCreateUserProfile(firebaseDb, u);
            setProfile(p);
          } catch (err) {
            console.error("Failed to fetch user profile:", err);
            setProfile(null);
          }
        } else {
          setProfile(null);
        }
        setLoading(false);
      });
    } catch (err) {
      console.error("Firebase auth init failed:", err);
      setLoading(false);
    }

    const timeout = setTimeout(() => setLoading(false), 5000);
    return () => {
      clearTimeout(timeout);
      unsubscribe?.();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await loadProfile(user);
  }, [user, loadProfile]);

  const resetOnboarding = useCallback(async () => {
    if (!user) return;
    await resetOnboardingInDb(firebaseDb, user.uid);
    await loadProfile(user);
  }, [user, loadProfile]);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      throw new Error(
        `ההתחברות נכשלה: ${msg}. בדוק ש־.env.local מכיל מפתחות Firebase תקינים והפעל מחדש את השרת.`
      );
    }
  }, []);

  const signOut = useCallback(async () => {
    setViewAsRegularUser(false);
    await fbSignOut(firebaseAuth);
  }, [setViewAsRegularUser]);

  const actualIsAdmin = profile?.role === "admin";
  const effectiveIsAdmin = actualIsAdmin && !viewAsRegularUser;
  const effectiveNeedsOnboarding =
    !!user &&
    !!profile &&
    (!profile.onboardingCompleted ||
      !profile.firstName?.trim() ||
      !profile.lastName?.trim() ||
      !profile.track?.trim());

  const value: AuthContextValue = {
    user,
    profile,
    role: profile?.role ?? null,
    isAdmin: effectiveIsAdmin,
    needsOnboarding: effectiveNeedsOnboarding,
    viewAsRegularUser,
    setViewAsRegularUser,
    loading,
    signInWithGoogle,
    signOut,
    refreshProfile,
    resetOnboarding
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
