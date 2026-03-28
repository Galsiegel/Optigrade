import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  deleteField,
  type Firestore
} from "firebase/firestore";
import type { User } from "firebase/auth";

export type UserRole = "admin" | "user";

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  track: string | null;
  /** Hebrew year number (e.g. 5785) when studies began — for catalog filtering. */
  startingYear: number | null;
  /** Selected `catalogs` document id. */
  catalog: string | null;
  // Key-value map: course docId -> grade string
  grades: Record<string, string>;
  onboardingCompleted: boolean;
  role: UserRole;
  createdAt: ReturnType<typeof serverTimestamp>;
  updatedAt: ReturnType<typeof serverTimestamp>;
};

export function getDisplayName(profile: UserProfile | null): string | null {
  if (!profile) return null;
  const parts = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  return parts || profile.displayName;
}

const USERS_COLLECTION = "users";

export async function getUserProfile(db: Firestore, uid: string): Promise<UserProfile | null> {
  const userDoc = await getDoc(doc(db, USERS_COLLECTION, uid));
  return userDoc.exists() ? (userDoc.data() as UserProfile) : null;
}

export async function getOrCreateUserProfile(
  db: Firestore,
  user: User,
  defaultRole: UserRole = "user"
): Promise<UserProfile> {
  const userRef = doc(db, USERS_COLLECTION, user.uid);
  const existing = await getDoc(userRef);

  if (existing.exists()) {
    const data = existing.data() as Partial<UserProfile> & { name?: string | null };
    const firstName =
      data?.firstName ??
      (data?.name ? data.name.split(" ")[0] ?? null : null);
    const lastName =
      data?.lastName ??
      (data?.name ? data.name.split(" ").slice(1).join(" ") || null : null);
    return {
      ...data,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      track: data?.track ?? null,
      startingYear: (() => {
        const raw =
          data?.startingYear ??
          (data as { studyStartHebrewYear?: unknown }).studyStartHebrewYear;
        if (typeof raw === "number" && Number.isFinite(raw)) return raw;
        if (raw != null && raw !== "") {
          const n = Number(raw);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      })(),
      catalog: (() => {
        const c = data?.catalog ?? (data as { selectedCatalogId?: unknown }).selectedCatalogId;
        return typeof c === "string" && c ? c : null;
      })(),
      grades: (data?.grades as Record<string, string> | undefined) ?? {},
      onboardingCompleted: data?.onboardingCompleted ?? false
    } as UserProfile;
  }

  const initialAdminEmails = (
    process.env.NEXT_PUBLIC_INITIAL_ADMIN_EMAILS ?? ""
  )
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const isInitialAdmin = user.email
    ? initialAdminEmails.includes(user.email.toLowerCase())
    : false;

  const profile: UserProfile = {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    firstName: null,
    lastName: null,
    track: null,
    startingYear: null,
    catalog: null,
    grades: {},
    onboardingCompleted: false,
    role: isInitialAdmin ? "admin" : defaultRole,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(userRef, profile);
  return profile;
}

export async function updateUserName(
  db: Firestore,
  uid: string,
  firstName: string,
  lastName: string
): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    updatedAt: serverTimestamp()
  });
}

export async function updateUserTrack(
  db: Firestore,
  uid: string,
  track: string
): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, {
    track,
    updatedAt: serverTimestamp()
  });
}

export async function updateUserStudyAndCatalog(
  db: Firestore,
  uid: string,
  params: { startingYear: number; catalog: string }
): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, {
    startingYear: params.startingYear,
    catalog: params.catalog,
    studyStartHebrewYear: deleteField(),
    selectedCatalogId: deleteField(),
    updatedAt: serverTimestamp()
  });
}

export async function resetOnboarding(db: Firestore, uid: string): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, {
    firstName: null,
    lastName: null,
    track: null,
    startingYear: null,
    catalog: null,
    studyStartHebrewYear: deleteField(),
    selectedCatalogId: deleteField(),
    grades: {},
    onboardingCompleted: false,
    updatedAt: serverTimestamp()
  });
}

export async function setOnboardingCompleted(
  db: Firestore,
  uid: string,
  completed: boolean
): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, {
    onboardingCompleted: completed,
    updatedAt: serverTimestamp()
  });
}

export async function setUserGrade(
  db: Firestore,
  uid: string,
  courseId: string,
  grade: string
): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, {
    [`grades.${courseId}`]: grade,
    updatedAt: serverTimestamp()
  });
}

export async function deleteUserGrade(
  db: Firestore,
  uid: string,
  courseId: string
): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, {
    [`grades.${courseId}`]: deleteField(),
    updatedAt: serverTimestamp()
  });
}

/** Replace the entire grades map (e.g. before re-uploading a new sheet). */
export async function clearUserGrades(db: Firestore, uid: string): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, {
    grades: {},
    updatedAt: serverTimestamp()
  });
}
