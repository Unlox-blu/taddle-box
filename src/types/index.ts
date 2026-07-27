// ── Navigation param lists ──────────────────────────────────────
export type HomeStackParamList = {
  HomeMain:       undefined;
  Notifications:  undefined;
  Comments:       { post: Post };
  UserProfile:    { user: User };
  StoryViewer:    { stories: Story[]; initialIndex: number };
  Bookmarks:      undefined;
  Settings:       undefined;
  EditProfile:    undefined;
  Terms:          undefined;
  Privacy:        undefined;
  LockScreen:     { mode?: 'app' | 'wallet'; returnScreen?: keyof HomeStackParamList; isSetup?: boolean; isDisable?: boolean };
  ChangePassword: undefined;
  ChangePhone:    undefined;
  ChangeEmail:    undefined;
  Search:         { query?: string } | undefined;
};

export type CommunityStackParamList = {
  CommunityList:   undefined;
  CommunityDetail: { communitySlug: string };
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
};

// ── Data models ─────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  handle: string;
  username?: string;
  avatarUrl?: string;
  avatar: string;
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
  isSaved: boolean;
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
  isJoined: boolean;
  memberRole?: 'member' | 'moderator' | 'admin' | null;
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
}

export interface Game {
  id: string;
  name: string;
  emoji: string;
  gradient: [string, string];
  playersOnline: number;
  maxXp: number;
  isHot: boolean;
}

export interface Transaction {
  id: string;
  title: string;
  date: string;
  amount: number;
  currency: 'INR' | 'XP';
  type: 'earn' | 'spend' | 'convert' | 'withdraw';
  status?: string;
}

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'event' | 'achievement';
  avatar: string;
  actor: string;
  text: string;
  time: string;
  isRead: boolean;
  group: 'today' | 'yesterday' | 'earlier';
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
