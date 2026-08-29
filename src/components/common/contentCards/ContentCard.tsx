import React from "react";
import type { Post } from "../../../types";
import type { ColorPalette } from "../../../theme";
import type { SearchStyles } from "../../search/searchStyles";

import PostCardWrapper from "./types/postCard";
import PersonCard from "./types/PersonCard";
import CommunityCard from "./types/CommunityCard";
import CommentCard from "./types/CommentCard";
import TextCard from "./types/TextCard";
import UnknownCard from "./types/UnknownCard";
import GameCard from "./types/GameCard";
import EventCard from "./types/EventCard";
import NotificationCard from "./types/NotificationCard";
import TransactionCard from "./types/TransactionCard";
import HeaderCard, { type HeaderData } from "./types/HeaderCard";

// ── Row Context ─────────────────────────────────────────────────────────────
export type RowCtx = {
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
  feedContext?: "feed" | "profile" | "bookmarks" | "community" | "search";
  feedContextId?: string;
};

// ── TypeScript Discriminated Unions ─────────────────────────────────────────

export type FeedEnvelope<T = any> = {
  itemType: string;
  id: string;
  data: T;
  score?: number;
  highlight?: any;
};

// Data models
export type PostData = {
  id: string; // sometimes id is also in data
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

// ── Main Export ─────────────────────────────────────────────────────────────

export default function ContentCard({
  item,
  ctx,
  index,
}: {
  item: FeedEnvelope;
  ctx: RowCtx;
  index: number;
}) {
  const type = getContentType(item);

  switch (type) {
    case "post":
    case "poll":
      return (
        <PostCardWrapper
          item={item as FeedEnvelope<PostData>}
          ctx={ctx}
          index={index}
        />
      );
    case "person":
    case "profile":
    case "user":
      return <PersonCard item={item as FeedEnvelope<PersonData>} ctx={ctx} />;
    case "community":
      return (
        <CommunityCard item={item as FeedEnvelope<CommunityData>} ctx={ctx} />
      );
    case "comment":
      return <CommentCard item={item as FeedEnvelope<CommentData>} ctx={ctx} />;
    case "text":
      return <TextCard item={item as FeedEnvelope<TextData>} ctx={ctx} />;
    case "header":
      return <HeaderCard item={item as FeedEnvelope<HeaderData>} ctx={ctx} />;
    case "game":
      return <GameCard item={item as FeedEnvelope<GameData>} ctx={ctx} />;
    case "event":
      return <EventCard item={item as FeedEnvelope<EventData>} ctx={ctx} />;
    case "notification":
      return <NotificationCard item={item as FeedEnvelope<NotificationData>} ctx={ctx} />;
    case "wallet_transaction":
    case "transaction":
      return <TransactionCard item={item as FeedEnvelope<TransactionData>} ctx={ctx} />;
    default:
      return <UnknownCard item={item} ctx={ctx} />;
  }
}
