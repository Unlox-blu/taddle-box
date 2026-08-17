import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Share,
  Modal,
  TouchableWithoutFeedback,
  Animated,
  DeviceEventEmitter,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import {
  useNavigation,
  useIsFocused,
  useFocusEffect,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fontSizes, spacing, radii } from "../../theme";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import PostCard from "../../components/home/PostCard";
import SpotlightCarousel from "../../components/home/SpotlightCarousel";
import MainHeader from "../../components/common/MainHeader";
import StateBlock from "../../components/common/StateBlock";
import CommentsModal from "../../components/home/CommentsModal";
import { useAuth } from "../../context/AuthContext";
import { useWallet } from "../../context/WalletContext";
import SharedFeed from "../../components/common/SharedFeed";
import { useFeed } from "../../queries/feed";
import { useToggleLike, useToggleSave } from "../../mutations/posts";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import type { Post, HomeStackParamList } from "../../types";

import { streakService } from "../../services/streak.service";
import { xpService } from "../../services/xp.service";
import { postsService } from "../../services/posts.service";
import { walletService } from "../../services/wallet.service";

import { cycleInfo, isSameDay } from "../../utils/streak";
import { themedAlert } from "../../components/common/ThemedAlert";

type HomeNavProp = NativeStackNavigationProp<HomeStackParamList, "HomeMain">;

