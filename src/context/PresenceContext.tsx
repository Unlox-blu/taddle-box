import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
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
export const PRESENCE_RECENT_MS = 30 * 60 * 1000;

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

  const flush = useCallback(async () => {
    const ids = [...queueRef.current];
    queueRef.current = new Set();
    if (ids.length === 0) return;
    try {
      const res = await userService.getPresenceBatch(ids);
      const data = (res as any)?.data || {};
      setMap((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          const p = data[id];
          next[id] = {
            online: !!(p && p.online),
            lastSeen: (p && p.lastSeen) || null,
            fetchedAt: Date.now(),
          };
        });
        return next;
      });
      ids.forEach((id) => failedRef.current.delete(id));
    } catch (e) {
      // Remember the misses and keep whatever we had.
      ids.forEach((id) => failedRef.current.add(id));
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

  // Periodic refresh: re-check users whose "online" entry is getting stale
  // (missed disconnect events leave a stale dot) and retry failed fetches.
  useEffect(() => {
    const tick = setInterval(() => {
      const refresh: string[] = [];
      Object.entries(mapRef.current).forEach(([id, e]) => {
        if (e.online && Date.now() - e.fetchedAt > 30000) refresh.push(id);
      });
      failedRef.current.forEach((id) => refresh.push(id));
      if (refresh.length > 0) fetchPresence(refresh);
    }, 45000);
    return () => clearInterval(tick);
  }, [fetchPresence]);

  // Live updates from the status socket (user went online / offline).
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
    socketClient.events.on('presence:changed', onPresence);
    return () => {
      socketClient.events.off('presence:changed', onPresence);
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
