/**
 * FeedCard — Dispatcher for feed content types.
 *
 * Routes ContentItem to the appropriate card component.
 * Types and models live in content.ts (SSOT).
 */
import React from "react";

import type { ContentItem, FeedCtx } from "./content";
import { getContentType } from "./content";

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
import MessageCard from "./types/MessageCard";
import HeaderCard from "./types/HeaderCard";

export default function FeedCard({
  item,
  ctx,
  index,
}: {
  item: ContentItem;
  ctx: FeedCtx;
  index: number;
}) {
  const type = getContentType(item);

  switch (type) {
    case "post":
    case "poll":
      return <PostCardWrapper item={item} ctx={ctx} index={index} />;
    case "person":
    case "profile":
    case "user":
      return <PersonCard item={item} ctx={ctx} />;
    case "community":
      return <CommunityCard item={item} ctx={ctx} />;
    case "comment":
      return <CommentCard item={item} ctx={ctx} />;
    case "text":
      return <TextCard item={item} ctx={ctx} />;
    case "header":
      return <HeaderCard item={item} ctx={ctx} />;
    case "game":
      return <GameCard item={item} ctx={ctx} />;
    case "event":
      return <EventCard item={item} ctx={ctx} />;
    case "notification":
      return <NotificationCard item={item} ctx={ctx} />;
    case "wallet_transaction":
    case "transaction":
      return <TransactionCard item={item} ctx={ctx} />;
    case "message":
      return <MessageCard item={item} ctx={ctx} />;
    default:
      return <UnknownCard item={item} ctx={ctx} />;
  }
}
