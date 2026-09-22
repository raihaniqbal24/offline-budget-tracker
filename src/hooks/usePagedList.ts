import { useCallback, useEffect, useRef, useState } from "react";

/** Append `incoming` to `existing`, skipping any item whose key is already there. */
export function mergeUnique<T>(
  existing: T[],
  incoming: T[],
  keyOf: (item: T) => string,
): T[] {
  const seen = new Set(existing.map(keyOf));
  const out = existing.slice();
  for (const item of incoming) {
    const key = keyOf(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

interface Options<T> {
  /** Fetch `limit` items starting at `offset`, newest first. */
  fetchPage: (limit: number, offset: number) => Promise<T[]>;
  keyOf: (item: T) => string;
  /** Changes when the filters change: start again from the first page. */
  resetKey: string;
  /** Changes after any write: reload what is already on screen. */
  refreshKey: number;
  pageSize?: number;
}

/**
 * Offset-paged list with protection against overlapping requests.
 *
 * Every (re)load starts a new generation. A "load more" that finishes after
 * a newer load has started is thrown away, "load more" is refused until the
 * current load has landed, and appends skip anything already shown. Together
 * these rule out the same record appearing twice ("two children with the
 * same key"), which happened when a short list asked for more before its
 * first page arrived.
 */
export function usePagedList<T>({
  fetchPage,
  keyOf,
  resetKey,
  refreshKey,
  pageSize = 100,
}: Options<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const generation = useRef(0);
  const loaded = useRef(0);
  const busy = useRef(false);
  const lastResetKey = useRef<string | null>(null);

  // Always call the latest fetch and key functions without re-running effects.
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const keyRef = useRef(keyOf);
  keyRef.current = keyOf;

  useEffect(() => {
    const gen = ++generation.current;
    busy.current = false; // any in-flight "load more" belongs to an older generation
    if (lastResetKey.current !== resetKey) {
      lastResetKey.current = resetKey;
      loaded.current = 0;
    }
    setHasMore(false); // no paging until this load lands
    const limit = Math.max(pageSize, loaded.current);

    fetchRef.current(limit, 0).then(
      (rows) => {
        if (gen !== generation.current) return;
        loaded.current = rows.length;
        setItems(mergeUnique([], rows, keyRef.current));
        setHasMore(rows.length === limit);
        setLoading(false);
      },
      () => {
        if (gen === generation.current) setLoading(false);
      },
    );
  }, [resetKey, refreshKey, pageSize]);

  const loadMore = useCallback(async () => {
    if (!hasMore || busy.current) return;
    const gen = generation.current;
    busy.current = true;
    try {
      const rows = await fetchRef.current(pageSize, loaded.current);
      if (gen !== generation.current) return; // filters or data changed meanwhile
      loaded.current += rows.length;
      setItems((prev) => mergeUnique(prev, rows, keyRef.current));
      setHasMore(rows.length === pageSize);
    } finally {
      if (gen === generation.current) busy.current = false;
    }
  }, [hasMore, pageSize]);

  return { items, loading, hasMore, loadMore };
}
