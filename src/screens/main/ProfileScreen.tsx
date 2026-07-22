import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import XPProgressBar from '../../components/home/XPProgressBar';
// removed mockData import
import { useAuth } from '../../context/AuthContext';

const { width } = Dimensions.get('window');
const POST_SIZE = (width - spacing.lg * 2 - 4) / 3;
const POST_EMOJIS = ['🎮', '🚀', '♟️', '💡', '🎯', '🔥', '🏆', '⚡', '🌟'];

const BADGE_COLORS: Record<string, { bg: string; border: string }> = {
  gold:   { bg: 'rgba(251,191,36,0.13)',  border: 'rgba(251,191,36,0.28)'  },
  purple: { bg: 'rgba(124,58,237,0.13)',  border: 'rgba(124,58,237,0.28)'  },
  cyan:   { bg: 'rgba(6,182,212,0.13)',   border: 'rgba(6,182,212,0.28)'   },
  green:  { bg: 'rgba(16,185,129,0.13)',  border: 'rgba(16,185,129,0.28)'  },
};

type Tab = 'posts' | 'media' | 'saved' | 'games';

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    topRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.xl, paddingVertical: 10,
    },
    topHandle: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.secondary },
    topActions: { flexDirection: 'row', gap: 8 },
    iconBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },
    heroGrad: { paddingBottom: 0 },
    profileHero: {
      flexDirection: 'row', gap: 16,
      paddingHorizontal: spacing.xl, paddingBottom: 12,
      alignItems: 'flex-end',
    },
    avatarWrap: { position: 'relative' },
    avatar: {
      width: 80, height: 80, borderRadius: 40,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 3, borderColor: c.bg.base,
      overflow: 'hidden',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarEmoji: { fontSize: 36 },
    levelBadge: {
      position: 'absolute', bottom: -4, right: -4,
      width: 26, height: 26, borderRadius: 13,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: c.bg.base,
    },
    levelBadgeText: { fontSize: fontSizes.xs, fontWeight: '800', color: '#1A0A00' },
    profileInfo: { flex: 1 },
    profileName: { fontSize: fontSizes.xxl, fontWeight: '800', color: c.text.primary },
    profileHandle: { fontSize: fontSizes.sm, color: c.text.muted, marginBottom: 5 },
    profileBio: { fontSize: fontSizes.sm, color: c.text.secondary, lineHeight: 18 },
    statsRow: {
      flexDirection: 'row',
      paddingHorizontal: spacing.xl, paddingVertical: 14,
      borderTopWidth: 1, borderTopColor: c.border,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statVal:   { fontSize: fontSizes.lg, fontWeight: '800', color: c.text.primary },
    statLabel: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },
    profileBtns: {
      flexDirection: 'row', gap: 10,
      paddingHorizontal: spacing.xl, paddingVertical: 12,
    },
    editBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderWidth: 1, borderColor: c.borderHover,
      borderRadius: radii.md, paddingVertical: 9,
    },
    editBtnText: { fontSize: fontSizes.sm, fontWeight: '600', color: c.text.primary },
    shareBtn: {
      width: 40, height: 40, borderRadius: radii.md,
      borderWidth: 1, borderColor: c.borderHover,
      alignItems: 'center', justifyContent: 'center',
    },
    sectionLabel: {
      fontSize: fontSizes.xs, color: c.text.muted,
      fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.1,
      paddingHorizontal: spacing.xl, marginBottom: 10,
    },
    badgeScroll: { paddingHorizontal: spacing.xl, gap: 12, marginBottom: spacing.md },
    badgeItem:   { alignItems: 'center', gap: 5 },
    badgeWrap: {
      width: 52, height: 52, borderRadius: radii.md,
      borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    },
    badgeEmoji: { fontSize: 24 },
    badgeName:  { fontSize: 9, color: c.text.muted, textAlign: 'center', maxWidth: 52 },
    commStats: {
      marginHorizontal: spacing.lg, marginBottom: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg, borderWidth: 1, borderColor: c.border,
      padding: spacing.md, gap: 12,
    },
    commStatItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    commStatVal:  { fontSize: fontSizes.sm, fontWeight: '600', color: c.text.primary },
    commStatLabel:{ fontSize: fontSizes.xs, color: c.text.muted },
    tabRow: {
      flexDirection: 'row',
      borderTopWidth: 1, borderTopColor: c.border,
      borderBottomWidth: 1, borderBottomColor: c.border,
      marginBottom: 2,
    },
    tabItem: {
      flex: 1, paddingVertical: 11, alignItems: 'center',
      borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    tabItemActive: { borderBottomColor: c.primaryLight },
    tabText: { fontSize: fontSizes.sm, color: c.text.muted, fontWeight: '600' },
    tabTextActive: { color: c.primaryLight },
    postsGrid: {
      flexDirection: 'row', flexWrap: 'wrap',
      paddingHorizontal: spacing.lg, gap: 2,
    },
    postGridItem: { width: POST_SIZE, height: POST_SIZE },
    postGridBg: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      borderRadius: 4, overflow: 'hidden', position: 'relative',
    },
    postGridEmoji: { fontSize: 32 },
    postGridOverlay: {
      position: 'absolute', bottom: 5, left: 5,
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: 'rgba(0,0,0,0.5)',
      paddingVertical: 2, paddingHorizontal: 6,
      borderRadius: 4,
    },
    postGridLikes: { fontSize: fontSizes.xs, color: '#fff', fontWeight: '600' },
  });
}

