## Gmarim Next.js client

This is a **client-only Next.js app** that is meant to talk to a separate backend API and use **Firebase** for authentication and data, with **Material UI** as a highly customizable design system.

### Tech stack

- **Next.js (App Router, TypeScript)**
- **React 18**
- **Material UI + Emotion**
- **Firebase (Auth + Firestore)**

### Project layout

- `src/app` – Next.js routes (`layout.tsx`, `page.tsx`, etc.)
- `src/theme` – theming primitives (`theme.ts`, `ThemeRegistry.tsx`)
- `src/firebase` – Firebase client initialization (`config.ts`)

### Customizing the theme

- Edit `src/theme/theme.ts` to change:
  - color palettes (`lightPalette`, `darkPalette`)
  - global typography
  - component defaults/overrides

You can add more tokens (e.g. spacing, radius, shadows) and wire them into the MUI `createTheme` call.

### Firebase configuration

Create a `.env.local` file in the project root with:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

Then import from `src/firebase/config.ts` wherever you need `firebaseAuth` or `firebaseDb`.

### Running the app

```bash
npm install        # already run once in this template
npm run dev        # start dev server on http://localhost:3000
```

