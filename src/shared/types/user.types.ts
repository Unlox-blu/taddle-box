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

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  color: 'gold' | 'purple' | 'cyan' | 'green' | 'locked';
}