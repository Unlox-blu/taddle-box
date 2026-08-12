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
};

export type UserProfileParams = {
  user: User;
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
  Search:         { query?: string; tab?: 'all' | 'posts' | 'people' | 'communities' | 'events' | 'games' | 'hashtags'; scopeCommunity?: string; authorFilter?: string; source?: 'bookmarks' | 'settings' | 'notifications' | 'wallet'; type?: string } | undefined;
};

export type CommunityStackParamList = {
  CommunityList:   undefined;
  CommunityDetail: { communitySlug: string };
  CommunitySettings: { communitySlug: string };
  ManageRequests: { communityId: string };
  ModerationLog: { communityId: string };
};

export type AuthStackParamList = {
  Splash:         undefined;
  Onboarding:     undefined;
  Welcome:        undefined;
  Login:          undefined;
  Register:       undefined;
  OTP:            { phone: string; accessToken?: string; refreshToken?: string };
  ForgotPassword: undefined;
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
}

export interface Post {
  id: string;
  author: User;
  community: string;
  content: string;
  image?: string;                          // emoji placeholder (mock posts only)
  mediaUri?: string;                       // real URI from device picker
  mediaAspectRatio?: '1:1' | '16:9';      // chosen crop ratio
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
  /** Actor (sender) id — used for presence dots on the avatar. */
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
