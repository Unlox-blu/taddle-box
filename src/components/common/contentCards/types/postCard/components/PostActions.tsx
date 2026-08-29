import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Modal,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  TextInput,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import StateBlock from '../../../../StateBlock';
import { useQueryClient } from "@tanstack/react-query";
import { radii, fontSizes, spacing, type ColorPalette } from "../../../../../../theme";
import { useAuth } from "../../../../../../context/AuthContext";
import type { Post } from "../../../../../../types";
import { postsService } from "../../../../../../services/posts.service";
import { userService } from "../../../../../../services/user.service";
import { queryKeys } from "../../../../../../lib/queryKeys";
import SmartInput from "../../../../SmartInput";
import { AudiencePickerList } from "../../../../AudiencePicker";
import { useMyCommunities } from "../../../../../../queries/communities";
import { themedAlert } from "../../../../ThemedAlert";
import PostMenuSheet from "../../../../../home/PostMenuSheet";
import { RollingText } from "./shared";
import type { PostHeaderAuthor } from "./PostHeader";
import type { PostCardStyles } from "./shared";

// ── Repost audience sentinel ────────────────────────────────────────────────
const REPOST_FEED_AUDIENCE = "__feed__";

interface PostActionsProps {
  post: Post;
  postId: string;
  author: PostHeaderAuthor;
  displayLikes: number;
  displayComments: number;
  displayShares: number;
  onLike: () => void;
  onComment?: (post: Post) => void;
  onShare?: (post: Post) => void;
  onSave?: (id: string) => void;
  onReposted?: (post: any) => void;
  showViews?: boolean;
  colors: ColorPalette;
  styles: PostCardStyles;
  /** Callback to invalidate + flip repost state across caches. */
  flipRepostInCaches: (nextReposted: boolean, deltaShares: number) => void;
  /** External menu visibility — toggled by the ⋯ button in PostHeader. */
  showMenu?: boolean;
  onMenuToggle?: () => void;
  onDelete?: (post: Post) => void;
  onReport?: (post: Post) => void;
  showDelete?: boolean;
  onCloseMenu?: () => void;
  onBodyTap?: () => void;
}

