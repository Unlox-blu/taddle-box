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

// ── Row Context ─────────────────────────────────────────────────────────────
export type RowCtx = {
  styles: SearchStyles;
  colors: ColorPalette;
  navigation: any;
  isFocused: boolean;
  activePostId: string | null;
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
  openGames: () => void;
  openEvents: () => void;
  openSettings: () => void;
  openNotifications: () => void;
  addHashtag: (tag: string) => void;
  trackLayout?: (id: string, rect: { top: number; bottom: number }) => void;
  preloadPostId?: string | null;
  feedPosts?: any[];
  feedContext?: 'feed' | 'profile' | 'bookmarks' | 'community' | 'search';
  feedContextId?: string;
};

// ── TypeScript Discriminated Unions ─────────────────────────────────────────

export type PostSearchItem = {
  itemType: 'posts' | 'polls';
  id: string;
  title?: string;
  content: string;
  author: { id: string; name: string; username: string; avatar_url?: string };
  community?: { id: string; name: string; slug: string; privacy: string; avatar_url?: string };
  media?: any[];
  tags?: string[];
  likes_count: number;
  comments_count: number;
  shares_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
  is_reposted: boolean;
  published_at?: string;
  created_at: string;
  highlight_content?: string;
  poll_data?: any;
  my_poll_vote?: number;
};

export type PersonSearchItem = {
  itemType: 'people';
  id: string;
  name: string;
  username: string;
  avatar_url?: string;
  follower_count: number;
  following_count: number;
};

export type CommunitySearchItem = {
  itemType: 'communities';
  id: string;
  name: string;
  slug: string;
  description: string;
  avatar_url?: string;
  member_count: number;
};

export type MediaSearchItem = {
  itemType: 'media';
  media_id: string;
  media_type: string;
  cloudfront_url?: string;
  post_id: string;
  post_title?: string;
  author: { id: string; name: string; username: string; avatar_url?: string };
  community?: { id: string; name: string; slug: string; privacy: string; avatar_url?: string };
};

export type CommentSearchItem = {
  itemType: 'comments';
  id: string;
  content: string;
  post_id: string;
  post_title: string;
  highlight_content?: string;
  author: { id: string; name: string; username: string; avatar_url?: string };
  community?: { id: string; name: string; slug: string; privacy: string; avatar_url?: string };
};

export type GameSearchItem = { itemType: 'games'; id: string; name: string; description: string; thumbnail?: string; };
export type EventSearchItem = { itemType: 'events'; id: string; title: string; description: string; cover_image_url?: string; };
export type MessageSearchItem = { itemType: 'messages'; id: string; content: string; };
export type TextSearchItem = { itemType: 'text'; text: string; };

export type SearchItem =
  | PostSearchItem
  | MediaSearchItem
  | PersonSearchItem
  | CommunitySearchItem
  | CommentSearchItem
  | GameSearchItem
  | EventSearchItem
  | MessageSearchItem
  | TextSearchItem;

export const getContentType = (item: any): string => {
  return item?.itemType || 'unknown';
};

// ── Main Export ─────────────────────────────────────────────────────────────

export default function ContentCard({ item, ctx, index }: { item: any; ctx: RowCtx; index: number }) {
  const type = getContentType(item);

  switch (type) {
    case 'posts':
    case 'polls':
      return <PostCardWrapper item={item as PostSearchItem} ctx={ctx} index={index} />;
    case 'people':
      return <PersonCard item={item as PersonSearchItem} ctx={ctx} />;
    case 'communities':
      return <CommunityCard item={item as CommunitySearchItem} ctx={ctx} />;
    case 'comments':
      return <CommentCard item={item as CommentSearchItem} ctx={ctx} />;
    case 'text':
      return <TextCard item={item as TextSearchItem} ctx={ctx} />;
    default:
      return <UnknownCard item={item} ctx={ctx} />;
  }
}
