import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

interface UseRefreshOnFocusOptions {
  /** The refetch to run when the screen regains focus. */
  refetch: () => unknown;
  /**
   * Restores the list's scroll position after the refetch starts (the list
   * remounts/shifts as data lands). Called ~80ms after the refetch fires.
   */
  restoreScroll?: () => void;
  /** Debounce window — a blur inside it cancels the pending refetch. */
  delayMs?: number;
}

/**
 * Refresh a screen's data whenever it regains focus, debounced.
 *
 * Consolidates the duplicated focus logic across the tab screens (Events,
 * Communities, Games): a blur during the debounce window cancels the pending
 * refetch, so rapid tab switching doesn't fire one API call per hop. The
 * scroll position is restored after the refetch instead of resetting to the
 * top.
 *
 * Screens that need different behavior on the FIRST focus (e.g. Games loads
 * fresh data on mount, then only refreshes on re-focus) gate that inside
 * their `refetch` callback with a hasLoaded ref.
 *
 * IMPORTANT: `refetch` and `restoreScroll` are held in latest-refs — the
 * focus effect runs ONCE per focus and never re-runs when their identities
 * change. (An earlier version put them in the effect deps; screens passing
 * inline arrows re-rendered after each refetch, which re-armed the effect
 * and caused an infinite refetch loop while focused.)
 */
export function useRefreshOnFocus({
  refetch,
  restoreScroll,
  delayMs = 300,
}: UseRefreshOnFocusOptions) {
  // Latest-ref pattern: always call the newest callbacks without making the
  // focus effect depend on them.
  const refetchRef = useRef(refetch);
  const restoreScrollRef = useRef(restoreScroll);
  useEffect(() => {
    refetchRef.current = refetch;
    restoreScrollRef.current = restoreScroll;
  });

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => {
        refetchRef.current();
        if (restoreScrollRef.current) {
          setTimeout(() => restoreScrollRef.current?.(), 80);
        }
      }, delayMs);
      return () => clearTimeout(t);
    }, [delayMs]),
  );
}
