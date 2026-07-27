import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, ActivityIndicator, FlatList, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors, useTheme } from '../../context/ThemeContext';
import { userService } from '../../services/user.service';
import { postsService } from '../../services/posts.service';
import type { HomeStackParamList, User, Post } from '../../types';
import ProfileTabs from '../../components/profile/ProfileTabs';
import XPProgressBar from '../../components/home/XPProgressBar';

type Props = NativeStackScreenProps<HomeStackParamList, 'UserProfile'>;

const { width } = Dimensions.get('window');

const BADGE_COLORS: Record<string, { bg: string; border: string }> = {
  gold:   { bg: 'rgba(251,191,36,0.13)',  border: 'rgba(251,191,36,0.28)'  },
  purple: { bg: 'rgba(124,58,237,0.13)',  border: 'rgba(124,58,237,0.28)'  },
  cyan:   { bg: 'rgba(6,182,212,0.13)',   border: 'rgba(6,182,212,0.28)'   },
  green:  { bg: 'rgba(16,185,129,0.13)',  border: 'rgba(16,185,129,0.28)'  },
};

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },

    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingVertical: 10,
    },
    backBtn: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
    },
    headerHandle: {
      flex: 1, textAlign: 'center',
      fontSize: fontSizes.sm, fontWeight: '700', color: c.text.secondary,
    },
    iconBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },

    heroGrad: { paddingBottom: 4 },
    profileRow: {
      flexDirection: 'row', gap: 16, alignItems: 'flex-end',
      paddingHorizontal: spacing.xl, paddingBottom: 14,
    },
    avatarWrap: { position: 'relative' },
    avatar: {
      width: 80, height: 80, borderRadius: 40,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 3, borderColor: c.bg.base,
    },
    avatarEmoji: { fontSize: 36 },
    levelBadge: {
      position: 'absolute', bottom: -4, right: -4,
      width: 26, height: 26, borderRadius: 13,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: c.bg.base,
    },
    levelText: { fontSize: fontSizes.xs, fontWeight: '800', color: '#1A0A00' },
    profileInfo: { flex: 1 },
    name:        { fontSize: fontSizes.xxl, fontWeight: '800', color: c.text.primary },
    handleRank:  { fontSize: fontSizes.sm, color: c.text.muted, marginBottom: 4 },
    bio:         { fontSize: fontSizes.sm, color: c.text.secondary, lineHeight: 18 },

    statsRow: {
      flexDirection: 'row',
      paddingHorizontal: spacing.xl, paddingVertical: 14,
      borderTopWidth: 1, borderTopColor: c.border,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    statItem:  { flex: 1, alignItems: 'center' },
    statVal:   { fontSize: fontSizes.lg, fontWeight: '800', color: c.text.primary },
    statLabel: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },

    btnRow: {
      flexDirection: 'row', gap: 10, alignItems: 'center',
      paddingHorizontal: spacing.xl, paddingVertical: 12,
    },
    followBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.primary, borderRadius: radii.md, paddingVertical: 10,
    },
    followBtnActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderHover },
    followBtnText:      { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },
    followBtnTextActive:{ color: c.text.primary },
    msgBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.borderHover,
      borderRadius: radii.md, paddingVertical: 10,
    },
    msgBtnText: { fontSize: fontSizes.sm, fontWeight: '600', color: c.text.primary },
    moreBtn: {
      width: 40, height: 40, borderRadius: radii.md,
      borderWidth: 1, borderColor: c.borderHover,
      alignItems: 'center', justifyContent: 'center',
    },

    infoCard: {
      marginHorizontal: spacing.lg, marginVertical: spacing.md,
      backgroundColor: c.bg.card, borderRadius: radii.lg,
      borderWidth: 1, borderColor: c.border,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      gap: 10,
    },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    infoLabel: { fontSize: fontSizes.xs, color: c.text.muted, width: 90 },
    infoValue: { flex: 1, fontSize: fontSizes.sm, fontWeight: '600', color: c.text.primary },

    sectionLabel: {
      fontSize: fontSizes.xs, fontWeight: '700', color: c.text.muted,
      textTransform: 'uppercase', letterSpacing: 0.5,
      paddingHorizontal: spacing.xl, marginBottom: 10, marginTop: 4,
    },

    badgeScroll: { paddingHorizontal: spacing.xl, gap: 12, marginBottom: spacing.md },
    badgeItem:   { alignItems: 'center', gap: 5 },
    badgeWrap: {
      width: 52, height: 52, borderRadius: radii.md,
      borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    },
    badgeEmoji: { fontSize: 24 },
    badgeName:  { fontSize: 9, color: c.text.muted, textAlign: 'center', maxWidth: 52 },

  });
}

