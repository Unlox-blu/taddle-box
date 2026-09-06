import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { fontSizes, spacing, type ColorPalette } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import MainHeader from "../../components/common/MainHeader";
import { SectionHeader } from "../../components/common/SectionChrome";
import { useBookmarks } from "../../queries/feed";

import StateBlock from "../../components/common/StateBlock";
import SharedFeed from "../../components/common/SharedFeed";
import type { ContentItem } from "../../components/common/contentCards/content";
import type { Post } from "../../types";

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
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const {
    data: bookmarkPages,
    fetchNextPage,
    hasNextPage,
    refetch,
    isRefetching,
    isLoading,
  } = useBookmarks();

  const rows = useMemo<ContentItem[]>(() => {
    const rawPages = (bookmarkPages?.pages.flat() as any[]) || [];
    return rawPages
      .map((r) => {
        if (!r) return null;
        const itemData = r.data ? r.data : r;
        if (!itemData || (!itemData.id && !itemData._id && !r.id)) return null;
        const itemType = r.itemType || itemData.itemType || (itemData.pollData ? "poll" : "post");
        const id = String(r.id || itemData.id || itemData._id);
        return {
          id,
          itemType,
          data: itemData,
        } as ContentItem;
      })
      .filter((r): r is ContentItem => r !== null && !!r.data);
  }, [bookmarkPages]);

  const feedItems = useMemo(
    () =>
      rows
        .filter((r) => r.itemType === "post" || r.itemType === "poll")
        .map((r) => r.data)
        .filter((p) => !!p && !!p.id),
    [rows],
  );

  const sectionHeader = (
    <SectionHeader title="Bookmarks" subtitle={`${rows.length} saved`} />
  );

  const emptyState = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🔖</Text>
        <Text style={styles.emptyTitle}>No bookmarks yet</Text>
        <Text style={styles.emptyDesc}>
          Tap the bookmark icon on any post, profile, or community to save it
          here for later.
        </Text>
      </View>
    </ScrollView>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <MainHeader showBack />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
          <StateBlock loading style={{ flex: 1, paddingTop: 100 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MainHeader showBack />

      <SharedFeed
        items={rows}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={emptyState}
        sectionHeader={sectionHeader}
        sectionHeaderH={SECTION_HEADER_H}
        feedItems={feedItems}
        feedContext="bookmarks"
      />
    </View>
  );
}
