import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ListRenderItem,
  ImageBackground,
} from "react-native";
import StateBlock from '../common/StateBlock';
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import { highlightService, Highlight } from "../../services/highlight.service";

import { error } from '../../utils/logger';

const { width: SW } = Dimensions.get("window");
const CARD_W = SW - spacing.lg * 2;
const CARD_H = 168;
const ITEM_W = CARD_W + spacing.md;

// Number of times to repeat the data array for seamless infinite scroll.
// With 3 copies, the FlatList starts in the middle copy and can scroll
// in either direction before we silently recenter.
const REPEAT_COUNT = 3;

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { marginBottom: spacing.md, minHeight: CARD_H + 40 },
    sectionLabel: {
      fontSize: fontSizes.xs,
      fontWeight: "700",
      color: c.text.muted,
      letterSpacing: 0.5,
      paddingHorizontal: spacing.xl,
      marginBottom: 10,
    },
    card: {
      width: CARD_W,
      height: CARD_H,
      borderRadius: radii.lg,
      padding: spacing.lg,
      justifyContent: "flex-end",
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.border,
    },
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(0,0,0,0.4)",
    },
    tag: {
      position: "absolute",
      top: 14,
      right: 14,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radii.full,
      borderWidth: 1,
    },
    tagText: { fontSize: fontSizes.xs, fontWeight: "700" },
    emoji: { fontSize: 44, marginBottom: 6 },
    // Card text is always white because spotlight cards always have dark gradient backgrounds
    cardTitle: { fontSize: fontSizes.lg, fontWeight: "800", color: "#fff" },
    cardSubtitle: {
      fontSize: fontSizes.sm,
      color: "rgba(255,255,255,0.72)",
      marginTop: 2,
    },
    cardMeta: {
      fontSize: fontSizes.xs,
      color: "rgba(255,255,255,0.45)",
      marginTop: 4,
    },
    emptyContainer: {
      marginHorizontal: spacing.xl,
      marginBottom: spacing.md,
      borderRadius: radii.lg,
      overflow: "hidden",
      height: CARD_H,
      borderWidth: 1,
      borderColor: c.border,
    },
    emptyGradient: {
      flex: 1,
      padding: spacing.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyIconRing: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 1.5,
      borderColor: c.primaryDark,
      backgroundColor: "rgba(124,58,237,0.12)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.sm,
    },
    emptyTitle: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: c.text.primary,
      marginBottom: 4,
      letterSpacing: 0.2,
    },
    emptySub: {
      fontSize: fontSizes.xs,
      color: c.text.muted,
      textAlign: "center",
      lineHeight: 17,
    },
    emptyDots: {
      flexDirection: "row",
      gap: 4,
      marginTop: spacing.sm,
    },
    emptyDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.primaryDark,
    },
  });
}

