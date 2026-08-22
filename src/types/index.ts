// ── Navigation param lists ──────────────────────────────────────
// PostDetail and UserProfile are registered in BOTH the root stack (full-screen
// opens from any tab) and the Home stack (in-tab navigation). These shared
// param types are the single source of truth — both param lists reference them
// so the two registrations can never drift apart (e.g. one gaining commentId
// and the other not).
export type PostDetailParams = {
  post: Post;
  /** Deep-link straight to this comment (mention/reply notifications). */
  commentId?: string;
  /** Reel mode: flat list of posts seeded by the caller to enable swipe-next.
   *  The reel starts at the index of `post` within this array. */
  feedPosts?: Post[];
  /** Which context opened the reel — used to fetch more posts when feedPosts
   *  runs out or was not provided by the caller. */
  feedContext?: 'feed' | 'profile' | 'bookmarks' | 'community' | 'search';
  /** Scoped id for profile / community contexts (userId or communitySlug). */
  feedContextId?: string;
};

export type UserProfileParams = {
  user?: User;
  username?: string;
  /** openPostId deep-links a post (e.g. from a notification) into the profile. */
  /** openPost ships the full post so the deep-link opens without re-fetching. */
  openPostId?: string;
  openPost?: any;
};

export type HomeStackParamList = {
  HomeMain:       undefined;
  Notifications:  undefined;
  Comments:       { post: Post };
  PostDetail:      PostDetailParams;
  UserProfile:    UserProfileParams;
  StoryViewer:    { stories: Story[]; initialIndex: number };
  Bookmarks:      undefined;
  Leaderboards:   { initialTab?: 'Global' | 'Friends' | 'Games' | 'Feed' | 'Community' | 'Events' } | undefined;
  Settings:       undefined;
  EditProfile:    undefined;
  Terms:          undefined;
  Privacy:        undefined;
  LockScreen:     { mode?: 'app' | 'wallet'; returnScreen?: keyof HomeStackParamList; isSetup?: boolean; isDisable?: boolean };
  ChangePassword: undefined;
  ChangePhone:    undefined;
  ChangeEmail:    undefined;
  FollowRequests: undefined;
  Search:         { query?: string; tab?: 'all' | 'posts' | 'people' | 'communities' | 'events' | 'games' | 'hashtags'; scopeCommunity?: string; authorFilter?: string; source?: 'bookmarks' | 'settings' | 'notifications' | 'wallet' | 'messages'; type?: string } | undefined;
  ChatInbox:      undefined;
  Chat:           { conversationId: string; otherUserId?: string; otherUser?: any; isCommunityChat?: boolean; communityName?: string; communityAvatar?: string };
};

export type CommunityStackParamList = {
  CommunityList:   undefined;
  CommunityDetail: { communitySlug: string };
  CommunitySettings: { communitySlug: string };
  ManageRequests: { communityId: string };
  ModerationLog: { communityId: string };
  Chat: { conversationId: string; otherUserId?: string; otherUser?: any; isCommunityChat?: boolean; communityName?: string; communityAvatar?: string };
};

export type AuthStackParamList = {
  Splash:         undefined;
  Onboarding:     undefined;
  Welcome:        undefined;
  Login:          undefined;
  Register:       undefined;
  OTP:            { phone: string; accessToken?: string; refreshToken?: string };
  ForgotPassword: { initialIdentifier?: string } | undefined;
  CompleteProfile: undefined;
  Terms:          undefined;
  Privacy:        undefined;
};

export type MainTabParamList = {
  Home:      undefined;
  Community: undefined;   // handled by CommunityStackNavigator
  Events:    undefined;
  Games:     undefined;
  Wallet:    undefined;
  Profile:   undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  ForceUpdate: undefined;
  /** Full-screen post page — registered at the ROOT so it opens above the tab
      bar from any tab (feed, community, profile, notifications, tray taps). */
  PostDetail: PostDetailParams;
  /** Also at root so profile navigation from the full-screen post page works. */
  UserProfile: UserProfileParams;
  /** Also at root so hashtag taps (@#tag inside a post body) work from the
      full-screen post page and pushed profiles — the Home-stack copy still
      handles search inside the tab. */
  Search: HomeStackParamList['Search'];
  EventDetail: { event: any };
  ChatInbox: undefined;
  Chat: { conversationId: string; otherUserId?: string; otherUser?: any; isCommunityChat?: boolean; communityName?: string; communityAvatar?: string };
  /** SideDrawer screens — at root so they don't activate any tab. */
  Bookmarks: undefined;
  Settings: undefined;
  Leaderboards: HomeStackParamList['Leaderboards'];
  Terms: undefined;
  Privacy: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
  ChangePhone: undefined;
  ChangeEmail: undefined;
  FollowRequests: undefined;
  LockScreen: HomeStackParamList['LockScreen'];
};

// ── Data models ─────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email?: string;
  handle: string;
  username?: string;
  countryCode?: string;
  phone?: string;
  phoneNumber?: string;
  avatarUrl?: string;
  avatar: string;
  /** Profile cover/banner image URL (users.banner_url). */
  bannerUrl?: string;
  level: number;
  xp: number;
  xpToNext: number;
  rank: string;
  followers: number;
  following: number;
  posts: number;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  bio: string;
  organization: string;
  badges: Badge[];
  /** Profile lock PIN hash (bcrypt) — only present for own profile */
  lockPin?: string;
  /** Whether the global profile lock is enabled */
  globalAccountLockEnabled?: boolean;
  /** Whether the wallet-specific lock is enabled */
  walletLockEnabled?: boolean;
  /** @deprecated use lockPin */
  appLock?: string;
}

