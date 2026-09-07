/**
 * Payload of the socket `xp:updated` event — the single live XP source.
 * `xp` is the spendable balance; `totalXpEarned` is the cumulative lifetime
 * earned (drives level/rank). Spending XP (streak restore, redemption) moves
 * only `xp`, never `totalXpEarned`, so progress can't go backward.
 */
export interface XPUpdatedPayload {
  xp: number;
  totalXpEarned?: number;
}

/** Socket `wallet:updated` — cash wallet balance change (amounts in paise). */
export interface WalletUpdatedPayload {
  balanceCents: number;
  heldBalanceCents?: number;
}

/** Socket `leaderboards:changed` — signal that weekly rankings changed.
 *  Rankings are server-computed; the payload is just the trigger. */
export interface LeaderboardsChangedPayload {
  reason?: string;
}

/** Socket `activeStatus:changed` — a single user's online/offline transition. */
export interface ActiveStatusChangedPayload {
  userId: string;
  online: boolean;
  lastSeen: string | null;
}

/** Socket `activeStatus:snapshot` — follow-list status pushed on connect.
 *  Null = not resolvable / not authorized. */
export type ActiveStatusSnapshotPayload = Record<
  string,
  { online: boolean; lastSeen: string | null } | null
>;

/** Socket `notification:new` — a freshly created notification. */
export interface NotificationNewPayload {
  id?: string;
  senderId?: string | null;
  recipientId?: string | number;
  type?: string;
  title?: string;
  message?: string;
  resourceType?: string | null;
  resourceId?: string | null;
  meta?: Record<string, any> | null;
  isRead?: boolean;
  createdAt?: string;
  /** Emitter-attached extras (GAME_INVITE payloads, MATCH_RESOLVED results…). */
  payload?: Record<string, any> | null;
  actor?: string;
  avatarUrl?: string | null;
}

/** Socket `follow:requestCancelled` / `follow:requestResolved`. */
export interface FollowRequestCancelledPayload {
  followerId: string;
}
export interface FollowRequestResolvedPayload {
  followerId: string;
}

/** Socket `follow:stateChanged` — mutual-follow state flip. */
export interface FollowStateChangedPayload {
  otherUserId: string;
  isFollowing: boolean;
}

/** Socket `SESSION_EXPIRED` — a live match session ended (kick/expiry). */
export interface SessionExpiredPayload {
  matchId: string;
}

/** Socket matchmaking events (matched / lobbyUpdated / timedOut). The lobby
 *  DTO is loose, so this pins the fields the app reads while staying open to
 *  server additions. */
export interface MatchmakingEventPayload {
  lobbyId?: string;
  id?: string;
  status?: string;
  maxPlayers?: number;
  currentPlayers?: number;
  players?: any[];
  ticket?: {
    status?: string;
    lobbyId?: string;
    [key: string]: any;
  } | null;
  matchMetadata?: {
    matchGroupId?: string;
    lobbyId?: string;
    [key: string]: any;
  } | null;
  settings?: {
    inviteCode?: string;
    targetPlayers?: number;
    pendingInvites?: Array<{ userId: string }>;
    [key: string]: any;
  };
  lobbyState?: {
    players?: any[];
    maxPlayers?: number;
    [key: string]: any;
  };
  expiresAt?: string;
  [key: string]: any;
}

/**
 * Registry of every event bridged through `accountSocket.events`. Each key is a
 * socket event name; each value is its listener signature. Feeding this to
 * `SimpleEventEmitter` types `.on/.off/.emit` per event name — no more
 * string-keyed `Function` maps with untyped payloads.
 */
export type SocketEventMap = {
  'xp:updated': (payload: XPUpdatedPayload) => void;
  'wallet:updated': (payload: WalletUpdatedPayload) => void;
  'leaderboards:changed': (payload: LeaderboardsChangedPayload) => void;
  'matchmaking:matched': (payload: MatchmakingEventPayload) => void;
  'matchmaking:lobbyUpdated': (payload: MatchmakingEventPayload) => void;
  'matchmaking:timedOut': (payload: MatchmakingEventPayload) => void;
  'notification:new': (payload: NotificationNewPayload) => void;
  'follow:requestCancelled': (payload: FollowRequestCancelledPayload) => void;
  'follow:requestResolved': (payload: FollowRequestResolvedPayload) => void;
  'follow:stateChanged': (payload: FollowStateChangedPayload) => void;
  'activeStatus:changed': (payload: ActiveStatusChangedPayload) => void;
  'activeStatus:snapshot': (payload: ActiveStatusSnapshotPayload) => void;
  SESSION_EXPIRED: (payload: SessionExpiredPayload) => void;
};