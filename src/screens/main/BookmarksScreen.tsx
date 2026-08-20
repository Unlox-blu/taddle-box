import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet,
  FlatList
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fontSizes, spacing, type ColorPalette } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import MainHeader from '../../components/common/MainHeader';
import { SectionHeader } from '../../components/common/SectionChrome';
import { bookmarkService } from '../../services/bookmark.service';
import type { HomeStackParamList } from '../../types';
import PullToRefreshWrapper from "../../components/common/PullToRefreshWrapper";
import BrandedLoader from "../../components/common/BrandedLoader";
import {
  useGlobalScroll,
} from "../../context/ScrollContext";
import {
  ROW_RENDERERS,
  GenericRow,
  type RowCtx,
} from "../../components/search/SearchRows";
import { makeStyles as makeSearchStyles } from "../../components/search/searchStyles";
import { useToggleLike, useToggleSave } from "../../mutations/posts";

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'Bookmarks'>;

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
      flex: 1, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 48, paddingBottom: 80,
    },
    emptyEmoji: { fontSize: 56, marginBottom: spacing.lg },
    emptyTitle: {
      fontSize: fontSizes.xl, fontWeight: '800',
      color: c?.text?.primary, textAlign: 'center',
      marginBottom: spacing.sm,
    },
    emptyDesc: {
      fontSize: fontSizes.sm, color: c?.text?.muted,
      textAlign: 'center', lineHeight: 20,
    },

  });
}

export default function BookmarksScreen() {
  const navigation = useNavigation<NavProp>();
  const colors     = useThemeColors();
  const styles     = useMemo(() => makeStyles(colors), [colors]);
  const searchStyles = useMemo(() => makeSearchStyles(colors), [colors]);
  const isFocused  = useIsFocused();
  const { user: currentUser } = useAuth();
  const { footerHeight } = useGlobalScroll();





  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const searchReqRef = useRef(0);

  const [serverTypes, setServerTypes] = useState<string[]>([]);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const postRow = (viewableItems || []).find(
      (v: any) => v.item?.type === "posts" && v.isViewable
    );
    if (postRow) {
      const id = postRow.item.item.id;
      setActivePostId((prev) => (prev === id ? prev : id));
    }
  }).current;

  const { mutate: toggleLike } = useToggleLike();
  const { mutate: toggleSave } = useToggleSave();

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
        type: (item.itemType || "unknown") as ResultType,
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
      console.warn('Failed to load bookmarks', e);
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
      sharePost: () => {},
      reportPost: () => {},
      refresh: handleRefresh,
      openPost: (p) => navigation.push("PostDetail", { post: p }),
      openUser: (u) => navigation.push("UserProfile", { user: u }),
      openCommunity: (slug) => (navigation as any).navigate("Community", { screen: "CommunityDetail", params: { communitySlug: slug } }),
      openGames: () => {},
      openEvents: () => {},
      openSettings: () => (navigation as any).navigate("Settings"),
      openNotifications: () => (navigation as any).navigate("Notifications"),
      addHashtag: () => {},
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
    ]
  );

  useFocusEffect(
    useCallback(() => {
      fetchBookmarks(1, false);
    }, [fetchBookmarks])
  );



  // ── Section header — passed to PullToRefreshWrapper ──
  // SectionChrome positions this absolutely below MainHeader. It hides/shows
  // with scroll in lockstep with MainHeader.
  const sectionHeader = (
    <SectionHeader
      title="Bookmarks"
      subtitle={`${rows.length} saved`}
    />
  );

  const renderItem = ({ item: row }: { item: Row }) => {
    if (row.isHeader) return null;
    const Renderer = ROW_RENDERERS[row.type] || ROW_RENDERERS[row.type + 's'] || GenericRow;
    return (
      <View style={{ paddingHorizontal: spacing.md, marginVertical: spacing.xs }}>
        <Renderer data={row.item} ctx={rowCtx} />
      </View>
    );
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
          <View style={styles.empty}>
            <BrandedLoader size={44} />
            <Text style={[styles.emptyTitle, { fontSize: fontSizes.md, marginTop: spacing.md }]}>Loading...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🔖</Text>
            <Text style={styles.emptyTitle}>No bookmarks yet</Text>
            <Text style={styles.emptyDesc}>Tap the bookmark icon on any post, profile, or community to save it here for later.</Text>
          </View>
        ) : (
          <FlashList
            data={rows}
            keyExtractor={(row, idx) => rowKey(row) || idx.toString()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: footerHeight + 20 }}
            onEndReached={() => {
              if (hasMore) fetchBookmarks(page + 1, true);
            }}
            onEndReachedThreshold={0.4}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            scrollEventThrottle={16}
          />
        )}
      </PullToRefreshWrapper>
    </View>
  );
}
