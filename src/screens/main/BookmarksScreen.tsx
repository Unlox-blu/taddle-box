import React, { useMemo, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, FlatList, ScrollView } from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  useNavigation,
  useFocusEffect,
  useIsFocused,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fontSizes, spacing, type ColorPalette } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import MainHeader from "../../components/common/MainHeader";
import { SectionHeader } from "../../components/common/SectionChrome";
import { bookmarkService } from "../../services/bookmark.service";
import type { HomeStackParamList } from "../../types";
import PullToRefreshWrapper from "../../components/common/PullToRefreshWrapper";
import StateBlock from "../../components/common/StateBlock";
import CommentsModal from "../../components/home/CommentsModal";
import ShareSheet from "../../components/common/ShareSheet";
import { useGlobalScroll } from "../../context/ScrollContext";
import {
  ROW_RENDERERS,
  GenericRow,
  type RowCtx,
} from "../../components/search/SearchRows";
import { makeStyles as makeSearchStyles } from "../../components/search/searchStyles";
import { useToggleLike, useToggleSave } from "../../mutations/posts";
import { useActivePostTracking } from "../../hooks/useActivePostTracking";
import { warn } from '../../utils/logger';

type NavProp = NativeStackNavigationProp<HomeStackParamList, "Bookmarks">;

type ResultType = string;

interface Row {
  isHeader: boolean;
  item: any;
  type: ResultType;
}

function rowKey(row: Row): string | null {
  if (row.isHeader) return null;
  const it = row.item;
  const id = it?.id ?? it?.media_id ?? it?.text ?? it?.username ?? it?.slug;
  if (!id) return null;
  return `${row.type}:${id}`;
}

// Height estimate for SectionHeader (title + subtitle) only — no pills row.
// Pulled from SectionChrome: header paddingTop 16 + paddingBottom 12 + ~34px
// text row ≈ 62px. OnLayout refines it.
const SECTION_HEADER_H = 62;

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c?.bg?.base },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 48,
      paddingBottom: 80,
    },
    emptyEmoji: { fontSize: 56, marginBottom: spacing.lg },
    emptyTitle: {
      fontSize: fontSizes.xl,
      fontWeight: "800",
      color: c?.text?.primary,
      textAlign: "center",
      marginBottom: spacing.sm,
    },
    emptyDesc: {
      fontSize: fontSizes.sm,
      color: c?.text?.muted,
      textAlign: "center",
      lineHeight: 20,
    },
  });
}

