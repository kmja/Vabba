import { useEffect, useState } from "react";

/**
 * State backed by localStorage, scoped to one key.
 *
 * SSR-safe: starts from `initialValue` on both the server and the first client
 * render, then hydrates from storage on mount — so there is no hydration
 * mismatch. Reads/writes are best-effort and swallow storage errors (private
 * mode, quota, disabled storage). Everything stays on the device.
 *
 * Bump the key suffix (e.g. ".v2") if the stored shape changes incompatibly.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [loaded, setLoaded] = useState(false);

  // Hydrate once on mount.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydrate from localStorage on mount */
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // ignore unreadable/corrupt storage
    }
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [key]);

  // Persist on change, but only after the initial hydrate so we never overwrite
  // stored data with the default value on first paint.
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota/unavailable storage
    }
  }, [key, value, loaded]);

  return [value, setValue] as const;
}
