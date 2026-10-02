import { useEffect, useRef, useState } from 'react';

// Loads app data files from /data/. Responses are memoized in memory for this visit; on the web the
// service worker also keeps them in the Cache Storage for offline use. No user data is involved.

const memory = new Map<string, Promise<unknown>>();
const resolved = new Map<string, unknown>();
const MAX_ENTRIES = 400;

/** Base URL for data files. Native builds will point this at the hosted site. */
export const DATA_BASE = '/data/';

export class DataError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function loadData<T>(path: string): Promise<T> {
  const cached = memory.get(path);
  if (cached) {
    // Refresh recency.
    memory.delete(path);
    memory.set(path, cached);
    return cached as Promise<T>;
  }
  const promise = fetch(DATA_BASE + path).then(async (res) => {
    if (!res.ok) throw new DataError(`Failed to load ${path}`, res.status);
    const data = (await res.json()) as T;
    resolved.set(path, data);
    return data;
  });
  promise.catch(() => memory.delete(path));
  memory.set(path, promise);
  if (memory.size > MAX_ENTRIES) {
    const oldest = memory.keys().next().value!;
    memory.delete(oldest);
    resolved.delete(oldest);
  }
  return promise;
}

/** Returns the data synchronously when it has already been loaded this visit. */
export function peekData<T>(path: string): T | undefined {
  return resolved.get(path) as T | undefined;
}

/** Starts loading a file without waiting (e.g., the next chapter). */
export function prefetchData(path: string) {
  loadData(path).catch(() => {});
}

export type DataState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'ready'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: Error };

/** React hook: loads a data file; pass null to skip. `reload` retries after an error. */
export function useData<T>(path: string | null): DataState<T> & { reload: () => void } {
  const [state, setState] = useState<{ path: string | null; value: DataState<T> }>({
    path,
    value: { status: 'loading' },
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    loadData<T>(path).then(
      (data) => alive && setState({ path, value: { status: 'ready', data } }),
      (error: Error) => alive && setState({ path, value: { status: 'error', error } }),
    );
    return () => {
      alive = false;
    };
  }, [path, attempt]);

  const known = path ? peekData<T>(path) : undefined;
  const value: DataState<T> =
    state.path === path && state.value.status !== 'loading'
      ? state.value
      : known !== undefined
        ? { status: 'ready', data: known }
        : { status: 'loading' };
  return { ...value, reload: () => setAttempt((n) => n + 1) };
}

/** Runs an async loader keyed by `key` (null skips). The loader must depend only on the key. */
export function useLoad<T>(key: string | null, loader: () => Promise<T>): DataState<T> {
  const [state, setState] = useState<{ key: string | null; value: DataState<T> }>({ key, value: { status: 'loading' } });
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    loaderRef.current().then(
      (data) => alive && setState({ key, value: { status: 'ready', data } }),
      (error: Error) => alive && setState({ key, value: { status: 'error', error } }),
    );
    return () => {
      alive = false;
    };
  }, [key]);
  return state.key === key ? state.value : { status: 'loading' };
}
