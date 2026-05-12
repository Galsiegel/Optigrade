import { collection, getDocs, type Firestore } from "firebase/firestore";

/** Same shape as legacy static options — `id` is the Firestore document id (stored on `users.track`). */
export type TrackRecord = {
  id: string;
  title: string;
  description: string;
};

export type TrackOption = TrackRecord;

const TRACKS_COLLECTION = "tracks";

function pickTitle(data: Record<string, unknown>, docId: string): string {
  const raw = data.title ?? data.name;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return docId;
}

function pickDescription(data: Record<string, unknown>): string {
  const raw = data.description;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "מסלול";
}

export async function fetchTrackRecords(db: Firestore): Promise<TrackRecord[]> {
  const snap = await getDocs(collection(db, TRACKS_COLLECTION));
  const rows: TrackRecord[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data() as Record<string, unknown>;
    rows.push({
      id: docSnap.id,
      title: pickTitle(d, docSnap.id),
      description: pickDescription(d)
    });
  });
  rows.sort((a, b) => a.title.localeCompare(b.title, "he"));
  return rows;
}
