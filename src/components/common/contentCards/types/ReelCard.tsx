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
import PersonReelCard from "./reels/PersonReelCard";
import CommunityReelCard from "./reels/CommunityReelCard";
import EventReelCard from "./reels/EventReelCard";
import GameReelCard from "./reels/GameReelCard";
import CommentReelCard from "./reels/CommentReelCard";
import TextReelCard from "./reels/TextReelCard";
import HeaderReelCard from "./reels/HeaderReelCard";
import NotificationReelCard from "./reels/NotificationReelCard";
import TransactionReelCard from "./reels/TransactionReelCard";
import MessageReelCard from "./reels/MessageReelCard";
import UnknownReelCard from "./reels/UnknownReelCard";

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
 * Supports:
 *   - post/poll → PostReelCard (full-screen video/image with overlays)
 *   - person/profile/user → PersonReelCard (full-screen profile)
 *   - community → CommunityReelCard (full-screen community)
 *   - event → EventReelCard (full-screen event)
 *   - game → GameReelCard (full-screen game)
 *   - comment → CommentReelCard (full-screen comment)
 *   - text → TextReelCard (full-screen text/hashtag)
 *   - header → HeaderReelCard (full-screen header)
 *   - notification → NotificationReelCard (full-screen notification)
 *   - wallet_transaction/transaction → TransactionReelCard (full-screen transaction)
 *   - default → UnknownReelCard (fallback)
 */
export default function ReelCard({ item, ctx, index }: ReelCardProps) {
  const type = getContentType(item);

  switch (type) {
    case "post":
    case "poll":
      return <PostReelCard item={item} ctx={ctx} index={index} />;

    case "person":
    case "profile":
    case "user":
      return <PersonReelCard item={item} ctx={ctx} />;

    case "community":
      return <CommunityReelCard item={item} ctx={ctx} />;

    case "event":
      return <EventReelCard item={item} ctx={ctx} />;

    case "game":
      return <GameReelCard item={item} ctx={ctx} />;

    case "comment":
      return <CommentReelCard item={item} ctx={ctx} />;

    case "text":
      return <TextReelCard item={item} ctx={ctx} />;

    case "header":
      return <HeaderReelCard item={item} ctx={ctx} />;

    case "notification":
      return <NotificationReelCard item={item} ctx={ctx} />;

    case "wallet_transaction":
    case "transaction":
      return <TransactionReelCard item={item} ctx={ctx} />;

    case "message":
      return <MessageReelCard item={item} ctx={ctx} />;

    default:
      return <UnknownReelCard item={item} ctx={ctx} />;
  }
}
