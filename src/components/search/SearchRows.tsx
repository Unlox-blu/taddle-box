import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fontSizes, type ColorPalette } from "../../theme";
import type { Post, Transaction } from "../../types";
import PostCard from "../home/PostCard";
import { PollStatusPill } from "../common/PollBlock";
import type { SearchStyles } from "./searchStyles";

// ── Per-type search row renderers ─────────────────────────────────────────────
// Every result kind the unified search can return gets its own component,
// selected through the ROW_RENDERERS map below. Adding a new backend group =
// add one component + one map entry; unknown types fall back to the generic
// row. The components are module-level (stable identities) and receive
// everything they need through `ctx`, so they never hold hooks or screen state
// themselves — SearchScreen builds the ctx once per render.
export type RowProps = { data: any; ctx: RowCtx };

export type RowCtx = {
  styles: SearchStyles;
  colors: ColorPalette;
  navigation: any;
  isFocused: boolean;
  activePostId: string | null;
  currentUserId?: string;
  toggleLike: (id: string, isCurrentlyLiked: boolean) => void;
  toggleSave: (id: string, isCurrentlySaved: boolean) => void;
  patchPost: (postId: string, patch: Partial<Post>) => void;
  sharePost: (post: Post) => void;
  reportPost: () => void;
  refresh: () => void;
  openPost: (post: any) => void;
  openUser: (user: any) => void;
  openCommunity: (slug: string) => void;
  openGames: () => void;
  openEvents: () => void;
  openSettings: () => void;
  openNotifications: () => void;
  addHashtag: (tag: string) => void;
};

// Search returns raw snake_case columns — normalize them into the camelCase
// Post shape the PostCard renderer expects.
const normalizePostResult = (item: any): Post => {
  const author = item.author || {
    id: item.authorId || item.author_id || "",
    name: item.authorName || item.author_name || "Unknown User",
    username: item.authorUsername || item.author_username || "unknown",
    handle: item.authorUsername || item.author_username || "unknown",
    avatarUrl:
      item.user_avatar ||
      item.author_avatar ||
      item.authorAvatar ||
      item.avatar ||
      item.avatarUrl ||
      item.avatar_url,
    avatar:
      item.user_avatar ||
      item.author_avatar ||
      item.authorAvatar ||
      item.avatar ||
      item.avatarUrl ||
      item.avatar_url ||
      "",
    level: 1,
    xp: 0,
    xpToNext: 100,
  };

  return {
    ...item,
    author,
    // Search returns the raw snake_case column — carry it as the camelCase
    // key PostCard checks so the embedded original preview renders for reposts.
    repostOfId: item.repostOfId ?? item.repost_of_id ?? null,
    // Search returns the community as flat columns (community_name, slug, …) —
    // rebuild the nested object PostCard renders as the "• c/name" badge on
    // community posts.
    community:
      item.community ||
      (item.community_id
        ? {
            id: item.community_id,
            name: item.community_name || item.communityName,
            slug: item.community_slug || item.communitySlug,
            privacy: item.community_privacy,
            avatarUrl: item.community_avatar,
          }
        : undefined),
    // Search returns raw latitude/longitude/place columns — rebuild the
    // nested location object PostCard's rolling text reads.
    location:
      item.location ||
      (item.latitude != null && item.longitude != null
        ? {
            lat: Number(item.latitude),
            lon: Number(item.longitude),
            place: item.place || "",
          }
        : null),
    media: item.media || [],
    hashtags: item.hashtags || item.tags || [],
    likes: item.likes ?? item.likesCount ?? item.likes_count ?? 0,
    comments: item.comments ?? item.commentsCount ?? item.comments_count ?? 0,
    shares: item.shares ?? item.sharesCount ?? item.shares_count ?? 0,
    // Backend returns is_liked / is_bookmarked / is_reposted (snake_case) —
    // accept all spellings so search results render the heart + bookmark +
    // filled repeat icon (with the tick) correctly.
    isLiked: !!(item.isLiked ?? item.is_liked),
    isSaved: !!(
      item.isSaved ??
      item.is_saved ??
      item.isBookmarked ??
      item.is_bookmarked
    ),
    repostedByMe: !!(item.repostedByMe ?? item.is_reposted),
    createdAt: item.createdAt || item.created_at,
    publishedAt: item.publishedAt || item.published_at,
    type: item.type || (item.media?.length ? "image" : "text"),
  } as Post;
};

