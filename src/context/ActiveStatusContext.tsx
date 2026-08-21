import React, { createContext, useContext, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { activeStatusService } from '../services/activeStatus.service';
import { socketClient } from '../services/socketClient';
import type {
  ActiveStatusChangedPayload,
  ActiveStatusSnapshotPayload,
} from '../types';

export interface ActiveStatusEntry {
  online: boolean;
  lastSeen: string | null;
  fetchedAt: number;
}

type ActiveStatusMap = Record<string, ActiveStatusEntry>;

interface ActiveStatusContextValue {
  map: ActiveStatusMap;
  fetchActiveStatus: (ids: string[]) => void;
}

const ActiveStatusContext = createContext<ActiveStatusContextValue>({
  map: {},
  fetchActiveStatus: () => {},
});

// How recent a lastSeen must be to show the "recently active" clock indicator.
export const ACTIVE_STATUS_RECENT_MS = 24 * 60 * 60 * 1000;

// Maximum entries to keep in the active status map. Prevents unbounded growth
// when the user follows many people. Oldest entries (by fetchedAt) are evicted.
const MAX_STATUS_ENTRIES = 500;

/** Evicts oldest entries when map exceeds MAX_STATUS_ENTRIES. */
function evictOldEntries(map: ActiveStatusMap): ActiveStatusMap {
  const keys = Object.keys(map);
  if (keys.length <= MAX_STATUS_ENTRIES) return map;
  // Sort by fetchedAt ascending (oldest first) and remove extras
  const sorted = keys.sort((a, b) => (map[a].fetchedAt || 0) - (map[b].fetchedAt || 0));
  const toRemove = sorted.slice(0, keys.length - MAX_STATUS_ENTRIES);
  const next = { ...map };
  toRemove.forEach((k) => delete next[k]);
  return next;
}

export function ActiveStatusProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<ActiveStatusMap>({});
  const queueRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<any>(null);
  // Ids that failed to resolve once (offline etc.) — retried on the next
  // on-demand request.
  const failedRef = useRef<Set<string>>(new Set());
  // Mirror of the map so the flush can read it without re-subscribing.
  const mapRef = useRef<ActiveStatusMap>({});
  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  // How old an entry may be before the API is asked again. Active-status dots
  // remount constantly (feed scroll, tab switches) — re-requesting every mount
  // is what hammered the backend. Entries fresher than this are served from
  // the cache; socket events keep them current in between.
  const FRESH_MS = 60 * 1000;
  // Server caps an active-status batch at 50 ids — keep the request within that.
  const BATCH_MAX = 50;

  const flush = useCallback(async () => {
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
      const res = await activeStatusService.getBatch(needed.slice(0, BATCH_MAX));
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
        return evictOldEntries(next);
      });
      needed.slice(0, BATCH_MAX).forEach((id) => failedRef.current.delete(id));
    } catch (e) {
      // Remember the misses and keep whatever we had.
      needed.slice(0, BATCH_MAX).forEach((id) => failedRef.current.add(id));
    }
  }, []);

  const fetchActiveStatus = useCallback(
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

  // Live updates from the status socket (user went online / offline), plus the
  // connect-time snapshot of the most recently followed users' active status —
  // pushed over the socket to reduce REST backfill. The snapshot is capped at
  // 200 entries (clients with 1k+ follows fall back to the on-demand API for
  // the rest, which the freshness window keeps cheap). This is the SAME push
  // model Insta/FB use — the REST batch is only an on-demand backfill for ids
  // the socket never covered; there is no periodic polling.
  useEffect(() => {
    const onActiveStatusChanged = (data: ActiveStatusChangedPayload) => {
      const { userId, online, lastSeen } = data || {};
      if (!userId) return;
      setMap((prev) => evictOldEntries({
        ...prev,
        [userId]: {
          online: !!online,
          lastSeen: lastSeen || null,
          fetchedAt: Date.now(),
        },
      }));
    };
    const onSnapshot = (data: ActiveStatusSnapshotPayload) => {
      if (!data || typeof data !== 'object') return;
      const now = Date.now();
      setMap((prev) => {
        const next = { ...prev };
        Object.entries(data).forEach(([userId, p]) => {
          if (!userId || !p) return;
          next[userId] = {
            online: !!p.online,
            lastSeen: p.lastSeen || null,
            fetchedAt: now,
          };
        });
        return evictOldEntries(next);
      });
    };
    socketClient.events.on('activeStatus:changed', onActiveStatusChanged);
    socketClient.events.on('activeStatus:snapshot', onSnapshot);
    return () => {
      socketClient.events.off('activeStatus:changed', onActiveStatusChanged);
      socketClient.events.off('activeStatus:snapshot', onSnapshot);
    };
  }, []);

  return (
    <ActiveStatusContext.Provider value={useMemo(() => ({ map, fetchActiveStatus }), [map, fetchActiveStatus])}>
      {children}
    </ActiveStatusContext.Provider>
  );
}

export type ActiveStatus = { online: boolean; lastSeen: string | null } | undefined;

/**
 * Subscribes to a user's active status. Registers the id once per mount so the
 * provider batches the API request; live socket events keep it fresh.
 */
export function useActiveStatus(userId?: string): ActiveStatus {
  const { map, fetchActiveStatus } = useContext(ActiveStatusContext);
  const requestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    if (requestedRef.current.has(userId)) return;
    requestedRef.current.add(userId);
    fetchActiveStatus([userId]);
  }, [userId, fetchActiveStatus]);

  const entry = userId ? map[userId] : undefined;
  if (!entry) return undefined;
  return { online: entry.online, lastSeen: entry.lastSeen };
}

/** Derived indicator: 'online' → purple dot, 'recent' → clock, null → nothing. */
export function activeStatusIndicator(p: ActiveStatus): 'online' | 'recent' | null {
  if (!p) return null;
  if (p.online) return 'online';
  if (!p.lastSeen) return null;
  const age = Date.now() - new Date(p.lastSeen).getTime();
  if (Number.isFinite(age) && age >= 0 && age < ACTIVE_STATUS_RECENT_MS) return 'recent';
  return null;
}

/** Human text for the profile page, e.g. "Active now" / "Active 12m ago". */
export function activeStatusLabel(p: ActiveStatus): string | null {
  if (!p) return null;
  if (p.online) return 'Active now';
  if (!p.lastSeen) return null;
  const ageMs = Date.now() - new Date(p.lastSeen).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs >= ACTIVE_STATUS_RECENT_MS) return null;
  const mins = Math.max(1, Math.floor(ageMs / 60000));
  if (mins < 60) return `Active ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `Active ${hrs}h ago`;
}
