import React from "react";
import type { RowCtx, PostSearchItem } from "../../ContentCard";
import type { Post } from "../../../../../types";
import PostCard from "./PostCard";
import { resolveContentId } from "../../../../../utils/content.util";

// Post Adapter: The ONLY place we map to the legacy camelCase Post format so that
// PostCard works natively without needing to duplicate 1200 lines of UI code.
const mapToLegacyPost = (item: PostSearchItem): Post => {
  const parsedMedia = (item.media || []).map((m: any) => ({
    ...m,
    media_url: m.media_url || m.cloudfront_url || m.url || "",
  }));
  
  return {
    ...item,
    id: item.id,
    content_id: resolveContentId(item),
    content: item.content || "",
    title: item.title,
    author: {
      id: item.author.id,
      name: item.author.name,
      username: item.author.username,
      avatar_url: item.author.avatar_url,
      avatar: item.author.avatar_url || "👾",
    } as any,
    community: item.community ? item.community.slug : undefined,
    media: parsedMedia,
    hashtags: item.tags || [],
    likes: Number(item.likes_count || 0),
    comments: Number(item.comments_count || 0),
    shares: Number(item.shares_count || 0),
    isLiked: !!item.is_liked,
    isSaved: !!item.is_bookmarked,
    repostedByMe: !!item.is_reposted,
    createdAt: item.created_at || item.published_at || new Date().toISOString(),
    type: parsedMedia.length > 0 ? 'image' : 'text',
    pollData: item.poll_data,
    myPollVote: item.my_poll_vote,
    highlight_content: item.highlight_content,
  } as unknown as Post;
};

export default function PostCardWrapper({ item, ctx, index }: { item: PostSearchItem; ctx: RowCtx; index: number }) {
  const post = mapToLegacyPost(item);
  return (
    <PostCard
      post={post}
      index={index}
      isActive={ctx.isFocused && post.content_id === ctx.activePostId}
      onLike={(id: string) => {
        ctx.toggleLike(id || post.id, post.isLiked);
        ctx.patchPost(id || post.id, { isLiked: !post.isLiked });
      }}
      onSave={(id: string) => {
        ctx.toggleSave(id || post.id, post.isSaved ?? false);
        ctx.patchPost(id || post.id, { isSaved: !post.isSaved });
      }}
      onComment={(p: any) => ctx.openComments(p ?? post)}
      onShare={(p: any) => ctx.sharePost(p ?? post)}
      onAuthorPress={(p: any) => ctx.openUser(p?.author || post.author)}
      onReport={() => ctx.reportPost()}
      showDelete={!!ctx.currentUserId && ctx.currentUserId === post.author?.id}
      onDelete={ctx.onDeletePost ? (p: any) => ctx.onDeletePost!(p ?? post) : undefined}
      onReposted={() => ctx.refresh()}
      preloadVideo={post.id === ctx.preloadPostId}
      feedPosts={ctx.feedPosts}
      feedContext={ctx.feedContext}
    />
  );
}