const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const scrollRef = useRef<FlatList>(null);

  const { user: CURRENT_USER, refreshUser } = useAuth();
  const { wallet, fetchWalletSummary } = useWallet();
  const navigation = useNavigation<HomeNavProp>();
  const isFocused = useIsFocused();
  const { isDark } = useTheme();
  const colors = useThemeColors();

  const [activeTrend, setActiveTrend] = useState("All");

  const {
    data: feedData,
    fetchNextPage,
    hasNextPage,
    refetch: refetchFeed,
    isRefetching,
    isLoading,
  } = useFeed(activeTrend);
  const { mutate: toggleLike } = useToggleLike();
  const { mutate: toggleSave } = useToggleSave();

  // Refresh the feed whenever the Home tab regains focus so new posts and XP
  // from other tabs show up without a manual pull-to-refresh. The FIRST
  // focus is skipped — useFeed already fetches on mount (and initHomeData
  // must NOT refetch it: that's the third redundant path that doubled the
  // startup feed call).
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      refetchFeed();
    }, [refetchFeed]),
  );

  const posts = feedData?.pages.flat() || [];

  const [trendChips, setTrendChips] = useState<string[]>(["All"]);
  const [refreshing, setRefreshing] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  // XP balance shown inside the streak-restore modal — fetched fresh on open
  // (summary endpoint) so the restore-cost check never relies on the stale
  // auth-synced user.xp value.
  const [modalXpBalance, setModalXpBalance] = useState<number | null>(null);
  const [showStreakRewardModal, setShowStreakRewardModal] = useState(false);
  const [rewardXp, setRewardXp] = useState(0);
  const [rewardDay, setRewardDay] = useState(0);

  const [realStreak, setRealStreak] = useState(0);
  const [streakEndDate, setStreakEndDate] = useState<string | null>(null);
  const [streakRestorable, setStreakRestorable] = useState(false);
  const [restoreCost, setRestoreCost] = useState(0);
  const [restoreDeadline, setRestoreDeadline] = useState<string | null>(null);
  const [nextMilestoneDay, setNextMilestoneDay] = useState(7);
  const [nextRewardXp, setNextRewardXp] = useState(100);
  const [restoring, setRestoring] = useState(false);
  const [hasDailyReward, setHasDailyReward] = useState(false);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!streakRestorable) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [streakRestorable, restoreDeadline]);

  const deadlineMs = restoreDeadline ? new Date(restoreDeadline).getTime() : 0;
  const remainingMs = streakRestorable && deadlineMs ? Math.max(0, deadlineMs - now) : 0;

  useEffect(() => {
    if (isFocused) {
      initHomeData();
    }
  }, [isFocused]);

  const handleDeletePost = async (post: Post) => {
    try {
      const { postsService } = require("../../services/posts.service");
      await postsService.deletePost(post.id);
      refetchFeed();
    } catch (e) {
      console.error("Failed to delete post:", e);
    }
  };

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("homeDoubleTap", () => {
      // Drop the pull bubble in like a real pull, then refresh after the
      // scroll animation finishes.
      DeviceEventEmitter.emit("triggerPullRefresh");
      setTimeout(() => {
        onRefresh();
      }, 500);
    });
    return () => sub.remove();
  }, [refetchFeed]);

  const initHomeData = async () => {
    try {
      // Streak state machine: GET /streak evaluates freeze/reset; POST advances
      // the count. When a restore window is open we DON'T post — the user must
      // restore first (the popup shows the Restore button + countdown).
      let currentStreak = 0;
      let endDate: string | null = null;
      let restorable = false;
      let cost = 0;
      let deadline: string | null = null;

      try {
        const streakRes = await streakService.getCurrentStreak();
        const d = streakRes?.data;
        currentStreak = d?.streak?.streakCount || 0;
        endDate = d?.streak?.endDate || null;
        restorable = !!d?.restorable;
        cost = d?.restoreCost || 0;
        deadline = d?.restoreDeadline || null;
        setNextMilestoneDay(d?.nextMilestoneDay || 7);
        setNextRewardXp(d?.nextRewardXp || 0);

        // Not updated today and no restore window → advance the streak.
        const prev = endDate ? new Date(endDate) : null;
        const alreadyToday = prev ? isSameDay(prev, new Date()) : false;
        if (!alreadyToday && !restorable) {
          try {
            const updateRes = await streakService.createOrUpdate();
            const ud = updateRes?.data;
            if (ud?.streak) {
              currentStreak = ud.streak.streakCount;
              endDate = ud.streak.endDate;
              restorable = !!ud.restorable;
              cost = ud.restoreCost || 0;
              deadline = ud.restoreDeadline || null;
              setNextMilestoneDay(ud.nextMilestoneDay || 7);
              setNextRewardXp(ud.nextRewardXp || 0);
              if (ud.rewardEarned && (ud.rewardXp || 0) > 0) {
                setRewardXp(ud.rewardXp || 0);
                setRewardDay(currentStreak);
                setShowStreakRewardModal(true);
              }
            }
          } catch (e) {
            // Already updated or other error
          }
        }
      } catch (e) {
        // Fallback or initial streak creation
        try {
          const updateRes = await streakService.createOrUpdate();
          const ud = updateRes?.data;
          if (ud?.streak) {
            currentStreak = ud.streak.streakCount;
            endDate = ud.streak.endDate;
          }
        } catch (err) {}
      }

      setRealStreak(currentStreak);
      setStreakEndDate(endDate);
      setStreakRestorable(restorable);
      setRestoreCost(cost);
      setRestoreDeadline(deadline);

      // Unread badge is handled by NotificationContext/MainHeader (socket-driven,
      // synced on login + reconnect) — no need to re-fetch here on every focus.

      const todayKey = getTodayKey();
      let localClaimedToday = false;
      try {
        localClaimedToday =
          (await AsyncStorage.getItem("lastDailyClaim")) === todayKey;
      } catch (e) {}

      let serverClaimedToday = false;
      try {
        // Cheap dedicated status endpoint — avoids fetching the whole XP
        // transaction history just to know if today's reward is claimed.
        const dailyRes = await xpService.getDailyLoginStatus(todayKey);
        serverClaimedToday = !!dailyRes?.data?.claimed;
        if (serverClaimedToday) {
          AsyncStorage.setItem("lastDailyClaim", todayKey).catch(() => {});
        }
      } catch (e) {}

      setHasDailyReward(!localClaimedToday && !serverClaimedToday);

      // No refetchFeed() here: useFeed fetches on mount and the useFocusEffect
      // above refreshes on every re-focus — a third call here doubled the
      // startup feed request (mount + focus) and re-fetched on every tab return.

      // Trending chips are FEED-personalized (followed authors / joined
      // communities / interests) — the feed endpoint, not the global search
      // hashtag ranking used by the search page.
      postsService
        .getFeedHashtags()
        .then((res) => {
          if (res?.data) {
            const tags = res.data
              .filter((t: any) => typeof t === "string" && t.trim().length > 0)
              .map((t: string) => `#${t.toLowerCase()}`);
            setTrendChips(["All", ...tags]);
          }
        })
        .catch((e) => console.error("Failed to fetch hashtags for feed", e));
    } catch (e) {
      console.error("Failed to init home data:", e);
    }
  };

  // Pay XP to revive a frozen streak (24-hour restore window). Returns true
  // on success so the popup can close; false keeps it open with the error.
  const handleRestoreStreak = useCallback(async () => {
    setRestoring(true);
    try {
      const res = await streakService.restoreStreak();
      const d = res?.data;
      if (d?.streak) {
        setRealStreak(d.streak.streakCount);
        setStreakEndDate(d.streak.endDate);
        setStreakRestorable(false);
        setRestoreCost(0);
        setRestoreDeadline(null);
        setNextMilestoneDay(d.nextMilestoneDay || 7);
        setNextRewardXp(d.nextRewardXp || 0);

        if (d.rewardEarned && (d.rewardXp || 0) > 0) {
          setRewardXp(d.rewardXp || 0);
          setRewardDay(d.streak.streakCount);
          setShowStreakRewardModal(true);
        }

        fetchWalletSummary(); // refresh the XP balance (socket also fires)
        return true;
      }
      return false;
    } catch (e: any) {
      themedAlert(
        "Restore Failed",
        e?.response?.data?.message || "Could not restore your streak",
      );
      return false;
    } finally {
      setRestoring(false);
    }
  }, [fetchWalletSummary]);

  // Open the streak modal with a FRESH XP balance — the restore-cost check
  // reads the summary endpoint rather than the auth-synced user.xp value, so
  // the affordability text stays accurate even if user.xp is stale.
  const openStreakModal = useCallback(() => {
    setStreakOpen(true);
    walletService
      .getWalletSummary()
      .then((res) => setModalXpBalance(res?.data?.xpBalance ?? 0))
      .catch(() => setModalXpBalance(null)); // fall back to context value
  }, []);

  // XP fly-to-card animation
  const xpCardRef = useRef<View>(null);
  const xpBounceAnim = useRef(new Animated.Value(1)).current;
  const particleX = useRef(new Animated.Value(-100)).current;
  const particleY = useRef(new Animated.Value(-100)).current;
  const particleOpac = useRef(new Animated.Value(0)).current;

  const handleRewardClaim = useCallback(
    async (fromX: number, fromY: number) => {
      try {
        const todayKey = getTodayKey();
        const res = await xpService.creditXP(
          50,
          "bonus",
          `Daily Login - ${todayKey}`,
        );
        AsyncStorage.setItem("lastDailyClaim", todayKey).catch(() => {});

        if (res?.data?.alreadyClaimed || res?.alreadyClaimed) {
          setHasDailyReward(false);
          return;
        }

        // The card reads wallet.xpBalance — the backend's creditXP emits
        // xp:updated on the same round-trip, so WalletContext bumps it live.

        xpCardRef.current?.measure((_, __, w, h, px, py) => {
          const toX = px + w / 2 - 30;
          const toY = py + h / 2 - 12;
          particleX.setValue(fromX - 30);
          particleY.setValue(fromY - 12);
          particleOpac.setValue(1);
          Animated.parallel([
            Animated.timing(particleX, {
              toValue: toX,
              duration: 700,
              useNativeDriver: true,
            }),
            Animated.timing(particleY, {
              toValue: toY,
              duration: 700,
              useNativeDriver: true,
            }),
          ]).start(() => {
            Animated.timing(particleOpac, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start();
            Animated.sequence([
              Animated.spring(xpBounceAnim, {
                toValue: 1.4,
                speed: 28,
                bounciness: 12,
                useNativeDriver: true,
              }),
              Animated.spring(xpBounceAnim, {
                toValue: 1.0,
                speed: 12,
                bounciness: 8,
                useNativeDriver: true,
              }),
            ]).start();
          });
        });
      } catch (e) {
        console.error("Failed to claim daily reward", e);
        setHasDailyReward(false);
      }
    },
    [],
  );

  // The backend API already filters by the active hashtag (if it's not "All").
  // There's no need to filter it again on the client side, which causes case-sensitivity bugs.
  const filteredPosts = posts;

  const queryClient = useQueryClient();

  // After a repost lands, refresh the feed so the new repost shows up at the top.
  const handleReposted = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.feed });
  }, [queryClient]);

  const onRefresh = async () => {
    setRefreshing(true);
    // Pull the latest feed + user profile so XP (and streak) values refresh
    // server-side. Previously the feed query was never refetched here — the
    // list kept its stale contents and only the profile/streak APIs were hit.
    try {
      await Promise.all([refetchFeed(), initHomeData(), refreshUser()]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* ── Header ────────────────────────────────── */}
      <MainHeader />

      <SharedFeed
        posts={filteredPosts}
        // Only the actual pull gesture (or the tab-double-tap refresh) should
        // show the refresh indicator. Feeding isRefetching in here made EVERY
        // background refetch (like/save/repost/focus) flash the spinner and
        // yank the list — visible as a card jerk on iOS and a blank list on
        // Android.
        refreshing={refreshing}
        onRefresh={onRefresh}
        onLike={(id) =>
          toggleLike({
            id,
            isCurrentlyLiked:
              posts.find((p: any) => p.id === id)?.isLiked || false,
          })
        }
        onSave={(id) =>
          toggleSave({
            id,
            isCurrentlySaved:
              posts.find((p: any) => p.id === id)?.isSaved || false,
          })
        }
        onDelete={handleDeletePost}
        onReposted={handleReposted}
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ flexGrow: 1 }}
        ListFooterComponent={
          <>
            {!hasNextPage && posts.length > 0 ? (
              <StateBlock
                inline
                title="That's it for now! Come back later for more."
                style={{ padding: 24 }}
              />
            ) : isLoading || isRefetching ? (
              <StateBlock inline loading style={{ paddingVertical: 24 }} />
            ) : null}
            <View style={{ height: 110 }} />
          </>
        }
        ListHeaderComponent={
          <View>
            {/* ── Streak & XP mini cards ─────────────────── */}
            <View style={styles.miniRow}>
              <TouchableOpacity
                style={[
                  styles.miniCard,
                  streakRestorable
                    ? {
                        backgroundColor: "rgba(239,68,68,0.08)",
                        borderColor: "rgba(239,68,68,0.3)",
                      }
                    : {
                        backgroundColor: "rgba(251,191,36,0.08)",
                        borderColor: "rgba(251,191,36,0.22)",
                      },
                ]}
                onPress={openStreakModal}
                activeOpacity={0.8}
              >
                <Text style={styles.miniEmoji}>{streakRestorable ? "⏳" : "🔥"}</Text>
                <View style={styles.miniText}>
                  <Text
                    style={[
                      styles.miniVal, 
                      { color: streakRestorable ? colors.danger : colors.text.primary }
                    ]}
                  >
                    {streakRestorable ? fmtCountdown(remainingMs) : `${realStreak} ${realStreak === 1 ? "Day" : "Days"}`}
                  </Text>
                  <Text
                    style={[
                      styles.miniLabel, 
                      { color: streakRestorable ? colors.danger : colors.text.muted }
                    ]}
                  >
                    {streakRestorable ? "Restore Streak!" : "Streak"}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={13}
                  color={streakRestorable ? "rgba(239,68,68,0.45)" : "rgba(251,191,36,0.45)"}
                />
              </TouchableOpacity>

              <Animated.View
                ref={xpCardRef}
                style={[
                  styles.xpCardWrap,
                  { transform: [{ scale: xpBounceAnim }] },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.miniCard,
                    {
                      backgroundColor: "rgba(124,58,237,0.08)",
                      borderColor: "rgba(124,58,237,0.22)",
                    },
                  ]}
                  onPress={() => {
                    if (CURRENT_USER?.appLockEnabled) {
                      navigation.navigate("LockScreen", {
                        mode: "app",
                        returnScreen: "Wallet",
                      } as never);
                    } else {
                      navigation.getParent()?.navigate("Wallet" as never);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.miniEmoji}>⚡</Text>
                  <View style={styles.miniText}>
                    <Text style={[styles.miniVal, { color: colors.xpGold }]}>
                      {wallet.xpBalance.toLocaleString()}
                    </Text>
                    <Text
                      style={[styles.miniLabel, { color: colors.text.muted }]}
                    >
                      Total XP
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={13}
                    color="rgba(251,191,36,0.45)"
                  />
                </TouchableOpacity>
              </Animated.View>
            </View>
            <SpotlightCarousel />

            {/* Daily reward */}
            {hasDailyReward && (
              <DailyRewardCard onClaimPos={handleRewardClaim} />
            )}

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: spacing.xl,
                marginBottom: spacing.sm,
              }}
            >
              <Text
                style={[
                  styles.sectionLabel,
                  {
                    color: colors.text.muted,
                    paddingHorizontal: 0,
                    paddingBottom: 0,
                    paddingTop: 10,
                  },
                ]}
              >
                Feed
              </Text>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("Leaderboards", { initialTab: "Feed" })
                }
              >
                <Ionicons
                  name="trophy-outline"
                  size={20}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            </View>

            {/* Trending chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendScroll}
            >
              {trendChips.map((chip) => (
                <TouchableOpacity
                  key={chip}
                  onPress={() => {
                    if (activeTrend === chip) {
                      onRefresh();
                    } else {
                      setActiveTrend(chip);
                    }
                  }}
                  style={[
                    styles.chip,
                    {
                      borderColor:
                        activeTrend === chip
                          ? colors.primary
                          : colors.borderHover,
                    },
                    activeTrend === chip && {
                      backgroundColor: "rgba(124,58,237,0.18)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color:
                          activeTrend === chip
                            ? colors.primaryLight
                            : colors.text.secondary,
                      },
                      activeTrend === chip && { fontWeight: "700" },
                    ]}
                  >
                    {chip}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text
              style={[
                styles.emptyFilter,
                { color: colors.text.muted, marginTop: 0 },
              ]}
            >
              Hang tight!
            </Text>
          </View>
        }
      />

      {/* ── Streak Modal ───────────────────────────── */}
      <StreakModal
        visible={streakOpen}
        onClose={() => setStreakOpen(false)}
        streakCount={realStreak}
        todayFilled={
          streakEndDate ? isSameDay(new Date(streakEndDate), new Date()) : false
        }
        restorable={streakRestorable}
        restoreCost={restoreCost}
        restoreDeadline={restoreDeadline}
        xpBalance={modalXpBalance ?? wallet?.xpBalance ?? 0}
        nextMilestoneDay={nextMilestoneDay}
        nextRewardXp={nextRewardXp}
        restoring={restoring}
        onRestore={handleRestoreStreak}
        onExpired={() => {
          setStreakOpen(false);
          initHomeData();
        }}
      />

      <StreakRewardModal
        visible={showStreakRewardModal}
        onClose={() => setShowStreakRewardModal(false)}
        day={rewardDay}
        xp={rewardXp}
      />

      {/* ── XP reward particle (flies to XP card on claim) ── */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.xpParticle,
          {
            opacity: particleOpac,
            transform: [{ translateX: particleX }, { translateY: particleY }],
          },
        ]}
      >
        <View style={styles.xpParticleInner}>
          <Text style={styles.xpParticleText}>⚡ +50 XP</Text>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Daily Reward Card (animated claim + auto-remove) ─────────────────────────

