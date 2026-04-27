/** Base URL for the Python FastAPI backend (no trailing slash). */
export function getApiBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/**
 * If the API base is the same origin as the Next app (e.g. both localhost:3000),
 * `fetch` hits Next instead of uvicorn and you get errors like "Server action not found."
 * Call from the browser before transcript upload.
 */
export function getApiBaseUrlSameOriginMisconfigMessage(base: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const apiOrigin = new URL(base, window.location.href).origin;
    if (apiOrigin === window.location.origin) {
      return "NEXT_PUBLIC_API_URL מצביע על שרת Next (אותו מקור כמו האתר). הגדירו את שרת ה־Python, למשל http://localhost:8000, והריצו uvicorn מתיקיית backend.";
    }
  } catch {
    return "NEXT_PUBLIC_API_URL אינה כתובת תקינה.";
  }
  return null;
}
