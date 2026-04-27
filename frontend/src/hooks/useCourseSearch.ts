import { useCallback, useEffect, useRef, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { searchCourses, type CourseListItem } from "@/lib/courses";
import { filterCourseListInMemory } from "@/lib/technionUgCourses";

export type CourseSearchDataSource =
  | { type: "firestore" }
  | { type: "memory"; items: CourseListItem[]; loading: boolean };

export type UseCourseSearchOptions = {
  db: Firestore | undefined | null;
  /** Raw search string (whitespace trimmed inside the hook for min-length check). */
  searchTerm: string;
  /** When false, clears results and stops work (e.g. popover closed or course already picked). */
  enabled: boolean;
  /** Firestore `courses` search vs merged Technion JSON in memory. */
  dataSource?: CourseSearchDataSource;
  debounceMs?: number;
  minChars?: number;
  maxResults?: number;
};

export function useCourseSearch({
  db,
  searchTerm,
  enabled,
  dataSource = { type: "firestore" },
  debounceMs = 350,
  minChars = 2,
  maxResults = 8
}: UseCourseSearchOptions) {
  const [results, setResults] = useState<CourseListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memoryItemsRef = useRef<CourseListItem[] | null>(null);
  const memoryPrefixCacheRef = useRef<Map<string, CourseListItem[]>>(new Map());

  const dismissSuggestions = useCallback(() => {
    setResults([]);
    setError(null);
    memoryPrefixCacheRef.current.clear();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setResults([]);
      setError(null);
      setSearching(false);
      return;
    }

    const term = searchTerm.trim();
    if (term.length < minChars) {
      setResults([]);
      setError(null);
      setSearching(false);
      return;
    }

    if (dataSource.type === "memory") {
      if (memoryItemsRef.current !== dataSource.items) {
        memoryItemsRef.current = dataSource.items;
        memoryPrefixCacheRef.current.clear();
      }

      if (dataSource.loading) {
        setSearching(true);
        setResults([]);
        setError(null);
        return () => {
          setSearching(false);
        };
      }

      let cancelled = false;
      const t = window.setTimeout(() => {
        setSearching(true);
        setError(null);
        try {
          const cache = memoryPrefixCacheRef.current;
          const termKey = term.toLowerCase();

          let items = cache.get(termKey);
          if (!items) {
            let seed = dataSource.items;
            let bestPrefix = "";
            for (const k of cache.keys()) {
              if (termKey.startsWith(k) && k.length > bestPrefix.length) {
                bestPrefix = k;
              }
            }
            if (bestPrefix) {
              seed = cache.get(bestPrefix) ?? seed;
            }
            items = filterCourseListInMemory(seed, term, maxResults);
            cache.set(termKey, items);
          }
          if (!cancelled) {
            setResults(items);
            setError(null);
          }
        } finally {
          if (!cancelled) setSearching(false);
        }
      }, debounceMs);

      return () => {
        cancelled = true;
        window.clearTimeout(t);
        setSearching(false);
      };
    }

    if (!db) {
      setResults([]);
      setError(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const { items, error: err } = await searchCourses(db, term, { maxResults });
        if (cancelled) return;
        setResults(items);
        setError(err);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      setSearching(false);
    };
  }, [dataSource, db, debounceMs, enabled, maxResults, minChars, searchTerm]);

  return { results, searching, error, dismissSuggestions };
}
