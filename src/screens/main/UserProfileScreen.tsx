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
import SharedProfile from '../../components/profile/SharedProfile';

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
  const { user: initialUser, openPostId, openPost } = route.params;
  const insets     = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors     = useThemeColors();
  const { user: authUser } = useAuth();
  
  const headerComponent = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 10 }}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
      </TouchableOpacity>
      <Text style={{ flex: 1, textAlign: 'center', fontSize: fontSizes.sm, fontWeight: '700', color: colors.text.secondary }}>
        @{initialUser?.username || 'user'}
      </Text>
      <View style={{ width: 36 }} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.base, paddingTop: insets.top }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SharedProfile 
        initialUser={initialUser} 
        isOwnProfile={authUser?.username === initialUser.username}
        headerComponent={headerComponent}
        openPostId={openPostId}
        openPost={openPost}
      />
    </View>
  );
}
