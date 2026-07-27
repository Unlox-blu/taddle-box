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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import XPProgressBar from '../../components/home/XPProgressBar';
import MainHeader from '../../components/common/MainHeader';
import { useAuth } from '../../context/AuthContext';
import PostCard from '../../components/home/PostCard';
import type { Post } from '../../types';
import { userService } from '../../services/user.service';
import { postsService } from '../../services/posts.service';
import { ActivityIndicator } from 'react-native';
import ProfileTabs from '../../components/profile/ProfileTabs';

const { width } = Dimensions.get('window');

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
  });
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const navigation = useNavigation<any>();
  const { user: authUser } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [qrModalVisible, setQrModalVisible] = useState(false);

  const loadProfile = React.useCallback(async (showLoader = false) => {
    if (!authUser?.username) {
      setLoading(false);
      return;
    }

    if (showLoader) setLoading(true);
    try {
      const profileRes = await userService.getProfile(authUser.username);
      if (profileRes?.data) {
        setProfile(profileRes.data);
      }
    } catch (e) {
      console.warn('Failed to load own profile', e);
    } finally {
      setLoading(false);
    }
  }, [authUser?.username]);

  React.useEffect(() => {
    loadProfile(true);
  }, [loadProfile]);

  useFocusEffect(
    React.useCallback(() => {
      loadProfile(false);
    }, [loadProfile])
  );

  React.useEffect(() => {
    if (authUser?.avatarUrl) {
      setProfile((prev: any) => prev ? { ...prev, avatarUrl: authUser.avatarUrl } : prev);
    }
  }, [authUser?.avatarUrl]);

  const displayUser = profile || authUser;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <MainHeader />

      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['rgba(124,58,237,0.28)', 'transparent']}
          style={styles.heroGrad}
        >
          <View style={styles.profileHero}>
            <View style={styles.avatarWrap}>
              <LinearGradient colors={[colors.primary, colors.cyanDark]} style={styles.avatar}>
                {displayUser?.avatarUrl ? (
                  <Image source={{ uri: displayUser.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarEmoji}>👾</Text>
                )}
              </LinearGradient>
              <LinearGradient colors={[colors.xpGold, colors.xpOrange]} style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>{displayUser?.level || 1}</Text>
              </LinearGradient>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{displayUser?.name || 'Taddle User'}</Text>
              <Text style={styles.profileHandle}>@{displayUser?.username || 'user'} · 🏅 {displayUser?.rank || 'Beginner'}</Text>
              <Text style={styles.profileBio}>{displayUser?.bio || 'No bio yet.'}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            {[
              { label: 'Posts',     value: (displayUser?.postCount || 0).toLocaleString()     },
              { label: 'Followers', value: (displayUser?.followerCount || 0).toLocaleString() },
              { label: 'Following', value: (displayUser?.followingCount || 0).toLocaleString() },
              { label: 'Total XP',  value: (displayUser?.xp || 0).toLocaleString(), highlight: true        },
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
            <TouchableOpacity 
              style={styles.editBtn} 
              onPress={() => (navigation as any).navigate('EditProfile')}
            >
              <Ionicons name="pencil-outline" size={14} color={colors.text.primary} />
              <Text style={styles.editBtnText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn} onPress={() => setQrModalVisible(true)}>
              <Ionicons name="qr-code-outline" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <XPProgressBar
          level={displayUser?.level || 1}
          rank={displayUser?.rank || 'Beginner'}
          currentXP={displayUser?.xp || 0}
          targetXP={displayUser?.xpToNext || 500}
        />

        <Text style={styles.sectionLabel}>Achievements 🏆</Text>
        {(displayUser?.badges || []).length > 0 ? (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.badgeScroll}
          >
            {(displayUser?.badges || []).map((b: any) => {
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
        ) : (
          <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
            <Text style={{ color: colors.text.muted, fontSize: fontSizes.sm }}>No achievements yet. Keep participating to earn badges!</Text>
          </View>
        )}

        <View style={styles.commStats}>
          {[
            { icon: 'people-outline',          label: 'Communities', value: `${displayUser?.communitiesJoinedCount || 0} joined`   },
            { icon: 'game-controller-outline',  label: 'Games',       value: `${displayUser?.gamesPlayedCount || 0} played` },
            { icon: 'school-outline',           label: 'Organization',     value: displayUser?.organization || 'None' },
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

        <ProfileTabs userId={displayUser?.id} />

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* QR Code Modal */}
      {qrModalVisible && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <View style={{ backgroundColor: colors.bg.card, padding: 32, borderRadius: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>Share Profile</Text>
            <Text style={{ fontSize: 14, color: colors.text.secondary, marginBottom: 24 }}>Scan to follow @{displayUser?.username}</Text>
            
            <View style={{ width: 200, height: 200, backgroundColor: '#fff', borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 24, overflow: 'hidden' }}>
              <Image 
                source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=taddlebox://user/${displayUser?.username}` }}
                style={{ width: 180, height: 180 }}
              />
            </View>

            <TouchableOpacity 
              style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 100 }}
              onPress={() => setQrModalVisible(false)}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
