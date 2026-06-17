'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Like useState, but persists the value to sessionStorage under `key`, so it
 * survives navigating away and pressing browser-back (the component remounts
 * and rehydrates). Used to keep list filters / page / sort "where I left off".
 *
 * sessionStorage (not localStorage) is intentional: the memory lasts for the
 * tab session and resets on a fresh visit, which matches "continue where I was"
 * without permanently pinning a filter.
 */
export function usePersistentState<T>(
  key: string,
  initial: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  // Skip writing on the very first render (we just read it); only persist
  // subsequent changes.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    try {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* quota / disabled storage — ignore, fall back to in-memory state */
    }
  }, [key, state]);

  return [state, setState];
}