// ── UsersModal ──────────────────────────────────────────────────────────────
function UsersModal({
  visible,
  postId: pid,
  title,
  emptyText,
  fetchPage,
  onClose,
}: {
  visible: boolean;
  postId: string;
  title: string;
  emptyText: string;
  fetchPage: (id: string, page: number, limit: number, search?: string) => Promise<{ data: any[] }>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const navigation = useNavigation<any>();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const load = async (nextPage: number, refresh = false, searchStr = debouncedSearch) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetchPage(pid, nextPage, 20, searchStr);
      const rows = res?.data || [];
      setHasMore(rows.length === 20);
      setUsers((prev) => (refresh ? rows : [...prev, ...rows]));
      setPage(nextPage);
    } catch (e) {
      warn("Failed to load users", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  React.useEffect(() => {
    if (visible) {
      setUsers([]);
      setPage(1);
      setHasMore(false);
      load(1, true);
    }
  }, [visible, debouncedSearch]);

  // On Android, KeyboardAvoidingView inside Modal is unreliable.
  // Track keyboard height manually and push the sheet up.
  const [kbHeight, setKbHeight] = React.useState(0);
  React.useEffect(() => {
    if (!visible) return;
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKbHeight(e.endCoordinates?.height ?? 0),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKbHeight(0),
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}
      >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              maxHeight: "72%",
              height: "auto",
              marginBottom: kbHeight,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              borderWidth: 1,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: 24,
              backgroundColor: colors.bg.card,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
              <Text style={{ fontSize: fontSizes.lg, fontWeight: "800", color: colors.text.primary }}>{title}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={colors.text.muted} />
              </TouchableOpacity>
            </View>

            <TextInput
              placeholder="Search…"
              placeholderTextColor={colors.text.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radii.md,
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: fontSizes.sm,
                color: colors.text.primary,
                backgroundColor: colors.bg.surface,
                marginBottom: spacing.sm,
              }}
            />

            <FlatList
              data={users}
              keyExtractor={(item: any) => String(item.id || item.userId || Math.random())}
              renderItem={({ item: u }: any) => {
                const isSelf = String(u.id || u.userId) === String(currentUser?.id);
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(124,58,237,0.12)", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      {u.avatarUrl || u.avatar_url ? (
                        <Image source={{ uri: u.avatarUrl || u.avatar_url }} style={{ width: 36, height: 36 }} />
                      ) : (
                        <Text style={{ fontSize: 16 }}>{u.avatar || "👾"}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => {
                        onClose();
                        navigation.push("UserProfile", { user: u } as any);
                      }}
                    >
                      <Text style={{ fontSize: fontSizes.sm, fontWeight: "700", color: colors.text.primary }} numberOfLines={1}>
                        {u.name || u.username}
                      </Text>
                      <Text style={{ fontSize: fontSizes.xs, color: colors.text.muted }}>@{u.username}</Text>
                    </TouchableOpacity>
                    {!isSelf && (
                      <TouchableOpacity
                        style={{ backgroundColor: "#7C3AED", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 16 }}
                        onPress={async () => {
                          try {
                            if (u.isFollowing) {
                              await userService.unfollowUser(u.username);
                            } else {
                              await userService.followUser(u.username);
                            }
                            setUsers((prev) =>
                              prev.map((x) =>
                                String(x.id || x.userId) === String(u.id || u.userId)
                                  ? { ...x, isFollowing: !x.isFollowing }
                                  : x,
                              ),
                            );
                          } catch (e) {
                            warn("Follow toggle failed", e);
                          }
                        }}
                      >
                        <Text style={{ color: "#fff", fontSize: fontSizes.sm, fontWeight: "700" }}>
                          {u.isFollowing ? "Unfollow" : "Follow"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
              onEndReached={() => {
                if (hasMore && !loading) load(page + 1);
              }}
              onEndReachedThreshold={0.3}
              ListFooterComponent={loading ? <StateBlock inline loading loaderSize={18} style={{ marginVertical: 12 }} /> : null}
              ListEmptyComponent={!loading ? <Text style={{ textAlign: "center", paddingVertical: 28, fontSize: fontSizes.sm, color: colors.text.muted }}>{emptyText}</Text> : null}
            />
          </View>
      </TouchableOpacity>
    </Modal>
  );
}

import { Image } from "expo-image";
import { useThemeColors } from "../../../../../../context/ThemeContext";
import { warn } from '../../../../../../utils/logger';

function PostActionsInner({
  post,
  postId,
  author,
  displayLikes,
  displayComments,
  displayShares,
  onLike,
  onComment,
  onShare,  onSave,
  onReposted,
  showViews,
  colors,
  styles: s,
  flipRepostInCaches,
  showMenu: showMenuProp,
  onMenuToggle,
  onDelete,
  onReport,
  showDelete,
  onCloseMenu,
  onBodyTap,
}: PostActionsProps) {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const navigation = useNavigation<any>();

  // Use external showMenu if provided (from PostHeader's ⋯ button), else internal.
  const [internalShowMenu, setInternalShowMenu] = useState(false);
  const showMenu = showMenuProp ?? internalShowMenu;


  // ── Modal visibility state ──────────────────────────────────────────────
  const [likersVisible, setLikersVisible] = useState(false);
  const [repostersVisible, setRepostersVisible] = useState(false);
  const [votersOption, setVotersOption] = useState<number | null>(null);

  // ── Repost state ────────────────────────────────────────────────────────
  const [repostSheetVisible, setRepostSheetVisible] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [repostBusy, setRepostBusy] = useState(false);
  const [repostCommunityId, setRepostCommunityId] = useState<string | null>(null);
  const [repostCommunityName, setRepostCommunityName] = useState<string | null>(null);
  const [audienceExpanded, setAudienceExpanded] = useState(false);
  const [repostAudienceError, setRepostAudienceError] = useState<string | null>(null);
  const repostAudienceAnim = useRef(new Animated.Value(0)).current;
  const repostAudienceOpacity = useRef(new Animated.Value(0)).current;
  const repostAudienceTimer = useRef<any>(null);
  // Long-press lit animation for the repost icon
  const repostLitAnim = useRef(new Animated.Value(0)).current;
  const repostLitScale = useRef(new Animated.Value(1)).current;

  const myCommunities = useMyCommunities(repostSheetVisible);
  const repostCommunities = myCommunities.filter(
    (c) => c.isJoined || c.ownerId === currentUser?.id,
  );

  const communityRepostsEnabled =
    typeof post.community !== "object" || !post.community
      ? true
      : (post.community as any)?.repostsEnabled !== false;

  const canSubmitNewRepost =
    author.repostsEnabled !== false && communityRepostsEnabled;

  const extractQuoteTags = (raw: string): string[] => {
    const plainText = raw.replace(/\{#\}\[([^\]]+)\]\([^)]+\)/g, "#$1");
    return Array.from(
      new Set(
        Array.from(plainText.matchAll(/(?:^|\\s)(#[a-z0-9_]+)/gi)).map((m) =>
          m[1].replace("#", "").toLowerCase(),
        ),
      ),
    );
  };
  const extractQuoteMentions = (raw: string): string[] => {
    const matches = Array.from(
      raw.matchAll(/\{@\}\[([^\]]+)\]\(([^)]+)\)/g),
    );
    return Array.from(new Set(matches.map((m) => m[2])));
  };

  const showRepostAudienceError = () => {
    const isPrivateAccount = (currentUser as any)?.privacy === "private";
    const msg = isPrivateAccount
      ? "Choose where to post — Followers or a Community"
      : "Choose where to post — Public or a Community";
    setRepostAudienceError(msg);
    if (repostAudienceTimer.current) clearTimeout(repostAudienceTimer.current);
    repostAudienceAnim.setValue(0);
    Animated.sequence([
      Animated.timing(repostAudienceAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(repostAudienceAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(repostAudienceAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(repostAudienceAnim, { toValue: -4, duration: 60, useNativeDriver: true }),
      Animated.timing(repostAudienceAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
    repostAudienceOpacity.setValue(0);
    Animated.spring(repostAudienceOpacity, {
      toValue: 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
    repostAudienceTimer.current = setTimeout(() => {
      Animated.timing(repostAudienceOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => setRepostAudienceError(null));
    }, 2600);
  };

  const doRepost = async (content?: string) => {
    if (repostBusy) return;
    if (!repostCommunityId) {
      setAudienceExpanded(true);
      showRepostAudienceError();
      return;
    }
    setRepostBusy(true);
    try {
      const res = await postsService.repostPost(postId, content, {
        tags: content ? extractQuoteTags(content) : [],
        mentions: content ? extractQuoteMentions(content) : [],
        communityId: repostCommunityId === REPOST_FEED_AUDIENCE ? undefined : repostCommunityId,
      });
      setRepostSheetVisible(false);
      setQuoteText("");
      flipRepostInCaches(true, 1);
      onReposted?.(res?.data || null);
      queryClient.invalidateQueries({ queryKey: queryKeys.feed });
    } catch (e) {
      flipRepostInCaches(false, -1);
      const msg =
        (e as any)?.response?.data?.message || "Failed to repost. Please try again.";
      themedAlert("Error", msg);
      warn("Repost failed", e);
    } finally {
      setRepostBusy(false);
    }
  };

  const handleRepostToggle = () => {
    setRepostCommunityId(null);
    setRepostCommunityName(null);
    setAudienceExpanded(false);
    setRepostAudienceError(null);
    setRepostSheetVisible(true);
  };

  const handleRepostLongPress = () => {
    // Brief "lit" flash animation then open the reposters list
    Animated.sequence([
      Animated.parallel([
        Animated.timing(repostLitAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.spring(repostLitScale, { toValue: 1.3, speed: 20, bounciness: 8, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(repostLitAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.spring(repostLitScale, { toValue: 1, speed: 12, bounciness: 6, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setRepostersVisible(true);
    });
  };

  const handleViewMyReposts = () => {
    setRepostSheetVisible(false);
    const people = [
      currentUser?.username,
      author.username && author.username !== "unknown" ? author.username : "",
    ].filter(Boolean);
    const params: any = { tab: "f-all" };
    if (people.length) params.authorFilter = people.join(",");
    const text = String((post as any)?.title || "")
      .replace(/\{#\}\[([^\]]+)\]\([^)]+\)/g, "#$1")
      .replace(/\{@\}\[([^\]]+)\]\([^)]+\)/g, "@$1")
      .trim();
    if (text) params.query = text;
    navigation.navigate("Search", params);
  };

  // ── Menu options ────────────────────────────────────────────────────────
  const [pollData, setPollData] = useState((post as any)?.pollData || null);
  const menuOptions = useMemo(() => {
    const opts: { icon: string; label: string; color?: string; onPress: () => void }[] = [];
    const postAuthorId = (post as any)?.author?.id || (post as any)?.authorId || (post as any)?.author_id || "";
    const isAuthor = !!postAuthorId && String(postAuthorId) === String(currentUser?.id);
    if (pollData && !pollData.closed && isAuthor) {
      opts.push({
        icon: "bar-chart-outline",
        label: "Close poll",
        onPress: async () => {
          if (!postId || !pollData) return;
          themedAlert(
            "Close poll?",
            `Voting will be locked — ${pollData.options?.length || 0} option(s) keep their current tallies and nobody can vote anymore. This can't be undone.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Close poll",
                style: "destructive",
                onPress: async () => {
                  try {
                    const res = await postsService.closePoll(postId);
                    if (res?.data?.pollData) setPollData(res.data.pollData);
                  } catch (e: any) {
                    themedAlert("Error", e?.response?.data?.message || "Could not close the poll.");
                  }
                },
              },
            ],
          );
        },
      });
    }
    if (showDelete) {
      opts.push({
        icon: "trash-outline",
        label: "Delete",
        color: "#EF4444",
        onPress: () => {
          onCloseMenu?.();
          onDelete?.(post);
        },
      });
    }
    opts.push({
      icon: "flag-outline",
      label: "Report",
      color: "#EF4444",
      onPress: () => {
        onCloseMenu?.();
        themedAlert(
          "Report Post",
          "Thanks for helping keep Taddle safe. This post has been reported and is under review.",
        );
        onReport?.(post);
      },
    });
    return opts;
  }, [pollData, currentUser?.id, postId, post, showDelete, onDelete, onReport]);

  const origUnavailable = false;

  const renderAudienceSection = () => {
    const isPrivateAccount = (currentUser as any)?.privacy === "private";
    const feedLabel = isPrivateAccount ? "Followers" : "Public";
    const feedMeta = isPrivateAccount ? "Only your approved followers can see this" : "Anyone on Taddle can see this";
    const feedIcon = isPrivateAccount ? "lock-closed-outline" : "globe-outline";
    const feedSelected = repostCommunityId === REPOST_FEED_AUDIENCE;
    const selectedAudienceName = feedSelected
      ? feedLabel
      : repostCommunityId
        ? repostCommunityName || repostCommunities.find((c) => c.id === repostCommunityId)?.name || "Community"
        : null;

    return (
      <Animated.View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 10,
          marginTop: 4,
          transform: [{ translateX: repostAudienceAnim }],
        }}
      >
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}
          onPress={() => setAudienceExpanded((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons
              name={feedSelected ? feedIcon : repostCommunityId ? "people-outline" : "radio-button-off-outline"}
              size={16}
              color={repostCommunityId ? colors.primaryLight : colors.text.secondary}
            />
            <Text style={{ fontSize: fontSizes.sm, fontWeight: "800", color: colors.text.primary }}>Select audience</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={{ fontSize: fontSizes.xs, fontWeight: selectedAudienceName ? "700" : "500", color: selectedAudienceName ? colors.text.muted : "rgba(148,163,184,0.8)" }}
              numberOfLines={1}
            >
              {selectedAudienceName || "Not selected"}
            </Text>
            <Ionicons name={audienceExpanded ? "chevron-up" : "chevron-down"} size={15} color={colors.text.muted} />
          </View>
        </TouchableOpacity>

        {audienceExpanded && (
          <View style={{ marginTop: 6, height: 230 }}>
            <AudiencePickerList
              selectedId={feedSelected ? null : repostCommunityId === null ? undefined : repostCommunityId}
              onSelect={(id, comm) => {
                setRepostCommunityId(id === null ? REPOST_FEED_AUDIENCE : id);
                setRepostCommunityName(id ? (comm?.name || null) : null);
                setRepostAudienceError(null);
              }}
              feedLabel={feedLabel}
              feedMeta={feedMeta}
              feedIcon={feedIcon}
            />
          </View>
        )}

        {repostAudienceError && (
          <Animated.View
            pointerEvents="none"
            style={{
              marginTop: 8,
              alignSelf: "flex-start",
              minWidth: 150,
              backgroundColor: "rgba(239,68,68,0.95)",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
              shadowColor: "#EF4444",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35,
              shadowRadius: 10,
              elevation: 12,
              zIndex: 300,
              opacity: repostAudienceOpacity,
            }}
          >
            <Ionicons name="alert-circle" size={13} color="#fff" style={{ marginRight: 5 }} />
            <Text style={{ fontSize: fontSizes.xs, fontWeight: "700", color: "#fff", flexShrink: 1 }}>{repostAudienceError}</Text>
          </Animated.View>
        )}
      </Animated.View>
    );
  };

  return (
    <>
      {/* Actions row */}
      <TouchableWithoutFeedback onPress={() => onBodyTap?.()}>
        <View style={s.actions}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <TouchableOpacity style={s.action} onPress={onLike}>
              <Ionicons
                name={post.isLiked ? "heart" : "heart-outline"}
                size={20}
                color={post.isLiked ? colors.primaryLight : colors.text.muted}
              />
            </TouchableOpacity>
            <TouchableOpacity style={s.action} onPress={() => setLikersVisible(true)}>
              <Text style={[s.actionText, post.isLiked && { color: colors.primaryLight }]}>
                {displayLikes.toLocaleString()}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.action} onPress={() => onComment?.(post)}>
            <Ionicons name="chatbubble-outline" size={18} color={colors.text.muted} />
            <Text style={s.actionText}>{displayComments.toLocaleString()}</Text>
          </TouchableOpacity>

          {!post.repostOfId &&
            !origUnavailable &&
            (author.repostsEnabled !== false || post.repostedByMe) &&
            (communityRepostsEnabled || post.repostedByMe) && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity
                  style={s.action}
                  onPress={handleRepostToggle}
                  onLongPress={handleRepostLongPress}
                  delayLongPress={300}
                  disabled={repostBusy}
                >
                  {post.repostedByMe ? (
                    <Animated.View style={{ flexDirection: "row", alignItems: "center", gap: 2, transform: [{ scale: repostLitScale }], opacity: Animated.add(1, repostLitAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] })) }}>
                      <Ionicons name="repeat" size={19} color={colors.primaryLight} />
                    </Animated.View>
                  ) : (
                    <Animated.View style={{ flexDirection: "row", alignItems: "center", transform: [{ scale: repostLitScale }], opacity: repostLitAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }}>
                      <Ionicons name="repeat" size={19} color={colors.text.muted} />
                    </Animated.View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={s.action} onPress={() => setRepostersVisible(true)}>
                  <Text style={[s.actionText, post.repostedByMe && { color: colors.primaryLight }]}>
                    {displayShares.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

          <TouchableOpacity style={s.action} onPress={() => onShare?.(post)}>
            <Ionicons name="arrow-redo-outline" size={18} color={colors.text.muted} />
            <Text style={s.actionText}>Share</Text>
          </TouchableOpacity>

          {showViews && (
            <View style={s.action}>
              <Ionicons name="eye-outline" size={17} color={colors.text.muted} />
              <Text style={s.actionText}>{(post as any).viewsCount ?? (post as any).views ?? 0}</Text>
            </View>
          )}

          <View style={s.spacer} />

          <TouchableOpacity onPress={() => onSave?.(postId)}>
            <Ionicons
              name={post.isSaved ? "bookmark" : "bookmark-outline"}
              size={20}
              color={post.isSaved ? colors.primary : colors.text.muted}
            />
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>

      {/* Likers modal */}
      <UsersModal
        visible={likersVisible}
        postId={postId}
        title="Likes"
        emptyText="No likes yet."
        fetchPage={(id, page, limit) => postsService.getLikers(id, page, limit)}
        onClose={() => setLikersVisible(false)}
      />

      {/* Reposters modal */}
      <UsersModal
        visible={repostersVisible}
        postId={postId}
        title="Reposts"
        emptyText="No reposts yet."
        fetchPage={(id, page, limit) => postsService.getReposters(id, page, limit)}
        onClose={() => setRepostersVisible(false)}
      />

      {/* Poll voters modal */}
      {votersOption != null && pollData?.options?.[votersOption] ? (
        <UsersModal
          visible
          postId={postId}
          title={`Voters · ${(pollData.options[votersOption]?.text || `Option ${votersOption + 1}`).slice(0, 24)}`}
          emptyText="No votes on this option yet."
          fetchPage={(id, page, limit) => postsService.getPollVoters(id, votersOption!, page, limit)}
          onClose={() => setVotersOption(null)}
        />
      ) : null}

      {/* Repost sheet */}
      <Modal
        visible={repostSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRepostSheetVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
            <TouchableWithoutFeedback onPress={() => setRepostSheetVisible(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <View
              style={{
                borderTopLeftRadius: radii.xl,
                borderTopRightRadius: radii.xl,
                borderWidth: 1,
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
                paddingBottom: 32,
                maxHeight: "90%",
                backgroundColor: colors.bg.card,
                borderColor: colors.border,
              }}
            >
              <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginTop: 6, marginBottom: 10, backgroundColor: colors.borderHover }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
                <Text style={{ fontSize: fontSizes.lg, fontWeight: "800", color: colors.text.primary }}>Repost</Text>
                <TouchableOpacity
                  style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.elevated }}
                  onPress={() => setRepostSheetVisible(false)}
                >
                  <Ionicons name="close" size={18} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>

              <SmartInput
                style={{ color: colors.text.primary }}
                containerStyle={{ backgroundColor: colors.bg.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, minHeight: 60 }}
                placeholder="Quote something..."
                placeholderTextColor={colors.text.muted}
                multiline
                value={quoteText}
                onChange={setQuoteText}
                maxLength={500}
                suggestionPosition="top"
              />

              {renderAudienceSection()}

              {canSubmitNewRepost ? (
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 999, marginTop: 4, backgroundColor: colors.primary }}
                  disabled={repostBusy}
                  onPress={() => doRepost(quoteText.trim() || undefined)}
                >
                  <Ionicons name="repeat" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: fontSizes.md, fontWeight: "800" }}>
                    {repostBusy ? "Reposting…" : quoteText.trim() ? "Post" : "Repost"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    paddingVertical: 13,
                    borderRadius: 999,
                    borderWidth: 1,
                    marginTop: 4,
                    backgroundColor: colors.bg.surface,
                    borderColor: colors.border,
                  }}
                >
                  <Ionicons name="ban-outline" size={15} color={colors.text.muted} />
                  <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: colors.text.secondary }}>
                    {typeof post.community === "object" && post.community
                      ? "Reposting is disabled for this community's posts"
                      : "The author has disabled reposting on their posts"}
                  </Text>
                </View>
              )}

              {post.repostedByMe && (
                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    paddingVertical: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    marginTop: 10,
                    backgroundColor: colors.bg.surface,
                    borderColor: colors.border,
                  }}
                  onPress={handleViewMyReposts}
                >
                  <Ionicons name="repeat" size={16} color={colors.primaryLight} />
                  <Text style={{ fontSize: fontSizes.md, fontWeight: "700", color: colors.primaryLight }}>View my reposts</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Post overflow menu */}
      {showMenu && (
        <Modal transparent visible animationType="fade" onRequestClose={() => onCloseMenu?.()}>
          <PostMenuSheet visible onClose={() => onCloseMenu?.()} options={menuOptions} />
        </Modal>
      )}
    </>
  );
}

export default React.memo(PostActionsInner);
