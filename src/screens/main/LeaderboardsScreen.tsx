import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, radii, spacing, type ColorPalette } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import {
  leaderboardService,
  type LeaderboardType,
  type WeeklyLeaderboardEntry,
  type WeeklyLeaderboards,
} from '../../services/leaderboard.service';
import type { HomeStackParamList, LeaderboardsChangedPayload } from '../../types';
import PullToRefreshWrapper from '../../components/common/PullToRefreshWrapper';
import StateBlock from '../../components/common/StateBlock';
import { useGlobalScroll } from '../../context/ScrollContext';
import { accountSocket } from '../../services/accountSocketClient';
import { warn } from '../../utils/logger';

const TABS: { key: LeaderboardType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'feed', label: 'Feed', icon: 'newspaper-outline' },
  { key: 'community', label: 'Community', icon: 'people-circle-outline' },
  { key: 'games', label: 'Games', icon: 'game-controller-outline' },
  { key: 'events', label: 'Events', icon: 'calendar-outline' },
];

const DEFAULT_DATA: WeeklyLeaderboards = {
  weekStart: '',
  rewards: [500, 300, 150],
  feed: [],
  community: [],
  games: [],
  events: [],
  currentUser: {
    feed: null,
    community: null,
    games: null,
    events: null,
  },
};

type LeaderboardScreenRouteProp = RouteProp<HomeStackParamList, 'Leaderboards'>;

