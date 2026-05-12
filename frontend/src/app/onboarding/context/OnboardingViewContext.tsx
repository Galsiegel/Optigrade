"use client";

import { createContext, useContext } from "react";
import type { UserProfile } from "@/lib/users";

export type OnboardingViewContextValue = {
  firstName: string;
  lastName: string;
  nameSaving: boolean;
  error: string | null;
  setFirstName: (v: string) => void;
  setLastName: (v: string) => void;
  setError: (v: string | null) => void;
  handleSaveName: (e: React.FormEvent) => Promise<void>;
  profile: UserProfile | null;
  summaryTrackLabel: string | null;
  finishStepCatalogLoading: boolean;
  finishStepCatalogSummary: string | null;
  selectedTrack: string | null;
  setSelectedTrack: (v: string | null) => void;
  trackOptions: { id: string; title: string; description: string }[];
  tracksLoading: boolean;
  tracksError: string | null;
  trackSaving: boolean;
  handleSaveTrack: () => Promise<void>;
};

const OnboardingViewContext = createContext<OnboardingViewContextValue | null>(null);

export function OnboardingViewProvider({
  value,
  children
}: {
  value: OnboardingViewContextValue;
  children: React.ReactNode;
}) {
  return <OnboardingViewContext.Provider value={value}>{children}</OnboardingViewContext.Provider>;
}

export function useOnboardingViewContext(): OnboardingViewContextValue {
  const ctx = useContext(OnboardingViewContext);
  if (!ctx) {
    throw new Error("useOnboardingViewContext must be used inside OnboardingViewProvider");
  }
  return ctx;
}

