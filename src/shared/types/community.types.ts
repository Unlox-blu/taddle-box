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