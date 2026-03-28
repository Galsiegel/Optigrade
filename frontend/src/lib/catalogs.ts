import { collection, getDocs, type Firestore } from "firebase/firestore";

export type CatalogRecord = {
  id: string;
  hebYear: string;
  year: number;
};

const CATALOGS_COLLECTION = "catalogs";

export async function fetchCatalogRecords(db: Firestore): Promise<CatalogRecord[]> {
  const snap = await getDocs(collection(db, CATALOGS_COLLECTION));
  const rows: CatalogRecord[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    const rawYear = d.year;
    const year =
      typeof rawYear === "number"
        ? rawYear
        : typeof rawYear === "string"
          ? Number(rawYear)
          : Number(rawYear);
    const hebYear =
      d.hebYear != null && d.hebYear !== ""
        ? String(d.hebYear).trim()
        : "";
    if (!hebYear || !Number.isFinite(year)) return;
    rows.push({ id: docSnap.id, hebYear, year });
  });
  rows.sort((a, b) => a.year - b.year || a.hebYear.localeCompare(b.hebYear, "he"));
  return rows;
}

/** Catalogs whose Firestore `year` is >= the user’s start year (same convention as Hebrew − 3760). */
export function filterCatalogsFromStudyStart(
  catalogs: CatalogRecord[],
  startingHebrewYear: number
): CatalogRecord[] {
  const minYear = startingHebrewYear - 3760;
  return catalogs.filter((c) => c.year >= minYear);
}