export default function BookmarksScreen() {
  const navigation = useNavigation<NavProp>();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const searchStyles = useMemo(() => makeSearchStyles(colors), [colors]);
  const isFocused = useIsFocused();
  const { user: currentUser } = useAuth();
  const { footerHeight } = useGlobalScroll();

  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const searchReqRef = useRef(0);

  const [serverTypes, setServerTypes] = useState<string[]>([]);
  // Pass ALL rows so accumulated heights account for non-post rows
  // (headers, people, communities) that take up scroll space.
  const hookRows = rows.map((r: any, i: number) => ({
    id: r.isHeader ? `__header_${r.type}_${i}` : (r.item?.id ?? `__row_${i}`),
    _row: r,
  }));
  const { activePostId, viewabilityConfig, onViewableItemsChanged,
          trackLayout: rawTrackLayout, handleScroll: handleScrollForTracking } =
    useActivePostTracking(hookRows, {
      getPostId: (row: any) => {
        // FlashList passes raw Row objects; hook may also pass wrapped hookRows
        const r = row._row ?? row;
        // By returning an ID for EVERYTHING (not just posts), non-post items 
        // (headers, people) can become the "active" item when in the center.
        // This naturally pauses any video post that gets pushed out of the center.
        if (r.isHeader) {
           const idx = rows.indexOf(r);
           return `__header_${r.type}_${idx}`;
        }
        return r.item?.id ?? null;
      },
    });
  // Wrap trackLayout: SearchRows calls it with post.id, but the hook
  // accumulates heights by hookRow.id. Map one to the other.
  const trackLayout = useCallback((id: string, rect: { top: number; bottom: number }) => {
    const hookRow = hookRows.find((hr: any) => hr.id === id || hr._row?.item?.id === id);
    if (hookRow) rawTrackLayout(hookRow.id, rect);
    else rawTrackLayout(id, rect);
  }, [hookRows, rawTrackLayout]);

  const { mutate: toggleLike } = useToggleLike();
  const { mutate: toggleSave } = useToggleSave();

  const [commentsVisible, setCommentsVisible] = useState(false);
  const [activeCommentPost, setActiveCommentPost] = useState<any>(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [sharePost, setSharePost] = useState<any>(null);

  const fetchBookmarks = useCallback(async (pageToLoad = 1, append = false) => {
    const reqId = ++searchReqRef.current;
    if (!append) setIsLoading(true);

    try {
      const res = await bookmarkService.getBookmarks(pageToLoad, 20);

      if (searchReqRef.current !== reqId) return;

      setHasMore(res.hasNext);
      setPage(res.page);
      if (res.types && res.types.length > 0) {
        setServerTypes(res.types);
      }

      const newRows: Row[] = (res.results || []).map((item: any) => ({
        isHeader: false,
        item,
        type: (item.type || item.itemType || item.item_type || "unknown") as ResultType,
      }));

      setRows((prev) => {
        const merged = append ? [...prev, ...newRows] : newRows;
        const seen = new Set<string>();
        const unique = merged.filter((row: Row) => {
          const key = rowKey(row);
          if (key === null) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return unique;
      });
      setHasMore(res.hasNext);
      setPage(res.page);
    } catch (e) {
      warn("Failed to load bookmarks", e);
    } finally {
      if (searchReqRef.current === reqId) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBookmarks(1, false);
  }, [fetchBookmarks]);

  // ── Video preload: direction-aware ────────────────────────────────
  const lastScrollYRef = useRef(0);
  const scrollDirRef = useRef<1 | -1>(1);

  const preloadPostId = useMemo(() => {
    if (!activePostId) return null;
    const activeIdx = rows.findIndex(
      (r) => !r.isHeader && (r.item as any)?.id === activePostId,
    );
    if (activeIdx < 0) return null;

    const dir = scrollDirRef.current;
    const scan = (start: number, step: number) => {
      for (let i = start; i >= 0 && i < rows.length; i += step) {
        const r = rows[i] as any;
        if (r.isHeader) continue;
        if (r.type !== "posts" && r.type !== "post") continue;
        const hasVid = r.item?.media?.some?.((m: any) => m.media_type === "video");
        if (hasVid) return r.item.id as string;
      }
      return null;
    };

    const found = dir === 1
      ? scan(activeIdx + 1, 1)
      : scan(activeIdx - 1, -1);
    if (found) return found;
    return dir === 1 ? scan(activeIdx - 1, -1) : scan(activeIdx + 1, 1);
  }, [rows, activePostId]);

  const rowCtx = useMemo<RowCtx>(
    () => ({
      styles: searchStyles,
      colors,
      navigation,
      isFocused,
      activePostId,
      currentUserId: currentUser?.id,
      toggleLike: (id, liked) => toggleLike({ id, isCurrentlyLiked: liked }),
      toggleSave: (id, saved) => toggleSave({ id, isCurrentlySaved: saved }),
      patchPost: () => {},
      sharePost: (post: any) => { setSharePost(post); setShareVisible(true); },
      reportPost: () => {},
      refresh: handleRefresh,
      openPost: (p) => {
        // Extract post-type bookmarks to seed the reel with the saved posts in order.
        const bookmarkPosts = rows
          .filter((r) => !r.isHeader && (r.type === 'posts' || r.type === 'post'))
          .map((r) => r.item as any);
        navigation.push("PostDetail", {
          post: p,
          feedPosts: bookmarkPosts.length > 0 ? bookmarkPosts : undefined,
          feedContext: 'bookmarks',
        });
      },
      openComments: (p: any) => { setActiveCommentPost(p); setCommentsVisible(true); },
      openUser: (u) => navigation.push("UserProfile", { user: u }),
      openCommunity: (slug) =>
        (navigation as any).navigate("Community", {
          screen: "CommunityDetail",
          params: { communitySlug: slug },
        }),
      openGames: () => {},
      openEvents: () => {},
      openSettings: () => (navigation as any).navigate("Settings"),
      openNotifications: () => (navigation as any).navigate("Notifications"),
      addHashtag: () => {},
      trackLayout,
      preloadPostId,
      feedPosts: rows.filter((r) => !r.isHeader && (r.type === 'posts' || r.type === 'post')).map((r) => r.item),
      feedContext: 'bookmarks' as const,
    }),
    [
      searchStyles,
      colors,
      navigation,
      isFocused,
      activePostId,
      currentUser?.id,
      toggleLike,
      toggleSave,
      handleRefresh,
      trackLayout,
      preloadPostId,
      rows,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      const task =
        require("react-native").InteractionManager.runAfterInteractions(() => {
          fetchBookmarks(1, false);
        });
      return () => task.cancel();
    }, [fetchBookmarks]),
  );

  // ── Section header — passed to PullToRefreshWrapper ──
  // SectionChrome positions this absolutely below MainHeader. It hides/shows
  // with scroll in lockstep with MainHeader.
  const sectionHeader = (
    <SectionHeader title="Bookmarks" subtitle={`${rows.length} saved`} />
  );

  const renderItem = ({ item: row }: { item: Row }) => {
    if (row.isHeader) return null;
    const Renderer =
      ROW_RENDERERS[row.type] || ROW_RENDERERS[row.type + "s"] || GenericRow;
    return <Renderer data={row.item} ctx={rowCtx} />;
  };

  return (
    <View style={styles.container}>
      <MainHeader showBack />

      <PullToRefreshWrapper
          refreshing={refreshing}
          onRefresh={handleRefresh}
          sectionHeaderH={SECTION_HEADER_H}
          sectionHeader={sectionHeader}
        >
          {isLoading && rows.length === 0 ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
              <StateBlock loading style={{ flex: 1, paddingTop: 100 }} />
            </ScrollView>
          ) : rows.length === 0 ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>🔖</Text>
                <Text style={styles.emptyTitle}>No bookmarks yet</Text>
                <Text style={styles.emptyDesc}>
                  Tap the bookmark icon on any post, profile, or community to save
                  it here for later.
                </Text>
              </View>
            </ScrollView>
          ) : (
            <FlashList
              data={rows}
              keyExtractor={(row, idx) => rowKey(row) || idx.toString()}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              alwaysBounceVertical
              contentContainerStyle={{ paddingBottom: footerHeight + 20 }}
              onEndReached={() => {
                if (hasMore) fetchBookmarks(page + 1, true);
              }}
              onEndReachedThreshold={0.4}
              renderItem={renderItem}
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              onScroll={(e) => {
                const y = e.nativeEvent.contentOffset.y;
                if (y > lastScrollYRef.current + 2) scrollDirRef.current = 1;
                else if (y < lastScrollYRef.current - 2) scrollDirRef.current = -1;
                lastScrollYRef.current = y;
                handleScrollForTracking(e);
              }}
              scrollEventThrottle={16}
            />
          )}
        </PullToRefreshWrapper>

      <CommentsModal
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        post={activeCommentPost}
      />

      <ShareSheet
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        postId={sharePost?.id}
        postTitle={sharePost?.title || ''}
      />
    </View>
  );
}