// Compact relative time ("5m ago", "2h ago", "3d ago") for result rows.
const timeAgo = (input?: string | number | null): string => {
  if (!input) return "";
  const t = new Date(input).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(1, Math.floor((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(input).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const PostRow = ({ data, ctx }: RowProps) => {
  const post = normalizePostResult(data);
  // Patch the row in local state so the icon flips instantly and stays
  // consistent across re-renders (search results aren't react-query cached,
  // so the useToggleSave/useToggleLike cache updates miss them).
  const { styles } = ctx;
  return (
    <PostCard
      post={post}
      isActive={ctx.isFocused && post.id === ctx.activePostId}
      onLike={() => {
        ctx.toggleLike(post.id, post.isLiked || false);
        ctx.patchPost(post.id, { isLiked: !post.isLiked });
      }}
      onSave={() => {
        ctx.toggleSave(post.id, post.isSaved || false);
        ctx.patchPost(post.id, { isSaved: !post.isSaved });
      }}
      onComment={(p: any) => ctx.openPost(p ?? post)}
      onShare={() => ctx.sharePost(post)}
      onAuthorPress={() => ctx.openUser(post.author)}
      onReport={() => ctx.reportPost()}
      showDelete={
        !!ctx.currentUserId &&
        ctx.currentUserId === (post as any)?.author?.id
      }
      onReposted={() => ctx.refresh()}
    />
  );
};

// A post carrying a poll — the question + options with vote bars, deep-linking
// to the post. poll_data shape: { question, options: [{ text, votes }] }.
const PollRow = ({ data, ctx }: RowProps) => {
  const { styles, colors } = ctx;
  const poll = data.poll_data || {};
  const options: any[] = Array.isArray(poll.options) ? poll.options : [];
  const totalVotes =
    Number(poll.totalVotes ?? poll.votes) ||
    options.reduce((s: number, o: any) => s + (Number(o.votes) || 0), 0);
  // Search rows carry raw (snake_case) columns, unlike feed cards which are
  // camelCased by the model formatter.
  const myVote =
    data.myPollVote != null || data.my_poll_vote != null
      ? Number(data.myPollVote ?? data.my_poll_vote)
      : null;
  const postId: string = data.id;
  return (
    <TouchableOpacity
      style={styles.pollCard}
      onPress={() => ctx.openPost({ id: postId })}
      activeOpacity={0.8}
    >
      <View style={styles.pollHeader}>
        <View style={styles.avatarBubble}>
          {data.author_avatar ? (
            <Image
              source={{ uri: data.author_avatar }}
              style={styles.avatarImg}
            />
          ) : (
            <Text style={{ fontSize: 18 }}>📊</Text>
          )}
        </View>
        <View style={styles.peopleInfo}>
          <Text style={styles.peopleName} numberOfLines={1}>
            {data.author_name || "User"}
          </Text>
          <Text style={styles.peopleHandle} numberOfLines={1}>
            {(data.community_name || data.community_slug
              ? `  ·  ${data.community_name || data.community_slug}`
              : "") + (data.published_at ? `  ·  ${timeAgo(data.published_at)}` : "")}
          </Text>
        </View>
      </View>
      {/* The same status pill as feed cards — breathing green dot while the
          poll is live, static red once closed. The pill hugs its own text
          and top-anchors it like the question's line box, so it stays
          straight on the first line. */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10 }}>
        <PollStatusPill closed={!!poll.closed} />
        <Text style={[styles.pollQuestion, { flex: 1, marginTop: 0 }]} numberOfLines={2}>
          {poll.question || data.title || "Poll"}
        </Text>
      </View>
      {options.map((o, i) => {
        const pct =
          totalVotes > 0
            ? Math.round(((Number(o.votes) || 0) / totalVotes) * 100)
            : 0;
        const isMine = myVote === i;
        return (
          <View key={i} style={styles.pollOption}>
            <View style={styles.pollOptionTextRow}>
              {isMine && (
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={colors.primaryLight}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text style={styles.pollOptionText} numberOfLines={2}>
                {o.text || `Option ${i + 1}`}
              </Text>
              <Text style={styles.pollOptionPct}>{pct}%</Text>
            </View>
            <View style={styles.pollBarTrack}>
              <View
                style={[
                  styles.pollBarFill,
                  isMine && { opacity: 1 },
                  { width: `${pct}%` },
                ]}
              />
            </View>
          </View>
        );
      })}
      <Text style={styles.peopleMeta} numberOfLines={1}>
        {totalVotes} vote{totalVotes === 1 ? "" : "s"} ·{" "}
        {data.comments_count || 0} comments · {data.likes_count || 0} likes
        {poll.closed
          ? ` · Closed${timeAgo(poll.closedAt) ? ` (${timeAgo(poll.closedAt)})` : ""}`
          : ""}
      </Text>
    </TouchableOpacity>
  );
};

const PeopleRow = ({ data, ctx }: RowProps) => {
  const { styles, colors } = ctx;
  return (
    <TouchableOpacity
      style={styles.peopleRow}
      onPress={() => ctx.openUser(data)}
      activeOpacity={0.8}
    >
      <View style={styles.avatarBubble}>
        {data.user_avatar ||
        data.avatar ||
        data.avatarUrl ||
        data.avatar_url ||
        data.profile_image ? (
          <Image
            source={{
              uri:
                data.user_avatar ||
                data.avatar ||
                data.avatarUrl ||
                data.avatar_url ||
                data.profile_image,
            }}
            style={styles.avatarImg}
          />
        ) : (
          <Text style={{ fontSize: 18 }}>👾</Text>
        )}
      </View>
      <View style={styles.peopleInfo}>
        <Text style={styles.peopleName}>{data.name}</Text>
        <Text style={styles.peopleHandle}>@{data.username}</Text>
        <Text style={styles.peopleMeta}>
          {data.follower_count || 0} followers
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.text.muted}
      />
    </TouchableOpacity>
  );
};

const CommunityRow = ({ data, ctx }: RowProps) => {
  const { styles, colors } = ctx;
  return (
    <TouchableOpacity
      style={styles.peopleRow}
      onPress={() => ctx.openCommunity(data.slug)}
      activeOpacity={0.8}
    >
      <View style={styles.avatarBubble}>
        {data.community_avatar ||
        data.avatar ||
        data.avatarUrl ||
        data.avatar_url ? (
          <Image
            source={{
              uri:
                data.community_avatar ||
                data.avatar ||
                data.avatarUrl ||
                data.avatar_url,
            }}
            style={styles.avatarImg}
          />
        ) : (
          <Ionicons
            name="people-outline"
            size={18}
            color={colors.text.muted}
          />
        )}
      </View>
      <View style={styles.peopleInfo}>
        <Text style={styles.peopleName}>{data.name}</Text>
        <Text style={styles.peopleHandle}>
          {data.member_count || 0} members
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.text.muted}
      />
    </TouchableOpacity>
  );
};

const EventRow = ({ data, ctx }: RowProps) => {
  const { styles, colors } = ctx;
  const location =
    typeof data.location === "object"
      ? data.location?.address || "Online"
      : data.location || "Online";
  return (
    <TouchableOpacity
      style={styles.peopleRow}
      onPress={() => ctx.openEvents()}
      activeOpacity={0.8}
    >
      <View style={styles.avatarBubble}>
        {data.cover_image_url ? (
          <Image
            source={{ uri: data.cover_image_url }}
            style={styles.avatarImg}
          />
        ) : (
          <Text style={{ fontSize: 18 }}>📅</Text>
        )}
      </View>
      <View style={styles.peopleInfo}>
        <Text style={styles.peopleName}>{data.title}</Text>
        <Text style={styles.peopleHandle}>{location}</Text>
        <Text style={styles.peopleMeta}>
          {data.attendee_count || 0} attending ·{" "}
          {data.event_type || "event"}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.text.muted}
      />
    </TouchableOpacity>
  );
};

const GameRow = ({ data, ctx }: RowProps) => {
  const { styles, colors } = ctx;
  const thumbnail = data.thumbnail;
  return (
    <TouchableOpacity
      style={styles.peopleRow}
      onPress={() => ctx.openGames()}
      activeOpacity={0.8}
    >
      <View style={styles.avatarBubble}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.avatarImg} />
        ) : (
          <Text style={{ fontSize: 18 }}>🎮</Text>
        )}
      </View>
      <View style={styles.peopleInfo}>
        <Text style={styles.peopleName}>{data.name}</Text>
        <Text style={styles.peopleHandle}>
          {[data.category, data.difficulty].filter(Boolean).join(" · ") ||
            "Play now"}
        </Text>
        <Text style={styles.peopleMeta}>
          Up to {data.maxPlayers || 2} players
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.text.muted}
      />
    </TouchableOpacity>
  );
};

