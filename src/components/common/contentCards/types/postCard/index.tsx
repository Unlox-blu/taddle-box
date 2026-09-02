import React from "react";
import type { FeedCtx, ContentItem, PostData } from "../../content";
import type { Post } from "../../../../../types";
import PostCard from "./PostCard";
import { resolveContentId } from "../../../../../utils/content.util";

export default function PostCardWrapper({
  item,
  ctx,
  index,
}: {
  item: ContentItem;
  ctx: FeedCtx;
  index: number;
}) {
  const post = {
    ...item.data,
    highlight_content: item.highlight?.content || (item.highlight as any)?.title,
  } as any;
  
  const contentId = resolveContentId(post);
  const trackId = (item as any)._trackId || contentId;

  return (
    <PostCard
      post={post}
      index={index}
      isActive={ctx.isFocused && trackId === ctx.activeContentId}
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
      onDelete={
        ctx.onDeletePost ? (p: any) => ctx.onDeletePost!(p ?? post) : undefined
      }
      onReposted={() => ctx.refresh()}
      preloadVideo={post.id === ctx.preloadPostId}
      feedPosts={ctx.feedPosts}
      feedContext={ctx.feedContext}
    />
  );
}