export default function ProfileScreen() {
  const insets   = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<Tab>('posts');
  const { user } = useAuth();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.topRow}>
        <Text style={styles.topHandle}>@{user?.username || 'user'}</Text>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="share-social-outline" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['rgba(124,58,237,0.28)', 'transparent']}
          style={styles.heroGrad}
        >
          <View style={styles.profileHero}>
            <View style={styles.avatarWrap}>
              <LinearGradient colors={[colors.primary, colors.cyanDark]} style={styles.avatar}>
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarEmoji}>👾</Text>
                )}
              </LinearGradient>
              <LinearGradient colors={[colors.xpGold, colors.xpOrange]} style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>{user?.level || 1}</Text>
              </LinearGradient>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name || 'Taddle User'}</Text>
              <Text style={styles.profileHandle}>@{user?.username || 'user'} · 🏅 {user?.rank || 'Beginner'}</Text>
              <Text style={styles.profileBio}>{user?.bio || 'No bio yet.'}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            {[
              { label: 'Posts',     value: (user?.postCount || 0).toLocaleString()     },
              { label: 'Followers', value: ((user?.followerCount || 0) >= 1000 ? ((user?.followerCount || 0) / 1000).toFixed(1) + 'k' : (user?.followerCount || 0).toString()) },
              { label: 'Following', value: (user?.followingCount || 0).toLocaleString() },
              { label: 'Total XP',  value: (user?.xp || 0).toLocaleString(), highlight: true        },
            ].map(s => (
              <View key={s.label} style={styles.statItem}>
                <Text style={[styles.statVal, s.highlight && { color: colors.xpGold }]}>
                  {s.value}
                </Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.profileBtns}>
            <TouchableOpacity style={styles.editBtn}>
              <Ionicons name="pencil-outline" size={14} color={colors.text.primary} />
              <Text style={styles.editBtnText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn}>
              <Ionicons name="qr-code-outline" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <XPProgressBar
          level={user?.level || 1}
          rank={user?.rank || 'Beginner'}
          currentXP={user?.xp || 0}
          targetXP={user?.xpToNext || 500}
        />

        <Text style={styles.sectionLabel}>Achievements 🏆</Text>
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.badgeScroll}
        >
          {(user?.badges || []).map((b: any) => {
            const bStyle = BADGE_COLORS[b.color] ?? { bg: colors.bg.elevated, border: colors.border };
            return (
              <View key={b.id} style={styles.badgeItem}>
                <View style={[
                  styles.badgeWrap,
                  { backgroundColor: bStyle.bg, borderColor: bStyle.border },
                  b.color === 'locked' && { opacity: 0.38 },
                ]}>
                  <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                </View>
                <Text style={styles.badgeName}>{b.name}</Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.commStats}>
          {[
            { icon: 'people-outline',          label: 'Communities', value: '8 joined'   },
            { icon: 'game-controller-outline',  label: 'Games',       value: '142 played' },
            { icon: 'school-outline',           label: 'Organization',     value: user.organization },
          ].map(s => (
            <View key={s.label} style={styles.commStatItem}>
              <Ionicons name={s.icon as any} size={16} color={colors.primaryLight} />
              <View>
                <Text style={styles.commStatVal}>{s.value}</Text>
                <Text style={styles.commStatLabel}>{s.label}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.tabRow}>
          {(['posts', 'media', 'saved', 'games'] as Tab[]).map(t => (
            <TouchableOpacity
              key={t} onPress={() => setTab(t)}
              style={[styles.tabItem, tab === t && styles.tabItemActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.postsGrid}>
          {POST_EMOJIS.map((emoji, i) => (
            <TouchableOpacity key={i} style={styles.postGridItem} activeOpacity={0.8}>
              <View style={[styles.postGridBg, {
                backgroundColor: i % 3 === 0 ? '#1a0a3e' : i % 3 === 1 ? '#0a2e1a' : '#2e1a0a',
              }]}>
                <Text style={styles.postGridEmoji}>{emoji}</Text>
                <View style={styles.postGridOverlay}>
                  <Ionicons name="heart" size={14} color="#fff" />
                  <Text style={styles.postGridLikes}>{(Math.random() * 900 + 50).toFixed(0)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}
