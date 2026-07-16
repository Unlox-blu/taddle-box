import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Share, Modal,
  TouchableWithoutFeedback, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fontSizes, spacing, radii } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import PostCard          from '../../components/home/PostCard';
import SpotlightCarousel from '../../components/home/SpotlightCarousel';
import SideDrawer        from '../../components/home/SideDrawer';
import { useAuth } from '../../context/AuthContext';
import { usePosts }      from '../../context/PostsContext';
import type { HomeStackParamList, Post } from '../../types';

type HomeNavProp = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;

const TREND_CHIPS = ['All', '#Hackathon', '#GameTime', '#CollegeFest', '#DevLife', '#StudyTips'];

const STREAK_DAYS    = 7;
const COMPLETED_DAYS = [0, 1, 2, 3, 4, 5];
const TODAY_INDEX    = 6;
const WEEK_LABELS    = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const MILESTONES = [
  { days: 3,  label: '+50 XP Bonus',   emoji: '🔥', achieved: true  },
  { days: 7,  label: 'Exclusive Badge', emoji: '🌟', achieved: true  },
  { days: 14, label: '₹5 Cash Reward',  emoji: '💎', achieved: false },
  { days: 30, label: 'Elite Status',    emoji: '👑', achieved: false },
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user: CURRENT_USER } = useAuth();
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<HomeNavProp>();
  const { isDark } = useTheme();
  const colors     = useThemeColors();
  const { posts, toggleLike, toggleSave } = usePosts();

  const [activeTrend, setActiveTrend] = useState('All');
  const [refreshing,  setRefreshing]  = useState(false);
  const [notifCount]                  = useState(0);
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [streakOpen,  setStreakOpen]  = useState(false);

  // XP fly-to-card animation
  const xpCardRef    = useRef<View>(null);
  const xpBounceAnim = useRef(new Animated.Value(1)).current;
  const particleX    = useRef(new Animated.Value(-100)).current;
  const particleY    = useRef(new Animated.Value(-100)).current;
  const particleOpac = useRef(new Animated.Value(0)).current;

  const handleRewardClaim = useCallback((fromX: number, fromY: number) => {
    xpCardRef.current?.measure((_, __, w, h, px, py) => {
      const toX = px + w / 2 - 30;
      const toY = py + h / 2 - 12;
      particleX.setValue(fromX - 30);
      particleY.setValue(fromY - 12);
      particleOpac.setValue(1);
      Animated.parallel([
        Animated.timing(particleX, { toValue: toX, duration: 700, useNativeDriver: true }),
        Animated.timing(particleY, { toValue: toY, duration: 700, useNativeDriver: true }),
      ]).start(() => {
        Animated.timing(particleOpac, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        Animated.sequence([
          Animated.spring(xpBounceAnim, { toValue: 1.4, speed: 28, bounciness: 12, useNativeDriver: true }),
          Animated.spring(xpBounceAnim, { toValue: 1.0, speed: 12, bounciness: 8,  useNativeDriver: true }),
        ]).start();
      });
    });
  }, []);

  const filteredPosts = activeTrend === 'All'
    ? posts
    : posts.filter(p => p.hashtags.includes(activeTrend));

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 900));
    setRefreshing(false);
  };

  const handleAuthorPress = (post: Post) => navigation.navigate('UserProfile', { user: post.author });
  const handleComment     = (post: Post) => navigation.navigate('Comments', { post });
  const handleShare       = async (post: Post) => {
    try { await Share.share({ message: `${post.content}\n\nShared from TADDLEBOX` }); } catch {}
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg.base }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Header ────────────────────────────────── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setDrawerOpen(true)} activeOpacity={0.7}>
          <Ionicons name="menu-outline" size={26} color={colors.text.primary} />
        </TouchableOpacity>

        <Text style={[styles.logo, { color: colors.text.primary }]}>TADDLEBOX</Text>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.navigate('Notifications')}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.text.secondary} />
          {notifCount > 0 && (
            <View style={[styles.notifDot, { borderColor: colors.bg.base }]}>
              <Text style={styles.notifDotText}>{notifCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Streak & XP mini cards ─────────────────── */}
      <View style={styles.miniRow}>
        <TouchableOpacity
          style={[styles.miniCard, { backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.22)' }]}
          onPress={() => setStreakOpen(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.miniEmoji}>🔥</Text>
          <View style={styles.miniText}>
            <Text style={[styles.miniVal, { color: colors.text.primary }]}>{STREAK_DAYS} Days</Text>
            <Text style={[styles.miniLabel, { color: colors.text.muted }]}>Streak</Text>
          </View>
          <Ionicons name="chevron-forward" size={13} color="rgba(251,191,36,0.45)" />
        </TouchableOpacity>

        <Animated.View ref={xpCardRef} style={[styles.xpCardWrap, { transform: [{ scale: xpBounceAnim }] }]}>
          <TouchableOpacity
            style={[styles.miniCard, { backgroundColor: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.22)' }]}
            onPress={() => navigation.getParent()?.navigate('Wallet' as never)}
            activeOpacity={0.8}
          >
            <Text style={styles.miniEmoji}>⚡</Text>
            <View style={styles.miniText}>
              <Text style={[styles.miniVal, { color: colors.xpGold }]}>{(CURRENT_USER?.xp || 0).toLocaleString()}</Text>
              <Text style={[styles.miniLabel, { color: colors.text.muted }]}>Total XP</Text>
            </View>
            <Ionicons name="chevron-forward" size={13} color="rgba(251,191,36,0.45)" />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ── Scrollable feed ───────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <SpotlightCarousel />

        {/* Trending chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendScroll}>
          {TREND_CHIPS.map(chip => (
            <TouchableOpacity
              key={chip}
              onPress={() => setActiveTrend(chip)}
              style={[
                styles.chip,
                { borderColor: activeTrend === chip ? colors.primary : colors.borderHover },
                activeTrend === chip && { backgroundColor: 'rgba(124,58,237,0.18)' },
              ]}
            >
              <Text style={[
                styles.chipText,
                { color: activeTrend === chip ? colors.primaryLight : colors.text.secondary },
                activeTrend === chip && { fontWeight: '700' },
              ]}>
                {chip}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Daily reward */}
        <DailyRewardCard onClaimPos={handleRewardClaim} />

        {/* Feed */}
        <Text style={[styles.sectionLabel, { color: colors.text.muted }]}>Feed 🔥</Text>
        {filteredPosts.length === 0 ? (
          <Text style={[styles.emptyFilter, { color: colors.text.muted }]}>No posts for {activeTrend}</Text>
        ) : (
          filteredPosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onAuthorPress={handleAuthorPress}
              onComment={handleComment}
              onShare={handleShare}
              onLike={toggleLike}
              onSave={toggleSave}
            />
          ))
        )}

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── Side Drawer ────────────────────────────── */}
      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigateTab={tab => navigation.getParent()?.navigate(tab as never)}
        onNavigateStack={screen => {
          if (screen === 'Bookmarks') navigation.navigate('Bookmarks');
          else if (screen === 'Settings') navigation.navigate('Settings');
        }}
        onProfile={() => navigation.getParent()?.navigate('Profile' as never)}
      />

      {/* ── Streak Modal ───────────────────────────── */}
      <StreakModal visible={streakOpen} onClose={() => setStreakOpen(false)} />

      {/* ── XP reward particle (flies to XP card on claim) ── */}
      <Animated.View
        pointerEvents="none"
        style={[styles.xpParticle, {
          opacity: particleOpac,
          transform: [{ translateX: particleX }, { translateY: particleY }],
        }]}
      >
        <View style={styles.xpParticleInner}>
          <Text style={styles.xpParticleText}>⚡ +50 XP</Text>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Daily Reward Card (animated claim + auto-remove) ─────────────────────────

function DailyRewardCard({ onClaimPos }: { onClaimPos?: (x: number, y: number) => void }) {
  const colors = useThemeColors();
  const [claimed, setClaimed] = useState(false);
  const [gone,    setGone]    = useState(false);

  const claimBtnRef = useRef<View>(null);
  const iconScale  = useRef(new Animated.Value(1)).current;
  const floatOpac  = useRef(new Animated.Value(0)).current;
  const floatY     = useRef(new Animated.Value(0)).current;
  const cardOpac   = useRef(new Animated.Value(1)).current;
  const cardSlideY = useRef(new Animated.Value(0)).current;

  const handleClaim = () => {
    if (claimed) return;
    setClaimed(true);
    claimBtnRef.current?.measure((_, __, w, h, px, py) => {
      onClaimPos?.(px + w / 2, py + h / 2);
    });

    // 1 — icon bounce
    Animated.sequence([
      Animated.spring(iconScale, { toValue: 1.55, speed: 28, bounciness: 14, useNativeDriver: true }),
      Animated.spring(iconScale, { toValue: 1.0,  speed: 12, bounciness: 8,  useNativeDriver: true }),
    ]).start();

    // 2 — floating "+50 XP" text rises and fades
    Animated.parallel([
      Animated.timing(floatOpac, { toValue: 1,   duration: 180, useNativeDriver: true }),
      Animated.timing(floatY,    { toValue: -48,  duration: 900, useNativeDriver: true }),
    ]).start(() =>
      Animated.timing(floatOpac, { toValue: 0, duration: 300, useNativeDriver: true }).start()
    );

    // 3 — after 1.8 s card fades + slides down then unmounts
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(cardOpac,   { toValue: 0,  duration: 420, useNativeDriver: true }),
        Animated.timing(cardSlideY, { toValue: 24, duration: 420, useNativeDriver: true }),
      ]).start(() => setGone(true));
    }, 1800);
  };

  if (gone) return null;

  return (
    <Animated.View
      style={[
        styles.rewardCard,
        {
          backgroundColor: claimed ? 'rgba(16,185,129,0.08)' : 'rgba(251,191,36,0.07)',
          borderColor:     claimed ? 'rgba(16,185,129,0.25)' : 'rgba(251,191,36,0.20)',
          opacity:    cardOpac,
          transform:  [{ translateY: cardSlideY }],
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

      <Animated.View style={[styles.rewardIcon, { transform: [{ scale: iconScale }] }]}>
        <Text style={{ fontSize: 26 }}>{claimed ? '✅' : '🎁'}</Text>
      </Animated.View>

      <View style={styles.rewardInfo}>
        <Text style={[styles.rewardTitle, { color: colors.text.primary }]}>
          {claimed ? 'Reward Claimed!' : 'Daily Login Reward'}
        </Text>
        <Text style={[styles.rewardDesc, { color: colors.text.muted }]}>
          {claimed ? 'Come back tomorrow for more XP' : 'Check in every day to earn bonus XP'}
        </Text>
        <View style={[styles.rewardTrack, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
          <View style={[styles.rewardFill, { width: claimed ? '100%' : '70%', backgroundColor: claimed ? '#10B981' : colors.xpGold }]} />
        </View>
      </View>

      {!claimed && (
        <View ref={claimBtnRef}>
          <TouchableOpacity onPress={handleClaim} style={[styles.claimBtn, { backgroundColor: colors.xpGold }]}>
            <Text style={styles.claimBtnText}>Claim!</Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Streak Modal ─────────────────────────────────────────────────────────────

function StreakModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useThemeColors();
  const nextMilestone = MILESTONES.find(m => !m.achieved);
  const daysToNext    = nextMilestone ? nextMilestone.days - STREAK_DAYS : 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={sm.wrap}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={sm.backdrop} />
        </TouchableWithoutFeedback>

        <View style={[sm.sheet, { backgroundColor: colors.bg.surface, borderColor: colors.borderHover }]}>
          <View style={[sm.handle, { backgroundColor: colors.border }]} />

          <View style={sm.titleRow}>
            <Text style={sm.titleEmoji}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={[sm.title, { color: colors.text.primary }]}>Daily Streak</Text>
              <Text style={[sm.sub,   { color: colors.text.muted   }]}>{STREAK_DAYS} days and counting!</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={sm.closeBtn}>
              <Ionicons name="close" size={20} color={colors.text.muted} />
            </TouchableOpacity>
          </View>

          <Text style={[sm.weekHeader, { color: colors.text.muted }]}>This Week</Text>
          <View style={sm.dots}>
            {WEEK_LABELS.map((d, i) => {
              const done  = COMPLETED_DAYS.includes(i);
              const today = i === TODAY_INDEX;
              return (
                <View key={i} style={[
                  sm.dot, { borderColor: colors.border },
                  done  && { backgroundColor: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.30)' },
                  today && { backgroundColor: 'rgba(251,191,36,0.22)', borderColor: colors.xpGold },
                ]}>
                  <Text style={[sm.dotDay, { color: colors.text.muted }]}>{d}</Text>
                  <Text style={sm.dotIcon}>{done ? '✓' : today ? '🔥' : ''}</Text>
                </View>
              );
            })}
          </View>

          {nextMilestone && (
            <View style={[sm.nextBox, { backgroundColor: 'rgba(124,58,237,0.10)', borderColor: 'rgba(124,58,237,0.25)' }]}>
              <View>
                <Text style={[sm.nextLabel, { color: colors.text.muted   }]}>Next reward in</Text>
                <Text style={[sm.nextDays,  { color: colors.primaryLight }]}>{daysToNext} more days</Text>
              </View>
              <View style={sm.nextRewardBox}>
                <Text style={sm.nextEmoji}>{nextMilestone.emoji}</Text>
                <Text style={[sm.nextReward, { color: colors.text.primary }]}>{nextMilestone.label}</Text>
              </View>
            </View>
          )}

          <Text style={[sm.milestoneHeader, { color: colors.text.muted }]}>All Milestones</Text>
          {MILESTONES.map(m => (
            <View key={m.days} style={[sm.mRow, { borderBottomColor: colors.border }]}>
              <View style={[sm.dayBadge, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
                <Text style={[sm.dayBadgeText, { color: colors.text.muted }]}>{m.days}d</Text>
              </View>
              <Text style={sm.mEmoji}>{m.emoji}</Text>
              <Text style={[sm.mLabel, { color: m.achieved ? colors.text.primary : colors.text.muted }]}>{m.label}</Text>
              {m.achieved && (
                <View style={sm.doneBadge}>
                  <Text style={[sm.doneText, { color: colors.success }]}>✓ Achieved</Text>
                </View>
              )}
            </View>
          ))}

          <View style={{ height: 32 }} />
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  logo: {
    flex: 1, textAlign: 'center',
    fontSize: fontSizes.xl, fontWeight: '900', letterSpacing: 1.5,
  },
  notifDot: {
    position: 'absolute', top: 4, right: 4,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  notifDotText: { fontSize: 7, color: '#fff', fontWeight: '800' },
  miniRow: {
    flexDirection: 'row', paddingHorizontal: spacing.lg,
    gap: spacing.sm, marginBottom: spacing.md,
  },
  miniCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: radii.md, gap: 8, borderWidth: 1,
  },
  miniEmoji: { fontSize: 22 },
  miniText:  { flex: 1 },
  miniVal:   { fontSize: fontSizes.md, fontWeight: '800' },
  miniLabel: { fontSize: fontSizes.xs, marginTop: 1 },
  trendScroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 8 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: radii.full, borderWidth: 1,
  },
  chipText: { fontSize: fontSizes.sm },
  sectionLabel: {
    fontSize: fontSizes.xs, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.1,
    paddingHorizontal: spacing.xl, marginBottom: 12,
  },
  // Daily reward
  rewardCard: {
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    borderWidth: 1, borderRadius: radii.lg,
    padding: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  floatText: {
    position: 'absolute', top: 0, left: '50%',
    fontSize: fontSizes.md, fontWeight: '800',
    color: '#FBBF24',
    zIndex: 10,
  },
  rewardIcon: {
    width: 46, height: 46, borderRadius: radii.md,
    backgroundColor: 'rgba(251,191,36,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  rewardInfo:  { flex: 1 },
  rewardTitle: { fontSize: fontSizes.sm, fontWeight: '700' },
  rewardDesc:  { fontSize: fontSizes.xs, marginBottom: 6 },
  rewardTrack: { height: 4, borderRadius: radii.full },
  rewardFill:  { height: '100%', borderRadius: radii.full },
  claimBtn:    { borderRadius: radii.full, paddingVertical: 8, paddingHorizontal: 14 },
  claimBtnText:{ fontSize: fontSizes.xs, fontWeight: '800', color: '#1A0A00' },
  xpCardWrap:  { flex: 1 },
  xpParticle: {
    position: 'absolute', top: 0, left: 0,
    zIndex: 999,
  },
  xpParticleInner: {
    backgroundColor: 'rgba(251,191,36,0.97)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#FBBF24', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 10, elevation: 10,
  },
  xpParticleText: { fontSize: 13, fontWeight: '800', color: '#1a0a00' },
  emptyFilter: {
    textAlign: 'center', fontSize: fontSizes.sm, paddingVertical: spacing.xl,
  },
});

const sm = StyleSheet.create({
  wrap:    { flex: 1, justifyContent: 'flex-end' },
  backdrop:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    borderWidth: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center', width: 38, height: 4,
    borderRadius: 2, marginBottom: spacing.md,
  },
  titleRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.md },
  titleEmoji:{ fontSize: 36 },
  title:     { fontSize: fontSizes.xl, fontWeight: '800' },
  sub:       { fontSize: fontSizes.sm, marginTop: 2 },
  closeBtn:  { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  weekHeader:{ fontSize: fontSizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  dots:      { flexDirection: 'row', gap: 6, marginBottom: spacing.md },
  dot: {
    flex: 1, height: 40, borderRadius: radii.sm,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  dotDay: { fontSize: 8 },
  dotIcon:{ fontSize: 12 },
  nextBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md,
  },
  nextLabel:    { fontSize: fontSizes.xs },
  nextDays:     { fontSize: fontSizes.lg, fontWeight: '800' },
  nextRewardBox:{ alignItems: 'flex-end', gap: 2 },
  nextEmoji:    { fontSize: 26 },
  nextReward:   { fontSize: fontSizes.sm, fontWeight: '700' },
  milestoneHeader:{ fontSize: fontSizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  mRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, gap: 12, borderBottomWidth: 1,
  },
  dayBadge:    { width: 38, height: 38, borderRadius: radii.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayBadgeText:{ fontSize: fontSizes.xs, fontWeight: '800' },
  mEmoji:  { fontSize: 22 },
  mLabel:  { flex: 1, fontSize: fontSizes.sm, fontWeight: '600' },
  doneBadge: {
    backgroundColor: 'rgba(16,185,129,0.18)', borderRadius: radii.full,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)',
  },
  doneText: { fontSize: fontSizes.xs, fontWeight: '700' },
});
