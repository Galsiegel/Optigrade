# Project context (Optigrade / גמרים)

**Purpose:** High-level product state, terminology, and priorities. **Technical wiring, types, Firestore shapes, and `backend/api` routes** live in **`ARCH_LOG.md`** (repository root) — read that before structural or data-layer work.

Update this file when goals, scope, or “where we are” change; keep it short so it stays truthful.

---

## What we are building

A **Hebrew-first**, **RTL** web app for **Electrical and Computer Engineering** students to **verify degree progress**: tracks (מסלול), catalog alignment, grades, and requirement-style compliance. **Google sign-in**, **onboarding**, then **home**; **admin** for privileged users.

---

## Current focus (edit as you go)

- **Now:** Monorepo **FastAPI** surface under `backend/api/` (`/api/v1` — health, `GET /me` with Firebase ID token, transcript PDF parse). Frontend has [`frontend/src/lib/api.ts`](frontend/src/lib/api.ts) (`NEXT_PUBLIC_API_URL`) and ongoing **onboarding** work; product slice is **wiring authenticated API calls and any transcript → profile/onboarding UX** where needed.
- **Next:** Decide first user-visible API integration (e.g. profile fetch from backend vs Firestore-only, or transcript upload flow in onboarding), then extend types, error handling, and `ARCH_LOG.md` / Firestore rules if new reads are added.

---

## Product vocabulary (short)

| Term | Meaning |
|------|--------|
| מסלול / track | Student’s degree track (stored on profile). |
| קטלוג / catalog | Curriculum snapshot document in Firestore; chosen after study-start year. |
| ציונים / grades | Per-course grades; pass/fail is a special sentinel in profile (see `ARCH_LOG.md`). |
| גמרים | Degree-completion framing used in product copy. |

---

## Related docs

| File | Use for |
|------|--------|
| `ARCH_LOG.md` | Stack, routes, auth gates, Firestore model, env vars, onboarding implementation notes, agent agreements. |

---

## Changelog (optional, keep tiny)

| Date | Note |
|------|------|
| 2026-04-13 | Created `PROJECT_CONTEXT.md` as high-level state; technical detail remains in `ARCH_LOG.md`. |
| 2026-04-26 | Set Now/Next from repo state: FastAPI `backend/api/`, frontend `api.ts`, onboarding — orientation slice for planning. |
| 2026-04-27 | Docs at **repo root**; **`frontend/…`** paths; **`ARCH_LOG.md`** covers **`backend/api/`**; removed **`DEVELOPMENT_HISTORY.md`** (onboarding distillate lives in **`ARCH_LOG.md`**). |
| 2026-04-28 | Onboarding UX now treats persisted grades as source-of-truth on reload (no forced re-upload when profile already has grades). |