// A comment matched (or lives on a matched post) — show the comment with its
// parent post as context; tapping opens the post's detail.
const CommentRow = ({ data, ctx }: RowProps) => {
  const { styles, colors } = ctx;
  return (
    <TouchableOpacity
      style={styles.peopleRow}
      onPress={() =>
        // PostDetail re-fetches the full post by id on mount, so a
        // minimal { id } payload is enough to deep-link.
        ctx.openPost({ id: data.post_id })
      }
      activeOpacity={0.8}
    >
      <View style={styles.avatarBubble}>
        {data.author_avatar ? (
          <Image
            source={{ uri: data.author_avatar }}
            style={styles.avatarImg}
          />
        ) : (
          <Text style={{ fontSize: 18 }}>💬</Text>
        )}
      </View>
      <View style={styles.peopleInfo}>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={styles.peopleName} numberOfLines={1}>
            {data.author_name || "User"}
          </Text>
          <Text style={styles.peopleHandle} numberOfLines={1}>
            {"  ·  "}
            {data.community_name || data.community_slug || "comment"}
          </Text>
        </View>
        <Text
          style={styles.commentContent}
          numberOfLines={3}
        >
          {data.content}
        </Text>
        <Text style={styles.peopleMeta} numberOfLines={1}>
          on “{data.post_title || "a post"}” ·{" "}
          {data.likes_count || 0} likes
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.text.muted}
      />
    </TouchableOpacity>
  );
};

