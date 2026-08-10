import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { userService } from '../services/user.service';
import { socketClient } from '../services/socketClient';

export interface PresenceEntry {
  online: boolean;
  lastSeen: string | null;
  fetchedAt: number;
}

type PresenceMap = Record<string, PresenceEntry>;

interface PresenceContextValue {
  map: PresenceMap;
  fetchPresence: (ids: string[]) => void;
}

const PresenceContext = createContext<PresenceContextValue>({
  map: {},
  fetchPresence: () => {},
});

// How recent a lastSeen must be to show the "recently active" clock indicator.
export const PRESENCE_RECENT_MS = 24 * 60 * 60 * 1000;

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<PresenceMap>({});
  const queueRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<any>(null);
  // Ids that failed to resolve once (offline etc.) — retried on the periodic tick.
  const failedRef = useRef<Set<string>>(new Set());
  // Mirror of the map so the interval can read it without re-subscribing.
  const mapRef = useRef<PresenceMap>({});
  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  // How old an entry may be before the API is asked again. Presence dots
  // remount constantly (feed scroll, tab switches) — re-requesting every mount
  // is what hammered the backend. Entries fresher than this are served from
  // the cache; socket events keep them current in between, and the staleness
  // tick below force-refreshes anything that outlives FRESH_MS + its own gap.
  const FRESH_MS = 60 * 1000;
  // Interval only re-checks online entries older than this (missed disconnect
  // events leave a stale dot) — with a 45s tick that's a refresh every ~90-135s.
  const STALE_MS = 90 * 1000;
  // Server caps a presence batch at 50 ids — keep the request within that.
  const BATCH_MAX = 50;

  const flush = useCallback(async () => {
    // Don't hit the API while backgrounded — leave the queue intact so the
    // foreground catch-up (which re-queues and flushes) picks these up.
    if (!isForegroundRef.current) return;
    const ids = [...queueRef.current];
    queueRef.current = new Set();
    if (ids.length === 0) return;
    // Skip ids we resolved recently — their cached value is still fresh, so a
    // remount within the window is a no-op instead of an API call.
    const now = Date.now();
    const needed = ids.filter((id) => {
      const entry = mapRef.current[id];
      return !entry || now - entry.fetchedAt > FRESH_MS || failedRef.current.has(id);
    });
    if (needed.length === 0) return;
    try {
      const res = await userService.getPresenceBatch(needed.slice(0, BATCH_MAX));
      const data = (res as any)?.data || {};
      setMap((prev) => {
        const next = { ...prev };
        needed.slice(0, BATCH_MAX).forEach((id) => {
          const p = data[id];
          next[id] = {
            online: !!(p && p.online),
            lastSeen: (p && p.lastSeen) || null,
            fetchedAt: Date.now(),
          };
        });
        return next;
      });
      needed.slice(0, BATCH_MAX).forEach((id) => failedRef.current.delete(id));
    } catch (e) {
      // Remember the misses and keep whatever we had.
      needed.slice(0, BATCH_MAX).forEach((id) => failedRef.current.add(id));
    }
  }, []);

  const fetchPresence = useCallback(
    (ids: string[]) => {
      ids.forEach((id) => queueRef.current.add(id));
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          flush();
        }, 350);
      }
    },
    [flush],
  );

  // ── Foreground / background ──────────────────────────────────────────────
  // Stop polling when the app is backgrounded (no need to keep stale checks
  // running while the user can't see the dots). On foreground, re-sync stale
  // entries immediately so the dots catch up on any missed socket events.
  const intervalRef = useRef<any>(null);
  const isForegroundRef = useRef(true);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const refresh: string[] = [];
      Object.entries(mapRef.current).forEach(([id, e]) => {
        if (e.online && Date.now() - e.fetchedAt > STALE_MS) refresh.push(id);
      });
      failedRef.current.forEach((id) => refresh.push(id));
      if (refresh.length > 0) fetchPresence(refresh);
    }, 45000);
  }, [fetchPresence]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    startInterval();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        isForegroundRef.current = true;
        // Catch up on stale entries that the socket might have missed while
        // backgrounded.
        const stale: string[] = [];
        Object.entries(mapRef.current).forEach(([id, e]) => {
          if (e.online && Date.now() - e.fetchedAt > STALE_MS) stale.push(id);
        });
        failedRef.current.forEach((id) => stale.push(id));
        if (stale.length > 0) fetchPresence(stale);
        startInterval();
      } else {
        isForegroundRef.current = false;
        stopInterval();
      }
    });
    return () => {
      stopInterval();
      sub.remove();
    };
  }, [startInterval, stopInterval, fetchPresence]);

  // Live updates from the status socket (user went online / offline), plus the
  // connect-time snapshot of the most recently followed users' presence —
  // pushed over the socket to reduce REST backfill. The snapshot is capped at
  // 200 entries (clients with 1k+ follows fall back to the on-demand API for
  // the rest, which the freshness window keeps cheap).
  useEffect(() => {
    const onPresence = (data: any) => {
      const { userId, online, lastSeen } = data || {};
      if (!userId) return;
      setMap((prev) => ({
        ...prev,
        [userId]: {
          online: !!online,
          lastSeen: lastSeen || null,
          fetchedAt: Date.now(),
        },
      }));
    };
    const onSnapshot = (data: any) => {
      if (!data || typeof data !== 'object') return;
      const now = Date.now();
      setMap((prev) => {
        const next = { ...prev };
        Object.entries(data).forEach(([userId, p]: [string, any]) => {
          if (!userId || !p) return;
          next[userId] = {
            online: !!p.online,
            lastSeen: p.lastSeen || null,
            fetchedAt: now,
          };
        });
        return next;
      });
    };
    socketClient.events.on('presence:changed', onPresence);
    socketClient.events.on('presence:snapshot', onSnapshot);
    return () => {
      socketClient.events.off('presence:changed', onPresence);
      socketClient.events.off('presence:snapshot', onSnapshot);
    };
  }, []);

  return (
    <PresenceContext.Provider value={{ map, fetchPresence }}>
      {children}
    </PresenceContext.Provider>
  );
}

