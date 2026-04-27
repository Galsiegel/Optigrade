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
export type UserGradeWithSemester = {
  grade: string;
  semester?: string | null;
};

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
  /** Map keys: SAP-style course id (`0XXX0XXX`), see `toSapEightDigitCourseIdForStorage`. */
  grades: Record<string, string>;
  /** Runtime helper (not required in Firestore): parsed object form from `grades`. */
  gradesWithSemester?: Record<string, UserGradeWithSemester>;
  /** From transcript PDF import: English semester line per normalized course id. */
  transcriptOfferingByCourse?: Record<string, string>;
  /** From transcript: English course title fallback when Technion JSON has no match. */
  transcriptNameEnByCourse?: Record<string, string>;
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

function parseGradesByCourse(
  raw: unknown
): Record<string, UserGradeWithSemester> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, UserGradeWithSemester> = {};
  for (const [courseId, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const gradeRaw = (v as { grade?: unknown }).grade;
    if (typeof gradeRaw !== "string") continue;
    const semRaw = (v as { semester?: unknown }).semester;
    out[courseId] = {
      grade: gradeRaw,
      semester: typeof semRaw === "string" && semRaw.trim() ? semRaw.trim() : null
    };
  }
  return out;
}

function parseGradesField(
  raw: unknown
): { grades: Record<string, string>; gradesWithSemester: Record<string, UserGradeWithSemester> } {
  const grades: Record<string, string> = {};
  const gradesWithSemester: Record<string, UserGradeWithSemester> = {};
  if (!raw || typeof raw !== "object") return { grades, gradesWithSemester };
  for (const [courseId, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") {
      grades[courseId] = v;
      gradesWithSemester[courseId] = { grade: v, semester: null };
      continue;
    }
    if (!v || typeof v !== "object") continue;
    const gradeRaw = (v as { grade?: unknown }).grade;
    if (typeof gradeRaw !== "string") continue;
    const semRaw = (v as { semester?: unknown }).semester;
    grades[courseId] = gradeRaw;
    gradesWithSemester[courseId] = {
      grade: gradeRaw,
      semester: typeof semRaw === "string" && semRaw.trim() ? semRaw.trim() : null
    };
  }
  return { grades, gradesWithSemester };
}

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
    const parsedFromGrades = parseGradesField((data as { grades?: unknown }).grades);
    const legacyByField = parseGradesByCourse((data as { gradesByCourse?: unknown }).gradesByCourse);
    const gradesWithSemester =
      Object.keys(parsedFromGrades.gradesWithSemester).length > 0
        ? parsedFromGrades.gradesWithSemester
        : legacyByField ?? {};
    const grades =
      Object.keys(parsedFromGrades.grades).length > 0
        ? parsedFromGrades.grades
        : Object.fromEntries(Object.entries(gradesWithSemester).map(([k, v]) => [k, v.grade]));
    const legacyOffering =
      typeof (data as { transcriptOfferingByCourse?: unknown }).transcriptOfferingByCourse ===
        "object" &&
      (data as { transcriptOfferingByCourse?: unknown }).transcriptOfferingByCourse !== null
        ? ((data as { transcriptOfferingByCourse?: Record<string, string> })
            .transcriptOfferingByCourse as Record<string, string>)
        : undefined;
    const mergedOffering: Record<string, string> = { ...(legacyOffering ?? {}) };
    if (gradesWithSemester) {
      for (const [k, v] of Object.entries(gradesWithSemester)) {
        if (v.semester) mergedOffering[k] = v.semester;
      }
    }

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
      grades,
      gradesWithSemester,
      transcriptOfferingByCourse: Object.keys(mergedOffering).length > 0 ? mergedOffering : undefined,
      transcriptNameEnByCourse:
        typeof (data as { transcriptNameEnByCourse?: unknown }).transcriptNameEnByCourse ===
          "object" &&
        (data as { transcriptNameEnByCourse?: unknown }).transcriptNameEnByCourse !== null
          ? ((data as { transcriptNameEnByCourse?: Record<string, string> })
              .transcriptNameEnByCourse as Record<string, string>)
          : undefined,
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
    transcriptOfferingByCourse: deleteField(),
    transcriptNameEnByCourse: deleteField(),
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
  grade: string,
  semesterEn?: string | null
): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const sem = semesterEn?.trim();
  await updateDoc(userRef, {
    [`grades.${courseId}`]: { grade, semester: sem || null },
    updatedAt: serverTimestamp()
  });
}

/** Set one grade and (optionally) persist transcript semester sidecar for grouping/display. */
export async function setUserGradeWithSemester(
  db: Firestore,
  uid: string,
  courseId: string,
  grade: string,
  semesterEn: string | null
): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const sem = semesterEn?.trim();
  const patch: Record<string, unknown> = {
    [`grades.${courseId}`]: { grade, semester: sem || null },
    updatedAt: serverTimestamp()
  };
  await updateDoc(userRef, patch as Parameters<typeof updateDoc>[1]);
}

export async function deleteUserGrade(
  db: Firestore,
  uid: string,
  courseId: string
): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, {
    [`grades.${courseId}`]: deleteField(),
    [`gradesByCourse.${courseId}`]: deleteField(),
    [`transcriptOfferingByCourse.${courseId}`]: deleteField(),
    [`transcriptNameEnByCourse.${courseId}`]: deleteField(),
    updatedAt: serverTimestamp()
  });
}

/** Replace the entire grades map (e.g. before re-uploading a new sheet). */
export async function clearUserGrades(db: Firestore, uid: string): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, {
    grades: {},
    gradesByCourse: deleteField(),
    transcriptOfferingByCourse: deleteField(),
    transcriptNameEnByCourse: deleteField(),
    updatedAt: serverTimestamp()
  });
}

/** Replace grades with a full map (e.g. after parsing a transcript PDF on the API). */
export async function replaceUserGrades(
  db: Firestore,
  uid: string,
  grades: Record<string, UserGradeWithSemester>
): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const patch: Record<string, unknown> = {
    grades,
    updatedAt: serverTimestamp()
  };
  await updateDoc(userRef, patch as Parameters<typeof updateDoc>[1]);
}
