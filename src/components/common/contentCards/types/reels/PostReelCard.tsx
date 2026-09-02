/**
 * PostReelCard — Full-screen reel for post content.
 *
 * Delegates to the existing ReelItem component to preserve
 * the exact same UI: video playback, overlays, animations,
 * polls, reposts, double-tap like, XP tracking, etc.
 */
import React, { useCallback } from "react";
import ReelItem from "../../../../../screens/main/ReelItem";
import type { ContentItem } from "../../content";
import type { ReelCtx } from "../../../SharedReels";

interface PostReelCardProps {
  item: ContentItem;
  ctx: ReelCtx;
  index: number;
}

export default function PostReelCard({ item, ctx, index }: PostReelCardProps) {
  const post = item.data;

  const handleLike = useCallback(() => {
    ctx.toggleLike(post.id, post.isLiked);
  }, [ctx, post.id, post.isLiked]);

  const handleSave = useCallback(() => {
    ctx.toggleSave(post.id, post.isSaved);
  }, [ctx, post.id, post.isSaved]);

  const handleCommentPress = useCallback(() => {
    ctx.openComments(post);
  }, [ctx, post]);

  const handleAuthorPress = useCallback(() => {
    if (post.author?.id) {
      ctx.openUser(post.author);
    }
  }, [ctx, post.author]);

  const handleShare = useCallback(() => {
    ctx.sharePost(post);
  }, [ctx, post]);

  const handleReposted = useCallback(() => {
    // Handled by ReelItem internally via postsService
  }, []);

  const handleDelete = useCallback(() => {
    // Delete handled by ReelScreen via ReelCtx if needed
  }, []);

  const handleReport = useCallback(() => {
    // Report handled by ReelItem internally via PostMenuSheet
  }, []);

  return (
    <ReelItem
      post={post}
      isActive={ctx.activeContentId === post.id}
      onLike={handleLike}
      onSave={handleSave}
      onCommentPress={handleCommentPress}
      onAuthorPress={handleAuthorPress}
      onDelete={handleDelete}
      onReport={handleReport}
      onShare={handleShare}
      onReposted={handleReposted}
      showDelete={false}
      isProfileReel={ctx.feedContext === "profile"}
    />
  );
}