export type PresenceStatus = { online: boolean; lastSeen: string | null } | undefined;

/**
 * Subscribes to a user's presence. Registers the id once per mount so the
 * provider batches the API request; live socket events keep it fresh.
 */
export function usePresence(userId?: string): PresenceStatus {
  const { map, fetchPresence } = useContext(PresenceContext);
  const requestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    if (requestedRef.current.has(userId)) return;
    requestedRef.current.add(userId);
    fetchPresence([userId]);
  }, [userId, fetchPresence]);

  const entry = userId ? map[userId] : undefined;
  if (!entry) return undefined;
  return { online: entry.online, lastSeen: entry.lastSeen };
}

/** Derived indicator: 'online' → purple dot, 'recent' → clock, null → nothing. */
export function presenceIndicator(p: PresenceStatus): 'online' | 'recent' | null {
  if (!p) return null;
  if (p.online) return 'online';
  if (!p.lastSeen) return null;
  const age = Date.now() - new Date(p.lastSeen).getTime();
  if (Number.isFinite(age) && age >= 0 && age < PRESENCE_RECENT_MS) return 'recent';
  return null;
}

/** Human text for the profile page, e.g. "Active now" / "Active 12m ago". */
export function presenceLabel(p: PresenceStatus): string | null {
  if (!p) return null;
  if (p.online) return 'Active now';
  if (!p.lastSeen) return null;
  const ageMs = Date.now() - new Date(p.lastSeen).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs >= PRESENCE_RECENT_MS) return null;
  const mins = Math.max(1, Math.floor(ageMs / 60000));
  if (mins < 60) return `Active ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `Active ${hrs}h ago`;
}