// A media item from a matched post — thumbnail + post context; tapping opens
// the post's detail.
const MediaRow = ({ data, ctx }: RowProps) => {
  const { styles, colors } = ctx;
  const mediaUri =
    data.cloudfront_url ||
    data.vimeo_thumbnail_url ||
    data.vimeo_player_url ||
    data.vimeo_uri ||
    "";
  return (
    <TouchableOpacity
      style={styles.peopleRow}
      onPress={() => ctx.openPost({ id: data.post_id })}
      activeOpacity={0.8}
    >
      <View style={styles.mediaThumbWrap}>
        {mediaUri ? (
          <Image source={{ uri: mediaUri }} style={styles.mediaThumb} />
        ) : (
          <Ionicons
            name={
              data.media_type === "video"
                ? "videocam"
                : data.media_type === "audio"
                  ? "musical-notes"
                  : "image"
            }
            size={18}
            color={colors.text.muted}
          />
        )}
      </View>
      <View style={styles.peopleInfo}>
        <Text style={styles.peopleName} numberOfLines={1}>
          {data.post_title || "Media post"}
        </Text>
        <Text style={styles.peopleHandle} numberOfLines={1}>
          {data.author_name || "User"}
          {data.community_name ? ` · ${data.community_name}` : ""}
        </Text>
        <Text style={styles.peopleMeta} numberOfLines={1}>
          {(data.media_type || "media").toUpperCase()}
          {data.width && data.height
            ? ` · ${data.width}×${data.height}`
            : ""}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.text.muted}
      />
    </TouchableOpacity>
  );
};