export default function UserProfileScreen({ navigation, route }: Props) {
  const { user: initialUser }   = route.params;
  const insets     = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors     = useThemeColors();
  const styles     = useMemo(() => makeStyles(colors), [colors]);

  const [user, setUser] = useState<any>(initialUser);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [followed, setFollowed] = useState(false);

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      try {
        const username = initialUser?.username || '';
        const profileRes = await userService.getProfile(username);
        if (active && profileRes?.data) {
          setUser(profileRes.data);
          // Assuming the backend has a way to check if we follow them or we use a field from profile
        }
      } catch (e) {
        console.warn('Failed to load profile', e);
      }
    };
    loadProfile();
    return () => { active = false; };
  }, [initialUser]);

  const handleFollowToggle = async () => {
    try {
      if (followed) {
        await userService.unfollowUser(user.username);
        setFollowed(false);
      } else {
        await userService.followUser(user.username);
        setFollowed(true);
      }
    } catch (e) {
      console.warn('Failed to toggle follow', e);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerHandle}>@{user?.username || 'user'}</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setQrModalVisible(true)}>
          <Ionicons name="share-social-outline" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['rgba(124,58,237,0.28)', 'transparent']}
          style={styles.heroGrad}
        >
          <View style={styles.profileRow}>
            <View style={styles.avatarWrap}>
              <LinearGradient colors={[colors.primary, colors.cyanDark]} style={styles.avatar}>
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={styles.avatarEmoji}>👾</Text>
                )}
              </LinearGradient>
              <LinearGradient colors={[colors.xpGold, colors.xpOrange]} style={styles.levelBadge}>
                <Text style={styles.levelText}>{user?.level || 1}</Text>
              </LinearGradient>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.name}>{user?.name || 'Taddle User'}</Text>
              <Text style={styles.handleRank}>@{user?.username || 'user'} · 🏅 {user?.rank || 'Beginner'}</Text>
              <Text style={styles.bio}>{user?.bio || 'No bio yet.'}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            {[
              { label: 'Posts',     value: (user?.postCount || 0).toLocaleString() },
              { label: 'Followers', value: ((user?.followerCount || 0) + (followed ? 1 : 0)).toLocaleString() },
              { label: 'Following', value: (user?.followingCount || 0).toLocaleString() },
              { label: 'Total XP',  value: (user?.xp || 0).toLocaleString(), highlight: true },
            ].map(s => (
              <View key={s.label} style={styles.statItem}>
                <Text style={[styles.statVal, s.highlight && { color: colors.xpGold }]}>
                  {s.value}
                </Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              onPress={handleFollowToggle}
              style={[styles.followBtn, followed && styles.followBtnActive]}
            >
              {followed
                ? <Ionicons name="checkmark" size={16} color={colors.text.primary} style={{ marginRight: 6 }} />
                : <Ionicons name="person-add-outline" size={16} color="#fff" style={{ marginRight: 6 }} />}
              <Text style={[styles.followBtnText, followed && styles.followBtnTextActive]}>
                {followed ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.msgBtn}>
              <Ionicons name="chatbubble-outline" size={16} color={colors.text.primary} style={{ marginRight: 6 }} />
              <Text style={styles.msgBtnText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moreBtn}>
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <XPProgressBar
          level={user?.level || 1}
          rank={user?.rank || 'Beginner'}
          currentXP={user?.xp || 0}
          targetXP={user?.xpToNext || 500}
        />

        <View style={styles.infoCard}>
          {[
            { icon: 'school-outline',          label: 'Organization',     value: user?.organization || 'None' },
            { icon: 'people-outline',          label: 'Communities', value: `${user?.communitiesJoinedCount || 0} joined`  },
            { icon: 'game-controller-outline', label: 'Games',       value: `${user?.gamesPlayedCount || 0} played`},
          ].map(item => (
            <View key={item.label} style={styles.infoRow}>
              <Ionicons name={item.icon as any} size={16} color={colors.primaryLight} />
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={styles.infoValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        {((user?.badges || []).length > 0) && (
          <>
            <Text style={styles.sectionLabel}>Achievements 🏆</Text>
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.badgeScroll}
            >
              {(user?.badges || []).map((b: any) => {
                const bs = BADGE_COLORS[b.color] ?? { bg: colors.bg.elevated, border: colors.border };
                return (
                  <View key={b.id} style={styles.badgeItem}>
                    <View style={[
                      styles.badgeWrap,
                      { backgroundColor: bs.bg, borderColor: bs.border },
                      b.color === 'locked' && { opacity: 0.38 },
                    ]}>
                      <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                    </View>
                    <Text style={styles.badgeName}>{b.name}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}

        <ProfileTabs userId={user?.id} />

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* QR Code Modal */}
      {qrModalVisible && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <View style={{ backgroundColor: colors.bg.card, padding: 32, borderRadius: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>Share Profile</Text>
            <Text style={{ fontSize: 14, color: colors.text.secondary, marginBottom: 24 }}>Scan to follow @{user?.username}</Text>
            
            <View style={{ width: 200, height: 200, backgroundColor: '#fff', borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 24, overflow: 'hidden' }}>
              <Image 
                source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=taddlebox://user/${user?.username}` }}
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
