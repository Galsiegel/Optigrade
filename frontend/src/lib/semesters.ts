import { collection, doc, getDoc, getDocs, query, where, type Firestore } from "firebase/firestore";
import { formatHebrewStudyYearLabel, hebrewYearFromCatalogFirestoreYear } from "@/lib/hebrewYear";

export type SemesterDoc = {
  id: string;
  /** 0 winter, 1 spring, 2 summer — matches Firestore `semesters.semester`. */
  semester: number;
};

const SEASON_HEBREW = ["חורף", "אביב", "קיץ"] as const;

/**
 * Load `semesters` documents whose **`catalog`** field equals the **`catalogs` document id** (string).
 * Only semesters present in Firestore are returned (summer omitted when absent).
 */
export async function fetchSemestersForCatalog(db: Firestore, catalogId: string): Promise<SemesterDoc[]> {
  const id = catalogId.trim();
  const snap = await getDocs(query(collection(db, "semesters"), where("catalog", "==", id)));

  const rows: SemesterDoc[] = [];
  snap.forEach((d) => {
    const raw = d.data().semester;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (n === 0 || n === 1 || n === 2) {
      rows.push({ id: d.id, semester: n });
    }
  });
  rows.sort((a, b) => a.semester - b.semester);
  return rows;
}

/**
 * Hebrew labels for each `semesters.semester` value that exists in Firestore for this catalog.
 * Uses `catalogs.year` (same integer as Technion JSON `YYYY`; Hebrew = year + 3761) + `formatHebrewStudyYearLabel`.
 * Example: catalog `year` 2021 → Hebrew 5781 → semester 0 → `חורף תשפ״א`.
 */
export async function fetchSemesterLabelsByIndexForCatalog(
  db: Firestore,
  catalogId: string
): Promise<Map<number, string>> {
  const labels = new Map<number, string>();
  const id = catalogId.trim();
  const catRef = doc(db, "catalogs", id);
  const [catSnap, semSnap] = await Promise.all([
    getDoc(catRef),
    getDocs(query(collection(db, "semesters"), where("catalog", "==", id)))
  ]);

  const rawYear = catSnap.exists() ? Number(catSnap.data()?.year) : NaN;
  const hebrewYear = Number.isFinite(rawYear) ? hebrewYearFromCatalogFirestoreYear(rawYear) : null;
  const yearSuffix =
    hebrewYear != null && hebrewYear > 0 ? formatHebrewStudyYearLabel(hebrewYear) : null;

  semSnap.forEach((d) => {
    const raw = d.data().semester;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (n !== 0 && n !== 1 && n !== 2) return;
    const season = SEASON_HEBREW[n];
    const label =
      yearSuffix != null ? `${season} ${yearSuffix}` : `${season} (${String(rawYear)})`;
    labels.set(n, label);
  });

  return labels;
}