export interface Post {
  id: string;
  author: User;
  community: string;
  content: string;
  title?: string;
  image?: string;
  mediaUri?: string;
  mediaAspectRatio?: '1:1' | '16:9';
  /** Backend-enriched media array. */
  media?: Array<{
    media_id: string;
    media_type: 'image' | 'video' | 'audio';
    media_url: string;
    preview_url?: string | null;
    width?: number;
    height?: number;
    duration_seconds?: number;
    file_size_bytes?: number;
    mime_type?: string;
    has_audio?: boolean;
  }>;
  hashtags: string[];
  likes: number;
  comments: number;
  shares: number;
  xpEarned: number;
  createdAt: string;
  isLiked: boolean;
  isSaved?: boolean;
  isXpClaimed?: boolean;
  /** Whether the current user already reposted this post. */
  repostedByMe?: boolean;
  repostOfId?: string | null;
  /** Optional place tag captured at creation — shown in the card's rolling text. */
  location?: { lat: number; lon: number; place?: string } | null;
  /** Poll attached to the post: question + options with their vote tallies. */
  pollData?: {
    question: string;
    options: { text: string; votes: number }[];
    totalVotes?: number;
    /** Author closed the poll — no further votes are accepted. */
    closed?: boolean;
    closedAt?: string;
  } | null;
  /** Index of the poll option the current user voted for (null = not voted). */
  myPollVote?: number | null;
  type: 'text' | 'image' | 'video' | 'poll';
}

export interface Story {
  id: string;
  user: string;
  avatar: string;
  seen: boolean;
  isOwn?: boolean;
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatarMediaId?: string;
  bannerMediaId?: string;
  avatarUrl?: string;
  avatar?: string;
  bannerUrl?: string;
  privacy: 'public' | 'private' | 'restricted';
  category: string[];
  rules?: any;
  ownerId: string;
  memberCount: number;
  postCount: number;
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  isJoined?: boolean;
  isMember?: boolean;
  /** True when the current user has a PENDING join request (private community). */
  isPending?: boolean;
  memberRole?: 'member' | 'moderator' | 'admin' | null;
  /** Community "Allow Reposting" toggle — owner-controlled, false blocks new reposts of the community's posts. */
  allowReposts?: boolean;
  isBookmarked?: boolean;
}

export interface Event {
  id: string;
  title: string;
  type: 'hackathon' | 'webinar' | 'meetup' | 'competition' | 'workshop';
  banner: string;
  date: string;
  rawDate?: string;
  time?: string;
  location: string;
  xpReward: number;
  cashPrize?: number;
  registrations: number;
  isLive: boolean;
  isFeatured: boolean;
  isRegistered: boolean;
  isFree: boolean;
  priceCents?: number;
  /** Paid-event ticket price expressed in XP (server-computed). */
  xpPrice?: number;
}

export interface Game {
  id: string;
  name: string;
  emoji: string;
  gradient: [string, string];
  imageUrl?: string;
  /** Branded logo asset (require'd PNG) — takes precedence over monogram tile */
  logo?: any;
  /** Cached card image from disk — takes precedence over remote imageUrl */
  card?: { uri: string } | null;
  slug?: string;
  metadata?: Record<string, any>;
  maxXp: number;
  isHot: boolean;
  maxPlayers?: number;
  entryFee?: number;
  prize?: number;
  /** Human-friendly average playtime ("3 min") — from local assets or backend. */
  averageDurationLabel?: string;
}

export interface Transaction {
  id: string;
  title: string;
  date: string;
  amount: number;
  currency: 'INR' | 'XP';
  type: 'earn' | 'spend' | 'convert' | 'withdraw' | 'topup';
  status?: string;
  /** epoch ms of createdAt — used for sorting and month grouping */
  ts?: number;
}

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'event' | 'achievement' | 'game_invite' | 'post' | 'community' | 'streak';
  /** Actor (sender) id — used for active-status dots on the avatar. */
  senderId?: string;
  avatar: string;
  avatarUrl?: string;
  /** Server-enriched preview image (post media / community avatar / game cover). */
  thumbnailUrl?: string;
  /** How many distinct actors this stacked notification aggregates (Instagram-style "A and N others"). */
  actorCount?: number;
  /** Display names of all stacked actors (first = sender). */
  actorNames?: string[];
  /** Community identity for community notifications (enriched server-side). */
  communityName?: string;
  communityAvatarUrl?: string;
  communityBannerUrl?: string;
  actor: string;
  text: string;
  time: string;
  isRead: boolean;
  group: 'today' | 'yesterday' | 'earlier';
  resourceId?: string;
  resourceType?: string;
  createdAt?: string;
  payload?: Record<string, any>;
}

export interface Comment {
  id: string;
  postId: string;
  author: { id: string; name: string; handle: string; avatar: string };
  text: string;
  likes: number;
  isLiked: boolean;
  createdAt: string;
  replies?: number;
}

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  color: 'gold' | 'purple' | 'cyan' | 'green' | 'locked';
}

export interface LeaderboardEntry {
  rank: number;
  user: string;
  avatar: string;
  xp: number;
}

export interface OnboardingSlide {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  gradient: [string, string];
}

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
