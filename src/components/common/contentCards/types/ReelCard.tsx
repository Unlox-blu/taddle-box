/**
 * ReelCard — Dispatcher for full-screen reel content types.
 *
 * Mirrors FeedCard.tsx for the reel presentation.
 * Each content type gets its own ReelItem variant.
 *
 * Usage:
 *   <ReelCard item={row} ctx={reelCtx} index={index} />
 */
import React from "react";
import type { ContentItem } from "../content";
import type { ReelCtx } from "../../SharedReels";

// Reel-specific card variants
import PostReelCard from "./reels/PostReelCard";
import UnsupportedReelCard from "./reels/UnsupportedReelCard";

// Re-export FeedCard type resolution
import { getContentType } from "../content";

interface ReelCardProps {
  item: ContentItem;
  ctx: ReelCtx;
  index: number;
}

/**
 * ReelCard dispatches to the appropriate reel variant
 * based on content_type.
 *
 * Currently supports:
 *   - post/poll → PostReelCard (full-screen video/image)
 *   - event → EventReelCard (event preview)
 *   - game → GameReelCard (game preview)
 *   - default → UnknownReelCard (fallback)
 */
export default function ReelCard({ item, ctx, index }: ReelCardProps) {
  const type = getContentType(item);

  switch (type) {
    case "post":
    case "poll":
      return <PostReelCard item={item} ctx={ctx} index={index} />;

    // Add more types here when they have meaningful immersive experiences:
    // case "event":
    //   return <EventReelCard item={item} ctx={ctx} index={index} />;
    // case "game":
    //   return <GameReelCard item={item} ctx={ctx} index={index} />;

    default:
      // Explicit fallback — unsupported types are visible during development
      return <UnsupportedReelCard item={item} />;
  }
}
