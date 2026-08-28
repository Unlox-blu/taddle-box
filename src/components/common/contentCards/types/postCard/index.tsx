import React from "react";
import type { RowCtx, FeedEnvelope, PostData } from "../../ContentCard";
import type { Post } from "../../../../../types";
import PostCard from "./PostCard";
import { resolveContentId } from "../../../../../utils/content.util";

export default function PostCardWrapper({
  item,
  ctx,
  index,
}: {
  item: FeedEnvelope<PostData>;
  ctx: RowCtx;
  index: number;
}) {
  // Use the clean data directly from the unified backend
  const post = {
    ...item.data,
    id: item.id, // ensure envelope ID overrides if needed
    highlight_content: item.highlight?.content || (item.highlight as any)?.title,
  } as any;
  
  const contentId = resolveContentId(post);

  return (
    <PostCard
      post={post}
      index={index}
      isActive={ctx.isFocused && contentId === ctx.activePostId}
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
