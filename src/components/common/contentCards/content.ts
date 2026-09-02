/**
 * Content types — Single source of truth.
 *
 * ContentItem, content data models, and getContentType.
 * Imported by FeedCard, ReelCard, SharedFeed, SharedReels,
 * queries, mutations, and all card components.
 */
import type { Post } from "../../../types";
import type { ColorPalette } from "../../../theme";
import type { SearchStyles } from "../../search/searchStyles";

// ── Content Item ─────────────────────────────────────────────────────────────
// Generic mixed-content type. SSOT for all feed/reel content.

export type ContentItem = {
  itemType: string;
  id: string;
  data: any;
  score?: number;
  highlight?: any;
  isHeader?: boolean;
};

// ── Feed Context ─────────────────────────────────────────────────────────────

export type FeedCtx = {
  styles: SearchStyles;
  colors: ColorPalette;
  navigation: any;
  isFocused: boolean;
  activeContentId: string | null;
  currentUserId?: string;
  toggleLike: (id: string, isLiked: boolean) => void;
  toggleSave: (id: string, isSaved: boolean) => void;
  patchPost: (postId: string, patch: Partial<Post>) => void;
  sharePost: (post: Post) => void;
  reportPost: () => void;
  onDeletePost?: (post: any) => void;
  refresh: () => void;
  openPost: (post: any) => void;
  openComments: (post: any) => void;
  openUser: (user: any) => void;
  openCommunity: (slug: string) => void;
  openGames: (id?: string) => void;
  openEvents: (id?: string) => void;
  openSettings: () => void;
  openNotifications: () => void;
  addHashtag: (tag: string) => void;
  trackLayout?: (id: string, rect: { top: number; bottom: number }) => void;
  preloadPostId?: string | null;
  feedPosts?: any[];
  feedContext?: "home" | "profile" | "bookmarks" | "community" | "search";
  feedContextId?: string;
};

// ── Content Data Models ──────────────────────────────────────────────────────

export type PostData = {
  id: string;
  title?: string;
  content: string;
  author: { id: string; name: string; username: string; avatarUrl?: string };
  community?: {
    id: string;
    name: string;
    slug: string;
    privacy: string;
    avatarUrl?: string;
  };
  media?: any[];
  tags?: string[];
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  isSaved: boolean;
  repostedByMe: boolean;
  publishedAt?: string;
  createdAt: string;
  pollData?: any;
  myPollVote?: number;
};

export type PersonData = {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  followerCount: number;
  followingCount: number;
};

export type CommunityData = {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatarUrl?: string;
  memberCount: number;
};

export type MediaData = {
  media_id: string;
  media_type: string;
  cloudfront_url?: string;
  post_id: string;
  post_title?: string;
  author: { id: string; name: string; username: string; avatarUrl?: string };
  community?: {
    id: string;
    name: string;
    slug: string;
    privacy: string;
    avatarUrl?: string;
  };
};

export type CommentData = {
  id: string;
  content: string;
  postId: string;
  postTitle?: string;
  author: { id: string; name: string; username: string; avatarUrl?: string };
  community?: {
    id: string;
    name: string;
    slug: string;
    privacy: string;
    avatarUrl?: string;
  };
  createdAt?: string;
};

export type GameData = {
  id: string;
  name: string;
  description: string;
  thumbnail?: string;
};

export type EventData = {
  id: string;
  title: string;
  description: string;
  cover_image_url?: string;
};

export type NotificationData = {
  id: string;
  title?: string;
  message?: string;
  type?: string;
  isRead?: boolean;
};

export type TransactionData = {
  id: string;
  amount: number;
  type: string;
  currency: string;
  description?: string;
  ts?: number;
};

export type MessageData = { id: string; content: string };
export type TextData = { text: string };

// ── Content Type Resolution ──────────────────────────────────────────────────

export const getContentType = (item: any): string => {
  const type = item?.itemType || "unknown";
  if (type === "posts") return "post";
  if (type === "headers") return "header";
  if (type === "polls") return "poll";
  if (type === "communities") return "community";
  if (type === "events") return "event";
  if (type === "games") return "game";
  if (type === "people") return "person";
  if (type === "comments") return "comment";
  if (type === "notifications") return "notification";
  if (type === "wallet_transactions" || type === "transactions") return "wallet_transaction";
  return type;
};
