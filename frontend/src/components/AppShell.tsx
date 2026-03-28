"use client";

import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname?.startsWith("/onboarding");

  return (
    <>
      {!isOnboarding && <AppHeader />}
      <main id="main-content">{children}</main>
    </>
  );
}