// A text row from the server — currently matched hashtags. Tapping commits it
// as a #tag filter chip and searches.
const TextRow = ({ data, ctx }: RowProps) => {
  const { styles } = ctx;
  return (
    <TouchableOpacity
      style={styles.hashtagRow}
      onPress={() => {
        const t = String(data.text || "").replace(/^#/, "");
        if (t) ctx.addHashtag(t);
      }}
      activeOpacity={0.8}
    >
      <View style={styles.hashIconBubble}>
        <Text style={styles.hashIcon}>#</Text>
      </View>
      <Text style={styles.hashtagText}>{data.text}</Text>
    </TouchableOpacity>
  );
};

const SettingsRow = ({ data, ctx }: RowProps) => {
  const { styles, colors, navigation } = ctx;
  return (
    <TouchableOpacity
      style={styles.peopleRow}
      onPress={() => {
        if (data.action === "logout" || data.action === "delete") {
          (navigation as any).navigate("Settings");
        } else if (data.route) {
          (navigation as any).navigate(data.route);
        }
      }}
      activeOpacity={0.8}
    >
      <View style={[styles.avatarBubble, { backgroundColor: colors.bg.surface }]}>
        <Ionicons name={data.icon as any} size={20} color={colors.text.secondary} />
      </View>
      <View style={styles.peopleInfo}>
        <Text style={styles.peopleName}>{data.title}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
    </TouchableOpacity>
  );
};

const NotificationRow = ({ data, ctx }: RowProps) => {
  const { styles, colors } = ctx;
  return (
    <TouchableOpacity
      style={styles.peopleRow}
      onPress={() => ctx.openNotifications()}
      activeOpacity={0.8}
    >
      <View style={styles.avatarBubble}>
        {data.avatarUrl ? (
          <Image source={{ uri: data.avatarUrl }} style={styles.avatarImg} />
        ) : (
          <Text style={{ fontSize: 18 }}>{data.avatar || "👾"}</Text>
        )}
      </View>
      <View style={[styles.peopleInfo, { flex: 1 }]}>
        <Text style={styles.peopleName} numberOfLines={1}>{data.actor}</Text>
        <Text style={styles.peopleHandle} numberOfLines={2}>{data.text}</Text>
      </View>
      <Text style={{ fontSize: 12, color: colors.text.muted, marginLeft: 8 }}>{data.time}</Text>
    </TouchableOpacity>
  );
};

// Wallet scope — a cash/XP transaction row. Matches the wallet tab's styling
// (amount + currency color, type badge).
const TransactionRow = ({ data, ctx }: RowProps) => {
  const { styles, colors } = ctx;
  const txn = data as Transaction;
  const isXP = txn.currency === "XP";
  const isNeg =
    txn.amount < 0 || txn.type === "spend" || txn.type === "withdraw";
  const displayAmount = Math.abs(txn.amount || 0);
  return (
    <View style={styles.peopleRow}>
      <View
        style={[
          styles.avatarBubble,
          { backgroundColor: colors.bg.surface },
        ]}
      >
        <Ionicons
          name={isXP ? "flash-outline" : "wallet-outline"}
          size={20}
          color={isXP ? colors.xpGold : colors.text.secondary}
        />
      </View>
      <View style={styles.peopleInfo}>
        <Text style={styles.peopleName} numberOfLines={1}>
          {txn.title}
        </Text>
        <Text style={styles.peopleHandle} numberOfLines={1}>
          {txn.date}
          {txn.status === "pending"
            ? " · Pending"
            : txn.status === "failed"
              ? " · Failed"
              : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text
          style={{
            fontSize: fontSizes.md,
            fontWeight: "700",
            color: isXP
              ? colors.xpGold
              : isNeg
                ? colors.danger
                : colors.success,
          }}
        >
          {isXP
            ? `${isNeg ? "-" : "+"}${displayAmount.toLocaleString()} XP`
            : isNeg
              ? `-₹${displayAmount.toLocaleString()}`
              : `+₹${displayAmount.toLocaleString()}`}
        </Text>
        <Text style={[styles.peopleMeta, { fontSize: 11 }]}>
          {txn.type}
        </Text>
      </View>
    </View>
  );
};

// Fallback for backend result kinds that don't have a dedicated renderer yet.
// A readable card showing the type name (the backend stamps `itemType` on
// every row) plus the item's title, so new backend groups appear as proper
// cards instead of a bare line of text.
export const GenericRow = ({ data, ctx }: RowProps) => {
  const { styles, colors } = ctx;
  const typeLabel = String(data?.itemType || "")
    .replace(/[_-]+/g, " ")
    .trim();
  const title = data?.name || data?.title || data?.text || "Result";
  return (
    <View style={styles.genericRow}>
      <View style={styles.genericIconBubble}>
        <Ionicons name="apps-outline" size={18} color={colors.text.muted} />
      </View>
      <View style={styles.peopleInfo}>
        {typeLabel ? (
          <Text style={styles.genericTypeLabel}>{typeLabel}</Text>
        ) : null}
        <Text style={styles.peopleName} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.peopleMeta}>New result type</Text>
      </View>
    </View>
  );
};

// The declarative dispatch: add a backend group → add a component + one entry.
// Unknown types render the generic fallback (never a crash, never a blank row).
export const ROW_RENDERERS: Record<string, React.FC<RowProps>> = {
  posts: PostRow,
  post: PostRow,
  polls: PollRow,
  poll: PollRow,
  people: PeopleRow,
  profile: PeopleRow,
  profiles: PeopleRow,
  communities: CommunityRow,
  community: CommunityRow,
  events: EventRow,
  event: EventRow,
  games: GameRow,
  game: GameRow,
  comments: CommentRow,
  comment: CommentRow,
  media: MediaRow,
  text: TextRow,
  settings_item: SettingsRow,
  notification_item: NotificationRow,
  transaction_item: TransactionRow,
};
