// ── Navigation param lists ──────────────────────────────────────
export type HomeStackParamList = {
  HomeMain:      undefined;
  Notifications: undefined;
  Comments:      { post: Post };
  UserProfile:   { user: User };
  StoryViewer:   { stories: Story[]; initialIndex: number };
  Bookmarks:     undefined;
  Settings:      undefined;
};

export type CommunityStackParamList = {
  CommunityList:   undefined;
  CommunityDetail: { communityId: string };
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
};

// ── Data models ─────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  level: number;
  xp: number;
  xpToNext: number;
  rank: string;
  followers: number;
  following: number;
  posts: number;
  bio: string;
  college: string;
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
  description: string;
  banner: string;
  avatar: string;
  members: number;
  isJoined: boolean;
  isPrivate: boolean;
  category: string;
}

export interface Event {
  id: string;
  title: string;
  type: 'hackathon' | 'webinar' | 'meetup' | 'competition' | 'workshop';
  banner: string;
  date: string;
  time?: string;
  location: string;
  xpReward: number;
  cashPrize?: number;
  registrations: number;
  isLive: boolean;
  isFeatured: boolean;
  isRegistered: boolean;
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
