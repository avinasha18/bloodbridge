import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetch async data on mount. Safe under React StrictMode (dev double-mount).
 * Poll refreshes pass background=true so existing data stays visible.
 */
export function useAsync(asyncFn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const asyncRef = useRef(asyncFn);
  asyncRef.current = asyncFn;

  const run = useCallback(async (opts = {}) => {
    const background = opts.background === true;
    if (!background) setLoading(true);
    setError(null);
    try {
      const result = await asyncRef.current();
      setData(result);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    asyncRef
      .current()
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((e) => {
        if (alive) setError(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(
    (background = true) => run({ background }),
    [run],
  );

  return { data, error, loading, refresh };
}

export function usePoll(asyncFn, intervalMs = 10_000, deps = []) {
  const state = useAsync(asyncFn, deps);
  useEffect(() => {
    const id = setInterval(() => state.refresh(true), intervalMs);
    return () => clearInterval(id);
  }, [state.refresh, intervalMs]);
  return state;
}