export default function LeaderboardsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<LeaderboardScreenRouteProp>();
  const insets = useSafeAreaInsets();
  const { footerHeight } = useGlobalScroll();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  
  // Use lowercased initialTab because TABS keys are lowercase
  const defaultTab = (route.params?.initialTab?.toLowerCase() as LeaderboardType) || 'feed';
  const [activeTab, setActiveTab] = useState<LeaderboardType>(defaultTab);
  
  const [data, setData] = useState<WeeklyLeaderboards>(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Silent vs. visible: initial load shows the inline spinner; pull-to-refresh
  // shows the wrapper spinner; focus re-entry and live xp:updated refreshes
  // are silent (no flicker).
  const refetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await leaderboardService.getWeekly(20);
      setData(res.data || DEFAULT_DATA);
    } catch (error) {
      warn('Failed to refresh weekly leaderboards', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load on mount, then refresh whenever the screen regains focus so the
  // rankings / "Your Position" never go stale after activity elsewhere.
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      refetch(!firstFocusRef.current); // first focus: visible; later: silent
      firstFocusRef.current = false;
    }, [refetch])
  );

  // Live refresh: the backend emits a dedicated leaderboards:changed event
  // after a real game win (not on every XP credit like post views). The weekly
  // rankings are server-computed (wins this week, feed impact, …) and can't be
  // derived from any payload, so the event is just the trigger for a silent
  // refetch — debounced briefly to coalesce near-simultaneous PVP resolutions.
  //
  // Only the ACTIVE tab is refetched (?type=…) and merged in — a burst of
  // likes moves just the Feed board, so the other three heavy aggregate
  // queries are skipped. The server debounces the emit per user too.
  const leaderboardsRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchActiveTab = useCallback(async () => {
    try {
      const res = await leaderboardService.getWeekly(20, activeTab);
      const partial = res.data;
      if (!partial) return;
      setData((prev) => ({
        ...prev,
        ...partial, // weekStart / rewards / this tab's entries
        currentUser: { ...prev.currentUser, ...partial.currentUser },
      }));
    } catch (error) {
      warn('Failed to refresh weekly leaderboard', error);
    }
  }, [activeTab]);
  useEffect(() => {
    const handleLeaderboardsChanged = (_data: LeaderboardsChangedPayload) => {
      if (leaderboardsRefreshTimer.current) clearTimeout(leaderboardsRefreshTimer.current);
      leaderboardsRefreshTimer.current = setTimeout(() => refetchActiveTab(), 1000);
    };
    accountSocket.events.on('leaderboards:changed', handleLeaderboardsChanged);
    return () => {
      accountSocket.events.off('leaderboards:changed', handleLeaderboardsChanged);
      if (leaderboardsRefreshTimer.current) clearTimeout(leaderboardsRefreshTimer.current);
    };
  }, [refetchActiveTab]);

  // Pull-to-refresh re-fetches the weekly rankings from the server.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch(true); // silent internally; the wrapper spinner drives UI
  }, [refetch]);

  const activeEntries = data[activeTab] || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
      <StatusBar style="light" />
      <PullToRefreshWrapper
        refreshing={refreshing}
        onRefresh={onRefresh}
        // This pushed screen has NO MainHeader — its own chrome (back +
        // title + filter tabs) is the pinned block, starting at the wrapper's
        // top. It hides/shows with scroll exactly like the main screens.
        headerOffsetH={0}
        sectionHeaderH={129}
        sectionHeader={
          <>
            <View style={styles.header}>
              <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
                <Ionicons name="chevron-back" size={22} color={colors.text.secondary} />
              </TouchableOpacity>
              <View style={styles.headerText}>
                <Text style={styles.title}>Leaderboards</Text>
                <Text style={styles.subtitle}>Weekly rankings and XP rewards</Text>
              </View>
              <View style={styles.iconButton}>
                <Ionicons name="trophy-outline" size={21} color={colors.xpGold} />
              </View>
            </View>
            <View style={styles.tabRail}>
              {TABS.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={tab.icon} size={15} color={activeTab === tab.key ? '#fff' : colors.text.muted} />
                  <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        }
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
        <View style={styles.rewardStrip}>
          <InfoStat label="1st" value={`+${data.rewards[0] || 0} XP`} />
          <InfoStat label="2nd" value={`+${data.rewards[1] || 0} XP`} />
          <InfoStat label="3rd" value={`+${data.rewards[2] || 0} XP`} />
        </View>

        {loading ? (
          <View style={styles.emptyPanel}>
            <StateBlock inline loading loaderSize={24} />
            <Text style={styles.emptyTitle}>Loading leaderboard</Text>
          </View>
        ) : activeEntries.length === 0 ? (
          <View style={styles.emptyPanel}>
            <Text style={styles.emptyTitle}>No weekly entries yet</Text>
            <Text style={styles.emptyText}>Activity from this week will appear here.</Text>
          </View>
        ) : (
          <View style={styles.listPanel}>
            {activeEntries.map((entry) => (
              <LeaderboardRow key={`${activeTab}-${entry.id}`} entry={entry} />
            ))}
          </View>
        )}
          <View style={{ height: 20 }} />
        </ScrollView>
      </PullToRefreshWrapper>

      {/* Pinned Current User Card */}
      {!loading && (
        <View style={[styles.currentUserPinned, { paddingBottom: footerHeight + spacing.md }]}>
          <Text style={styles.currentUserTitle}>Your Position</Text>
          {data.currentUser?.[activeTab] ? (
            <View style={styles.currentUserCard}>
              <LeaderboardRow entry={data.currentUser[activeTab]!} />
            </View>
          ) : (
            <View style={styles.unrankedCard}>
              <Text style={styles.unrankedText}>Unranked. Join in to get on the board!</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function RewardStacks({
  data,
  activeTab,
  onSelect,
}: {
  data: WeeklyLeaderboards;
  activeTab: LeaderboardType;
  onSelect: (tab: LeaderboardType) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
      {TABS.map((tab) => (
        <RewardStackButton
          key={tab.key}
          label={tab.label}
          entries={(data[tab.key] || []).slice(0, 3)}
          active={activeTab === tab.key}
          onPress={() => onSelect(tab.key)}
        />
      ))}
    </ScrollView>
  );
}

function RewardStackButton({
  label,
  entries,
  active,
  onPress,
}: {
  label: string;
  entries: WeeklyLeaderboardEntry[];
  active: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(lift, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(lift, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [lift]);

  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={active ? [colors.primary, colors.cyanDark] : ['rgba(15,23,42,0.96)', 'rgba(30,41,59,0.9)']}
        style={[styles.stackButton, active && styles.stackButtonActive]}
      >
        <Text style={[styles.stackLabel, active && { color: '#fff' }]}>{label}</Text>
        <View style={styles.stackNames}>
          {(entries.length ? entries : [{ title: 'Open rank' }, { title: 'Open rank' }, { title: 'Open rank' }] as any).map((entry: WeeklyLeaderboardEntry, index: number) => (
            <Animated.View
              key={`${entry.title}-${index}`}
              style={[
                styles.stackNameCard,
                {
                  top: index * 18,
                  transform: [{ translateY: index === 0 ? translateY : 0 }],
                  zIndex: 3 - index,
                  opacity: 1 - index * 0.14,
                },
              ]}
            >
              <Text numberOfLines={1} style={styles.stackNameText}>{entry.title}</Text>
            </Animated.View>
          ))}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.infoStat}>
      <Text style={styles.infoValue}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

function LeaderboardRow({ entry }: { entry: WeeklyLeaderboardEntry }) {
  const colors = useThemeColors();
  const navigation = useNavigation<any>();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const medal = entry.rank === 1 ? '#FBBF24' : entry.rank === 2 ? '#94A3B8' : entry.rank === 3 ? '#CD7C2F' : colors.text.muted;

  const handlePress = () => {
    if (entry.subtitle?.startsWith('@')) {
      const username = entry.subtitle.substring(1);
      navigation.push('UserProfile', { user: { username, name: entry.title, avatarUrl: entry.avatarUrl, handle: username } });
    }
  };

  return (
    <TouchableOpacity style={styles.row} onPress={handlePress} activeOpacity={0.7}>
      <Text style={[styles.rank, { color: medal }]}>{entry.rank}</Text>
      <View style={styles.avatar}>
        {entry.avatarUrl ? (
          <Image source={{ uri: entry.avatarUrl }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarText}>{entry.title?.charAt(0) || 'U'}</Text>
        )}
      </View>
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.rowTitle}>{entry.title}</Text>
        <Text numberOfLines={1} style={styles.rowSub}>{entry.subtitle || entry.metricLabel}</Text>
      </View>
      <View style={styles.rowMetric}>
        <Text style={styles.score}>{entry.score.toLocaleString()}</Text>
        <Text style={styles.metricLabel}>{entry.metricLabel}</Text>
        {entry.rewardXP > 0 && <Text style={styles.reward}>+{entry.rewardXP} XP</Text>}
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    headerText: { flex: 1 },
    title: { fontSize: fontSizes.xl, fontWeight: '900', color: c.text.primary },
    subtitle: { marginTop: 2, fontSize: fontSizes.sm, color: c.text.muted },
    content: { paddingVertical: spacing.md, paddingBottom: 140 },
    stackButton: {
      width: 160,
      height: 104,
      borderRadius: radii.lg,
      padding: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    stackButtonActive: { borderColor: 'rgba(255,255,255,0.28)' },
    stackLabel: { fontSize: fontSizes.sm, fontWeight: '900', color: c.text.primary },
    stackNames: { marginTop: 8, height: 64 },
    stackNameCard: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 30,
      borderRadius: radii.sm,
      justifyContent: 'center',
      paddingHorizontal: 10,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
    },
    stackNameText: { color: '#fff', fontSize: fontSizes.xs, fontWeight: '800' },
    tabRail: {
      flexDirection: 'row',
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      padding: 3,
      borderRadius: radii.md,
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    tab: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radii.sm },
    tabActive: { backgroundColor: c.primary },
    tabText: { fontSize: 10, color: c.text.muted, fontWeight: '800' },
    tabTextActive: { color: '#fff' },
    rewardStrip: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
    infoStat: { flex: 1, alignItems: 'center', padding: 10, borderRadius: radii.md, backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border },
    infoValue: { color: c.xpGold, fontSize: fontSizes.sm, fontWeight: '900' },
    infoLabel: { marginTop: 2, color: c.text.muted, fontSize: 10, fontWeight: '700' },
    listPanel: {
      backgroundColor: c.bg.card,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      borderRadius: radii.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 32,
    },
    row: {
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.bg.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rank: { width: 24, textAlign: 'center', fontSize: fontSizes.md, fontWeight: '900' },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.bg.elevated, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 16,
    },
    rowBody: { flex: 1 },
    rowTitle: { color: c.text.primary, fontSize: fontSizes.sm, fontWeight: '900' },
    rowSub: { marginTop: 2, color: c.text.muted, fontSize: fontSizes.xs },
    rowMetric: { alignItems: 'flex-end', maxWidth: 94 },
    score: { color: c.text.primary, fontSize: fontSizes.sm, fontWeight: '900' },
    metricLabel: { color: c.text.muted, fontSize: 9, marginTop: 1 },
    reward: { color: c.xpGold, fontSize: 10, fontWeight: '900', marginTop: 3 },
    currentUserPinned: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: c.bg.elevated,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 10,
    },
    currentUserTitle: {
      fontSize: fontSizes.sm,
      fontWeight: '800',
      color: c.primaryLight,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    unrankedCard: {
      padding: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
    },
    currentUserCard: {
      backgroundColor: c.bg.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    unrankedText: {
      color: c.text.muted,
      fontSize: fontSizes.sm,
      fontWeight: '600',
    },
    emptyPanel: {
      margin: spacing.lg,
      padding: spacing.xl,
      alignItems: 'center',
      borderRadius: radii.lg,
      backgroundColor: c.bg.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    emptyTitle: { color: c.text.primary, fontSize: fontSizes.md, fontWeight: '900', textAlign: 'center' },
    emptyText: { color: c.text.muted, fontSize: fontSizes.sm, marginTop: 6, textAlign: 'center' },
  });
}