function DailyRewardCard({
  onClaimPos,
}: {
  onClaimPos?: (x: number, y: number) => void;
}) {
  const colors = useThemeColors();
  const [claimed, setClaimed] = useState(false);
  const [gone, setGone] = useState(false);

  const claimBtnRef = useRef<View>(null);
  const iconScale = useRef(new Animated.Value(1)).current;
  const floatOpac = useRef(new Animated.Value(0)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const cardOpac = useRef(new Animated.Value(1)).current;
  const cardSlideY = useRef(new Animated.Value(0)).current;

  const handleClaim = () => {
    if (claimed) return;
    setClaimed(true);
    claimBtnRef.current?.measure((_, __, w, h, px, py) => {
      onClaimPos?.(px + w / 2, py + h / 2);
    });

    // 1 — icon bounce
    Animated.sequence([
      Animated.spring(iconScale, {
        toValue: 1.55,
        speed: 28,
        bounciness: 14,
        useNativeDriver: true,
      }),
      Animated.spring(iconScale, {
        toValue: 1.0,
        speed: 12,
        bounciness: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // 2 — floating "+50 XP" text rises and fades
    Animated.parallel([
      Animated.timing(floatOpac, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(floatY, {
        toValue: -48,
        duration: 900,
        useNativeDriver: true,
      }),
    ]).start(() =>
      Animated.timing(floatOpac, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(),
    );

    // 3 — after 1.8 s card fades + slides down then unmounts
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(cardOpac, {
          toValue: 0,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(cardSlideY, {
          toValue: 24,
          duration: 420,
          useNativeDriver: true,
        }),
      ]).start(() => setGone(true));
    }, 1800);
  };

  if (gone) return null;

  return (
    <Animated.View
      style={[
        styles.rewardCard,
        {
          backgroundColor: claimed
            ? "rgba(16,185,129,0.08)"
            : "rgba(251,191,36,0.07)",
          borderColor: claimed
            ? "rgba(16,185,129,0.25)"
            : "rgba(251,191,36,0.20)",
          opacity: cardOpac,
          transform: [{ translateY: cardSlideY }],
        },
      ]}
    >
      {/* Floating reward text */}
      <Animated.Text
        style={[
          styles.floatText,
          { opacity: floatOpac, transform: [{ translateY: floatY }] },
        ]}
        pointerEvents="none"
      >
        🎁 +50 XP
      </Animated.Text>

      <Animated.View
        style={[styles.rewardIcon, { transform: [{ scale: iconScale }] }]}
      >
        <Text style={{ fontSize: 26 }}>{claimed ? "✅" : "🎁"}</Text>
      </Animated.View>

      <View style={styles.rewardInfo}>
        <Text style={[styles.rewardTitle, { color: colors.text.primary }]}>
          {claimed ? "Reward Claimed!" : "Daily Login Reward"}
        </Text>
        <Text style={[styles.rewardDesc, { color: colors.text.muted }]}>
          {claimed
            ? "Come back tomorrow for more XP"
            : "Check in every day to earn bonus XP"}
        </Text>
        <View
          style={[
            styles.rewardTrack,
            { backgroundColor: "rgba(255,255,255,0.07)" },
          ]}
        >
          <View
            style={[
              styles.rewardFill,
              {
                width: claimed ? "100%" : "70%",
                backgroundColor: claimed ? "#10B981" : colors.xpGold,
              },
            ]}
          />
        </View>
      </View>

      {!claimed && (
        <View ref={claimBtnRef}>
          <TouchableOpacity
            onPress={handleClaim}
            style={[styles.claimBtn, { backgroundColor: colors.xpGold }]}
          >
            <Text style={styles.claimBtnText}>Claim!</Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Streak Modal ─────────────────────────────────────────────────────────────

const fmtCountdown = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
};

function StreakModal({
  visible,
  onClose,
  streakCount,
  todayFilled,
  restorable,
  restoreCost,
  restoreDeadline,
  xpBalance,
  nextMilestoneDay,
  nextRewardXp,
  restoring,
  onRestore,
  onExpired,
}: {
  visible: boolean;
  onClose: () => void;
  streakCount: number;
  todayFilled: boolean;
  restorable: boolean;
  restoreCost: number;
  restoreDeadline: string | null;
  xpBalance: number;
  nextMilestoneDay: number;
  nextRewardXp: number;
  restoring: boolean;
  onRestore: () => Promise<boolean>;
  onExpired: () => void;
}) {
  const colors = useThemeColors();
  const { pos, labels } = cycleInfo(streakCount);
  const cycleEnd = labels[labels.length - 1] || 7;

  // Live countdown to the restore deadline (updates every second).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!visible || !restorable || !restoreDeadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [visible, restorable, restoreDeadline]);

  const deadlineMs = restoreDeadline ? new Date(restoreDeadline).getTime() : 0;
  const remainingMs =
    restorable && deadlineMs ? Math.max(0, deadlineMs - now) : 0;
  const expired = restorable && remainingMs <= 0;

  useEffect(() => {
    if (expired) onExpired();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);



  // The tick that represents today (or the missed day when restorable).
  const todayIdx = Math.min(
    restorable ? pos : todayFilled ? pos - 1 : pos,
    labels.length - 1,
  );
  const showMissed = restorable && pos < labels.length;
  const canAfford = xpBalance >= restoreCost;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={sm.wrap}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={sm.backdrop} />
        </TouchableWithoutFeedback>

        <View
          style={[
            sm.sheet,
            {
              backgroundColor: colors.bg.surface,
              borderColor: colors.borderHover,
            },
          ]}
        >
          <View style={[sm.handle, { backgroundColor: colors.border }]} />

          <View style={sm.titleRow}>
            <Text style={sm.titleEmoji}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={[sm.title, { color: colors.text.primary }]}>
                Daily Streak
              </Text>
              <Text style={[sm.sub, { color: colors.text.muted }]}>
                {restorable
                  ? `${streakCount}-day streak is at risk!`
                  : `${streakCount} ${streakCount === 1 ? "day" : "days"} and counting!`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={sm.closeBtn}>
              <Ionicons name="close" size={20} color={colors.text.muted} />
            </TouchableOpacity>
          </View>

          <Text style={[sm.cycleHeader, { color: colors.text.muted }]}>
            Day {streakCount} of {cycleEnd}
          </Text>
          <View style={sm.dots}>
            {labels.map((day, i) => {
              const done = i < pos;
              const missed = showMissed && i === pos;
              const isToday = i === todayIdx;
              return (
                <View
                  key={day}
                  style={[
                    sm.dot,
                    { borderColor: colors.border },
                    done && {
                      backgroundColor: "rgba(251,191,36,0.12)",
                      borderColor: "rgba(251,191,36,0.30)",
                    },
                    missed && {
                      backgroundColor: "rgba(239,68,68,0.14)",
                      borderColor: "rgba(239,68,68,0.45)",
                    },
                    !done &&
                      !missed &&
                      isToday && {
                        backgroundColor: "rgba(251,191,36,0.22)",
                        borderColor: colors.xpGold,
                      },
                  ]}
                >
                  <Text style={[sm.dotDay, { color: colors.text.muted }]}>
                    Day {day}
                  </Text>
                  <Text style={sm.dotIcon}>
                    {done ? "✓" : missed ? "⚠️" : isToday ? "🔥" : ""}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Next milestone preview */}
          <View style={[sm.nextBox, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[sm.nextLabel, { color: colors.text.muted }]}>
                Next milestone
              </Text>
              <Text style={[sm.nextDays, { color: colors.text.primary }]}>
                Day {nextMilestoneDay}
              </Text>
            </View>
            <View style={sm.nextRewardBox}>
              <Text style={sm.nextEmoji}>🎁</Text>
              <Text style={[sm.nextReward, { color: colors.xpGold }]}>
                +{nextRewardXp} XP
              </Text>
            </View>
          </View>

          {/* Restore banner — only while a 24-hour restore window is open */}
          {restorable && (
            <View
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                borderRadius: 12,
                padding: 12,
                marginBottom: 32,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.3)",
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text style={{ fontSize: 18 }}>⏳</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: colors.danger,
                    }}
                  >
                    Restore your streak
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.text.muted,
                      marginTop: 2,
                    }}
                  >
                    Window closes in {fmtCountdown(remainingMs)}
                  </Text>
                </View>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 10,
                  gap: 10,
                }}
              >
                <Text
                  style={{ fontSize: 11, color: colors.text.muted, flex: 1 }}
                >
                  Cost: {restoreCost} XP · Balance: {xpBalance} XP
                </Text>
                <TouchableOpacity
                  onPress={async () => {
                    if (!canAfford) {
                      themedAlert(
                        "Not enough XP",
                        `You need ${restoreCost} XP to restore this streak.`,
                      );
                      return;
                    }
                    const ok = await onRestore();
                    if (ok) onClose();
                  }}
                  disabled={restoring || !canAfford}
                  style={{
                    backgroundColor: canAfford ? colors.xpGold : colors.border,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "800",
                      color: "#1A0A00",
                    }}
                  >
                    {restoring ? "Restoring…" : `Restore · ${restoreCost} XP`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!restorable && <View style={{ marginBottom: 32 }} />}
        </View>
      </View>
    </Modal>
  );
}

// ─── Streak Reward Modal ──────────────────────────────────────────────────────

function StreakRewardModal({
  visible,
  onClose,
  day,
  xp,
}: {
  visible: boolean;
  onClose: () => void;
  day: number;
  xp: number;
}) {
  const colors = useThemeColors();
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(scale, {
        toValue: 1,
        speed: 12,
        bounciness: 12,
        useNativeDriver: true,
      }).start();
    } else {
      scale.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={[sm.wrap, { justifyContent: "center", alignItems: "center" }]}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={sm.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            { transform: [{ scale }] },
            {
              width: "85%",
              backgroundColor: colors.bg.surface,
              borderRadius: radii.xl,
              padding: spacing.xl,
              alignItems: "center",
              borderColor: colors.xpGold,
              borderWidth: 2,
              shadowColor: colors.xpGold,
              shadowOpacity: 0.4,
              shadowRadius: 20,
            },
          ]}
        >
          <Text style={{ fontSize: 50, marginBottom: spacing.sm }}>🎉</Text>
          <Text
            style={{
              fontSize: fontSizes.xl,
              fontWeight: "900",
              color: colors.text.primary,
              textAlign: "center",
              marginBottom: spacing.xs,
            }}
          >
            Day {day} Complete!
          </Text>
          <Text
            style={{
              fontSize: fontSizes.sm,
              color: colors.text.muted,
              textAlign: "center",
              marginBottom: spacing.lg,
            }}
          >
            You've reached Day {day} of your streak. Keep it going!
          </Text>

          <View
            style={{
              backgroundColor: "rgba(251,191,36,0.15)",
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              borderRadius: radii.md,
              marginBottom: spacing.xl,
            }}
          >
            <Text
              style={{
                fontSize: fontSizes.lg,
                fontWeight: "800",
                color: colors.xpGold,
              }}
            >
              + {xp} XP
            </Text>
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={{
              backgroundColor: colors.xpGold,
              paddingHorizontal: spacing.xl,
              paddingVertical: 12,
              borderRadius: radii.full,
              width: "100%",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: fontSizes.md,
                fontWeight: "800",
                color: "#1A0A00",
              }}
            >
              Awesome!
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },
  logo: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: fontSizes.xl,
    fontWeight: "900",
    letterSpacing: 1.5,
    zIndex: -1,
  },
  notifDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  notifDotText: { fontSize: 7, color: "#fff", fontWeight: "800" },
  miniRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  miniCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    gap: 8,
    borderWidth: 1,
  },
  miniEmoji: { fontSize: 22 },
  miniText: { flex: 1 },
  miniVal: { fontSize: fontSizes.md, fontWeight: "800" },
  miniLabel: { fontSize: fontSizes.xs, marginTop: 1 },
  trendScroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  chipText: { fontSize: fontSizes.sm },
  sectionLabel: {
    fontSize: fontSizes.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.1,
    paddingHorizontal: spacing.xl,
    marginBottom: 12,
  },
  // Daily reward
  rewardCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  floatText: {
    position: "absolute",
    top: 0,
    left: "50%",
    fontSize: fontSizes.md,
    fontWeight: "800",
    color: "#FBBF24",
    zIndex: 10,
  },
  rewardIcon: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: "rgba(251,191,36,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  rewardInfo: { flex: 1 },
  rewardTitle: { fontSize: fontSizes.sm, fontWeight: "700" },
  rewardDesc: { fontSize: fontSizes.xs, marginBottom: 6 },
  rewardTrack: { height: 4, borderRadius: radii.full },
  rewardFill: { height: "100%", borderRadius: radii.full },
  claimBtn: {
    borderRadius: radii.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  claimBtnText: { fontSize: fontSizes.xs, fontWeight: "800", color: "#1A0A00" },
  xpCardWrap: { flex: 1 },
  xpParticle: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 999,
  },
  xpParticleInner: {
    backgroundColor: "rgba(251,191,36,0.97)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#FBBF24",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 10,
  },
  xpParticleText: { fontSize: 13, fontWeight: "800", color: "#1a0a00" },
  emptyFilter: {
    textAlign: "center",
    fontSize: fontSizes.sm,
    paddingVertical: spacing.xl,
  },
});

const sm = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: spacing.md,
  },
  titleEmoji: { fontSize: 36 },
  title: { fontSize: fontSizes.xl, fontWeight: "800" },
  sub: { fontSize: fontSizes.sm, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  cycleHeader: {
    fontSize: fontSizes.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  dots: { flexDirection: "row", gap: 6, marginBottom: spacing.md },
  dot: {
    flex: 1,
    height: 40,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  dotDay: { fontSize: 8 },
  dotIcon: { fontSize: 12 },
  nextBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  nextLabel: { fontSize: fontSizes.xs },
  nextDays: { fontSize: fontSizes.lg, fontWeight: "800" },
  nextRewardBox: { alignItems: "flex-end", gap: 2 },
  nextEmoji: { fontSize: 26 },
  nextReward: { fontSize: fontSizes.sm, fontWeight: "700" },
  milestoneHeader: {
    fontSize: fontSizes.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  mRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
  },
  dayBadge: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBadgeText: { fontSize: fontSizes.xs, fontWeight: "800" },
  mEmoji: { fontSize: 22 },
  mLabel: { flex: 1, fontSize: fontSizes.sm, fontWeight: "600" },
  doneBadge: {
    backgroundColor: "rgba(16,185,129,0.18)",
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
  },
  doneText: { fontSize: fontSizes.xs, fontWeight: "700" },
});
