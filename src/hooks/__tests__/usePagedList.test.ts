import { act, renderHook } from "@testing-library/react-native";
import { mergeUnique, usePagedList } from "../usePagedList";

type Row = { id: number };
const keyOf = (r: Row) => String(r.id);

/** A fetch whose calls resolve only when the test says so, in any order. */
function controllableFetch(data: Row[]) {
  const pending: { resolve: () => void; limit: number; offset: number }[] = [];
  const fetchPage = (limit: number, offset: number) =>
    new Promise<Row[]>((resolve) => {
      pending.push({
        limit,
        offset,
        resolve: () => resolve(data.slice(offset, offset + limit)),
      });
    });
  return { fetchPage, pending };
}

const rows = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => ({ id: from + i }));

describe("mergeUnique", () => {
  it("skips items already present", () => {
    expect(
      mergeUnique([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }], keyOf),
    ).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });
});

describe("usePagedList", () => {
  it("ignores 'load more' before the first page lands (the duplicate-key bug)", async () => {
    const { fetchPage, pending } = controllableFetch(rows(2));
    const { result } = await renderHook(() =>
      usePagedList({
        fetchPage,
        keyOf,
        resetKey: "a",
        refreshKey: 0,
        pageSize: 100,
      }),
    );

    await act(async () => {
      await result.current.loadMore(); // a short list asks for more straight away
    });
    expect(pending).toHaveLength(1); // refused: only the first load is in flight

    await act(async () => pending[0].resolve());
    expect(result.current.items.map((r) => r.id)).toEqual([1, 2]);
  });

  it("drops a 'load more' that finishes after the filters changed", async () => {
    const data = rows(5);
    const { fetchPage, pending } = controllableFetch(data);
    let resetKey = "a";
    const { result, rerender } = await renderHook(() =>
      usePagedList({ fetchPage, keyOf, resetKey, refreshKey: 0, pageSize: 2 }),
    );

    await act(async () => pending[0].resolve()); // first page: 1, 2
    let more: Promise<void>;
    await act(async () => {
      more = result.current.loadMore(); // asks for 3, 4 ...
    });

    resetKey = "b"; // ... but the filters change first
    await rerender({});
    await act(async () => pending[2].resolve()); // new first page lands: 1, 2
    await act(async () => {
      pending[1].resolve(); // the old "load more" lands last
      await more!;
    });

    expect(result.current.items.map((r) => r.id)).toEqual([1, 2]);
  });

  it("pages normally and never repeats an item when data shifts between pages", async () => {
    const data = rows(5);
    const { fetchPage, pending } = controllableFetch(data);
    const { result } = await renderHook(() =>
      usePagedList({
        fetchPage,
        keyOf,
        resetKey: "a",
        refreshKey: 0,
        pageSize: 2,
      }),
    );

    await act(async () => pending[0].resolve());
    expect(result.current.hasMore).toBe(true);

    data.unshift({ id: 99 }); // a new record arrives at the top: offsets shift by one
    await act(async () => {
      const p = result.current.loadMore();
      pending[1].resolve(); // returns 2, 3 -- item 2 again
      await p;
    });
    expect(result.current.items.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("reloads what is on screen after a write without resetting the page count", async () => {
    const { fetchPage, pending } = controllableFetch(rows(5));
    let refreshKey = 0;
    const { result, rerender } = await renderHook(() =>
      usePagedList({
        fetchPage,
        keyOf,
        resetKey: "a",
        refreshKey,
        pageSize: 2,
      }),
    );
    await act(async () => pending[0].resolve());
    await act(async () => {
      const p = result.current.loadMore();
      pending[1].resolve();
      await p;
    });
    expect(result.current.items).toHaveLength(4);

    refreshKey = 1;
    await rerender({});
    expect(pending[2]).toMatchObject({ limit: 4, offset: 0 }); // keeps the 4 already shown
    await act(async () => pending[2].resolve());
    expect(result.current.items.map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });
});
