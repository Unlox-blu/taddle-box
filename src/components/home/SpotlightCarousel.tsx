import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ListRenderItem,
  ActivityIndicator,
  ImageBackground,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { fontSizes, spacing, radii, type ColorPalette } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import { highlightService, Highlight } from "../../services/highlight.service";
import { GAME_ASSETS } from "../../games/assets";
import { eventService } from "../../services/event.service";
import { gamesService } from "../../services/games.service";

const { width: SW } = Dimensions.get("window");
const CARD_W = SW - spacing.lg * 2;
const CARD_H = 168;
const ITEM_W = CARD_W + spacing.md;

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
      ...StyleSheet.absoluteFillObject,
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
    dots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 5,
      marginTop: 10,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.border,
    },
    dotActive: {
      width: 22,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.primary,
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
  const [activeIdx, setActiveIdx] = useState(0);
  const flatRef = useRef<FlatList<Highlight>>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(0);

  useEffect(() => {
    fetchHighlights();
  }, []);

  const fetchHighlights = async () => {
    try {
      setLoading(true);
      const [hlRes, eventsRes, trendingRes] = await Promise.all([
        highlightService.getHighlights(),
        eventService.discoverEvents({ limit: 1 }).catch(() => ({ data: [] })),
        gamesService.getTrendingGames(3).catch(() => ({ data: [] })),
      ]);
      
      const backendHighlights = hlRes.data || [];
      
      // Only FEATURED events belong in the spotlight — the discover endpoint
      // returns the nearest upcoming event (start_time ASC), which may not be
      // featured, so gate the card on isFeatured.
      const nextEvent = eventsRes.data?.[0];
      const eventHighlight: Highlight[] = nextEvent?.isFeatured ? [{
        id: `event-${nextEvent.id}`,
        title: nextEvent.title,
        subtitle: nextEvent.description || 'Upcoming Event',
        type: 'event',
        sourceId: nextEvent.id,
        tag: 'Featured Event',
        tagColor: '#F59E0B',
        emoji: '🎉',
        gradient: ['#1A1200', '#78350F'],
        meta: new Date(nextEvent.rawDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        imageUrl: nextEvent.banner,
      }] : [];

      const trendingBackend = trendingRes.data || [];
      const trendingGames: Highlight[] = trendingBackend.map(bg => {
        const slug = (bg as any).slug || 'tap-rush';
        const localGame = GAME_ASSETS[slug as keyof typeof GAME_ASSETS] || GAME_ASSETS['tap-rush'];
        return {
          id: `game-${bg.id}`,
          title: bg.name,
          subtitle: 'Trending Game · Play Now',
          type: 'game',
          sourceId: bg.id,
          tag: 'Trending Game',
          tagColor: '#EF4444',
          emoji: localGame.emoji,
          gradient: localGame.gradient as [string, string],
          meta: localGame.averageDurationLabel,
          imageUrl: localGame.imageUrl,
        };
      });

      setSpotlights([...backendHighlights, ...eventHighlight, ...trendingGames]);
    } catch (e) {
      console.error("Failed to fetch highlights", e);
    } finally {
      setLoading(false);
    }
  };

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (spotlights.length === 0) return;

    timerRef.current = setInterval(() => {
      const next = (activeRef.current + 1) % spotlights.length;
      activeRef.current = next;
      setActiveIdx(next);
      flatRef.current?.scrollToIndex({ index: next, animated: true });
    }, 3600);
  }, [spotlights.length]);

  useEffect(() => {
    if (spotlights.length > 0) {
      startTimer();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTimer, spotlights]);

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="small" color={colors.primary} />
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
            {/* Decorative glow blobs */}
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
        navigation.navigate("Games");
      } else if (item.type === "event") {
        navigation.navigate("Events");
      } else if (item.type === "post") {
        // If there's a specific post, it would be ideal to go to Comments/Details,
        // but since we only have sourceId, navigating to Community tab is a good fallback
        navigation.navigate("Community");
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
        data={spotlights}
        renderItem={renderItem}
        keyExtractor={(i) => i.id.toString()}
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
          const clamped = Math.max(0, Math.min(idx, spotlights.length - 1));
          activeRef.current = clamped;
          setActiveIdx(clamped);
          startTimer();
        }}
      />

      <View style={styles.dots}>
        {spotlights.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIdx && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}
