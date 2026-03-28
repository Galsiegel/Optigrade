import type { Metadata } from "next";
import { ReactNode } from "react";
import { Heebo } from "next/font/google";
import ThemeRegistry from "@/theme/ThemeRegistry";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  weight: "variable",
  display: "swap"
});

export const metadata: Metadata = {
  title: "גמרים",
  description: "לקוח גמרים עם Firebase"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className={heebo.className}>
        <a href="#main-content" className="skip-to-content">
          דלג לתוכן העיקרי
        </a>
        <ThemeRegistry>
          <AuthProvider>
            <ProtectedRoute>
              <AppShell>{children}</AppShell>
            </ProtectedRoute>
          </AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}