export default function SpotlightCarousel() {
  const navigation = useNavigation<any>();
  const colors = useThemeColors();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const [spotlights, setSpotlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const flatRef = useRef<FlatList<Highlight>>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Position within the repeated array — always points forward.
  const scrollPosRef = useRef(0);

  useEffect(() => {
    fetchHighlights();
  }, []);

  const fetchHighlights = async () => {
    try {
      setLoading(true);
      const hlRes = await highlightService.getHighlights();
      const { spotlight = [], featuredEvents = [], trendingGames = [] } =
        hlRes.data || {};

      const eventHighlights: Highlight[] = (featuredEvents || []).map(ev => ({
        id: `event-${ev.id}`,
        title: ev.title,
        subtitle: ev.description || 'Upcoming Event',
        type: 'event',
        sourceId: ev.id,
        tag: 'Featured Event',
        tagColor: '#F59E0B',
        emoji: '🎉',
        gradient: ['#1A1200', '#78350F'],
        meta: new Date(ev.startTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        imageUrl: ev.coverImageUrl,
        rawEvent: ev,
      } as any));

      const gameHighlights: Highlight[] = (trendingGames || []).map(bg => {
        return {
          id: `game-${bg.id}`,
          title: bg.name,
          subtitle: 'Trending Game · Play Now',
          type: 'game',
          sourceId: bg.id,
          sourceSlug: bg.slug,
          tag: 'Trending Game',
          tagColor: '#EF4444',
          emoji: (bg as any).emoji || '🎮',
          gradient: ((bg as any).metadata?.gradient || (bg as any).gradient || ['#7C3AED', '#0891B2']) as [string, string],
          meta: (bg as any).metadata?.averageDurationLabel || (bg as any).averageDurationLabel || '',
          imageUrl: (bg as any).metadata?.cardUrl || (bg as any).thumbnail || (bg as any).imageUrl || '',
          action: 'PLAY',
        };
      });

      const nativeHighlights: Highlight[] = (spotlight || []).map(h => ({
        id: h.id,
        title: h.title,
        subtitle: h.description || '',
        type: h.type,
        sourceId: h.sourceId,
        sourceSlug: h.sourceSlug,
        tag: h.type === 'event' ? 'Featured Event' : 'Spotlight',
        tagColor: h.type === 'event' ? '#F59E0B' : '#8B5CF6',
        emoji: h.type === 'event' ? '🎉' : '✨',
        gradient: ['#1E1B4B', '#4C1D95'],
        imageUrl: h.imageUrl,
      }));

      setSpotlights([...nativeHighlights, ...eventHighlights, ...gameHighlights]);
    } catch (e) {
      error("Failed to fetch highlights", e);
    } finally {
      setLoading(false);
    }
  };

  const count = spotlights.length;

  // Build the repeated array used by the FlatList.
  const repeatedData = React.useMemo(() => {
    if (count === 0) return [];
    const arr: Highlight[] = [];
    for (let r = 0; r < REPEAT_COUNT; r++) {
      for (const item of spotlights) {
        // Give each clone a unique key so React doesn't dedupe them.
        arr.push({ ...item, _key: `${r}-${item.id}` } as Highlight & { _key: string });
      }
    }
    return arr;
  }, [spotlights, count]);

  // Index of the first item in the middle copy — our stable "origin".
  const middleCopyStart = count > 0 ? count : 0;

  // Silently recenter the scroll position to the equivalent spot in the
  // middle copy so we never run out of room in either direction.
  const recenterIfNeeded = useCallback(
    (index: number) => {
      if (count === 0) return;
      const midStart = middleCopyStart;
      const midEnd = midStart + count - 1;

      if (index < midStart || index > midEnd) {
        // Map to the equivalent position inside the middle copy.
        const normalized = ((index - midStart) % count + count) % count;
        const newIndex = midStart + normalized;
        scrollPosRef.current = newIndex;
        flatRef.current?.scrollToIndex({ index: newIndex, animated: false });
      }
    },
    [count, middleCopyStart],
  );

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (count === 0) return;

    timerRef.current = setInterval(() => {
      // Always advance forward by one.
      const next = scrollPosRef.current + 1;
      scrollPosRef.current = next;
      flatRef.current?.scrollToIndex({ index: next, animated: true });

      // If we've scrolled past the middle copy, silently recenter.
      setTimeout(() => recenterIfNeeded(next), 400);
    }, 3600);
  }, [count, recenterIfNeeded]);

  useEffect(() => {
    if (count > 0) {
      // Start in the middle copy so there's room to scroll in both directions.
      const startIndex = middleCopyStart;
      scrollPosRef.current = startIndex;
      // Wait a tick for the FlatList to mount, then position it.
      requestAnimationFrame(() => {
        flatRef.current?.scrollToIndex({ index: startIndex, animated: false });
      });
      startTimer();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTimer, count, middleCopyStart]);

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <StateBlock inline loading loaderSize={24} />
      </View>
    );
  }

  if (spotlights.length === 0) {
    return (
      <View>
        <Text style={styles.sectionLabel}>SPOTLIGHT</Text>
        <View style={styles.emptyContainer}>
          <LinearGradient
            colors={[colors.bg.surface, colors.bg.elevated, colors.bg.base] as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.emptyGradient}
          >
            <View
              style={{
                position: "absolute",
                top: 12,
                left: 20,
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: "rgba(124,58,237,0.12)",
              }}
            />
            <View
              style={{
                position: "absolute",
                bottom: 10,
                right: 20,
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "rgba(167,139,250,0.08)",
              }}
            />
            <View style={styles.emptyIconRing}>
              <Ionicons
                name="sparkles"
                size={22}
                color="rgba(167,139,250,0.9)"
              />
            </View>
            <Text style={styles.emptyTitle}>No Spotlights Yet</Text>
            <Text style={styles.emptySub}>
              {"Stay tuned for exciting spotlights coming soon!"}
            </Text>
          </LinearGradient>
        </View>
      </View>
    );
  }

  const renderItem: ListRenderItem<Highlight> = ({ item, index }) => {
    const fallbacks = [
      {
        emoji: "⚡",
        tag: "Featured",
        tagColor: "#10B981",
        gradient: ["#1E1B4B", "#4C1D95"],
      },
      {
        emoji: "🌐",
        tag: "Live",
        tagColor: "#EF4444",
        gradient: ["#1C0B2E", "#5B21B6"],
      },
      {
        emoji: "🎭",
        tag: "Event",
        tagColor: "#F59E0B",
        gradient: ["#1A1200", "#78350F"],
      },
      {
        emoji: "📚",
        tag: "Study",
        tagColor: "#06B6D4",
        gradient: ["#0C1A2E", "#0E4C6A"],
      },
      {
        emoji: "🚀",
        tag: "Contest",
        tagColor: "#EC4899",
        gradient: ["#1A001A", "#6D1278"],
      },
    ];
    const style = fallbacks[index % fallbacks.length];

    const handlePress = (item: Highlight) => {
      if (!item.type) return;
      if (item.type === "game") {
        const gameId = item.sourceSlug || item.sourceId || item.id.replace(/^game-/, '');
        navigation.navigate("Main", {
          screen: "Games",
          params: { openGameId: gameId, autoPlay: true },
        });
      } else if (item.type === "event") {
        const eventId = item.sourceId || item.id.replace(/^event-/, '');
        navigation.navigate("EventDetail", {
          eventId,
          event: (item as any).rawEvent,
        });
      } else if (item.type === "community") {
        navigation.navigate("CommunityDetail", {
          communitySlug: item.sourceSlug || item.sourceId,
        });
      } else if (item.type === "post") {
        navigation.navigate("Main", { screen: "Community" });
      }
    };

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        style={{ width: CARD_W }}
        onPress={() => handlePress(item)}
      >
        {item.imageUrl ? (
          <ImageBackground
            source={{ uri: item.imageUrl }}
            style={[styles.card, { padding: 0, borderWidth: 0 }]}
            imageStyle={{ borderRadius: radii.lg }}
          >
            <View style={styles.overlay} />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.85)"]}
              style={{ flex: 1, padding: spacing.lg, justifyContent: "flex-end", borderRadius: radii.lg }}
            >
              <View
                style={[
                  styles.tag,
                  {
                    borderColor: `${item.tagColor || style.tagColor}55`,
                    backgroundColor: `${item.tagColor || style.tagColor}1A`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tagText,
                    { color: item.tagColor || style.tagColor },
                  ]}
                >
                  {item.tag || style.tag}
                </Text>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSubtitle}>
                {(item as any).subtitle || (item as any).description}
              </Text>
              <Text style={styles.cardMeta}>
                {item.meta ||
                  new Date(
                    (item as any).createdAt || Date.now(),
                  ).toLocaleDateString()}
              </Text>
            </LinearGradient>
          </ImageBackground>
        ) : (
          <LinearGradient
            colors={(item.gradient || style.gradient) as [string, string]}
            style={styles.card}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View
              style={[
                styles.tag,
                {
                  borderColor: `${item.tagColor || style.tagColor}55`,
                  backgroundColor: `${item.tagColor || style.tagColor}1A`,
                },
              ]}
            >
              <Text
                style={[
                  styles.tagText,
                  { color: item.tagColor || style.tagColor },
                ]}
              >
                {item.tag || style.tag}
              </Text>
            </View>
            <Text style={styles.emoji}>{item.emoji || style.emoji}</Text>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSubtitle}>
              {(item as any).subtitle || (item as any).description}
            </Text>
            <Text style={styles.cardMeta}>
              {item.meta ||
                new Date(
                  (item as any).createdAt || Date.now(),
                ).toLocaleDateString()}
            </Text>
          </LinearGradient>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>SPOTLIGHT</Text>

      <FlatList
        ref={flatRef}
        data={repeatedData}
        renderItem={renderItem}
        keyExtractor={(i, idx) => `${(i as any)._key || i.id}-${idx}`}
        horizontal
        pagingEnabled={false}
        snapToInterval={ITEM_W}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
        }}
        getItemLayout={(_, idx) => ({
          length: ITEM_W,
          offset: ITEM_W * idx,
          index: idx,
        })}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / ITEM_W);
          scrollPosRef.current = idx;
          // Recenter if we've drifted outside the middle copy.
          recenterIfNeeded(idx);
          // Restart the timer from the new position.
          startTimer();
        }}
      />
    </View>
  );
}
