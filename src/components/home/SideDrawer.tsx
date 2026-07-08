import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback,
  Animated, StyleSheet, Dimensions, ScrollView, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fontSizes, spacing, radii } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import { CURRENT_USER } from '../../types/mockData';

const { width: SW } = Dimensions.get('window');
const DRAWER_W     = Math.min(Math.round(SW * 0.82), 320);
const CLOSE_DELAY  = 280; // ms — wait for drawer to slide out before navigating

interface Props {
  visible:          boolean;
  onClose:          () => void;
  onNavigateTab:    (tab: string) => void;
  onNavigateStack:  (screen: string) => void;
  onProfile:        () => void;
}

type MenuRow = {
  icon:    keyof typeof Ionicons.glyphMap;
  label:   string;
  badge?:  string;
  onPress: () => void;
  purple?: boolean;
};

export default function SideDrawer({
  visible, onClose, onNavigateTab, onNavigateStack, onProfile,
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const slideX   = useRef(new Animated.Value(-DRAWER_W)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const cfg = visible
      ? { slide: 0,         back: 1, dur: 280 }
      : { slide: -DRAWER_W, back: 0, dur: 220 };
    Animated.parallel([
      Animated.spring(slideX,   { toValue: cfg.slide, damping: 24, stiffness: 220, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: cfg.back,  duration: cfg.dur,           useNativeDriver: true }),
    ]).start();
  }, [visible]);

  // Delay navigation until after the close animation finishes — prevents flicker
  const closeAndNavigateTab = (tab: string) => {
    onClose();
    setTimeout(() => onNavigateTab(tab), CLOSE_DELAY);
  };

  const closeAndNavigateStack = (screen: string) => {
    onClose();
    setTimeout(() => onNavigateStack(screen), CLOSE_DELAY);
  };

  const closeAndProfile = () => {
    onClose();
    setTimeout(() => onProfile(), CLOSE_DELAY);
  };

  const mainMenu: MenuRow[] = [
    {
      icon: 'wallet-outline', label: 'Wallet', purple: true,
      onPress: () => closeAndNavigateTab('Wallet'),
    },
    {
      icon: 'bookmark-outline', label: 'Bookmarks', purple: true,
      onPress: () => closeAndNavigateStack('Bookmarks'),
    },
  ];

  const moreMenu: MenuRow[] = [
    {
      icon: 'shield-checkmark-outline', label: 'Privacy Policy',
      onPress: () => { onClose(); },
    },
    {
      icon: 'document-text-outline', label: 'User Agreement',
      onPress: () => { onClose(); },
    },
    {
      icon: 'settings-outline', label: 'Settings',
      onPress: () => closeAndNavigateStack('Settings'),
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.panel,
          {
            transform: [{ translateX: slideX }],
            paddingTop: insets.top + 8,
            backgroundColor: colors.bg.surface,
            borderRightColor: colors.borderHover,
          },
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

          {/* ── Profile header ── */}
          <TouchableOpacity
            style={styles.profileRow}
            onPress={closeAndProfile}
            activeOpacity={0.75}
          >
            <LinearGradient colors={['#4C1D95', '#7C3AED']} style={styles.avatar}>
              <Text style={styles.avatarText}>{CURRENT_USER.avatar}</Text>
            </LinearGradient>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName,    { color: colors.text.primary   }]}>{CURRENT_USER.name}</Text>
              <Text style={[styles.profileHandle,  { color: colors.primaryLight   }]}>{CURRENT_USER.handle}</Text>
              <Text style={[styles.profileCollege, { color: colors.text.muted     }]}>{CURRENT_USER.college}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
          </TouchableOpacity>

          {/* Stats strip */}
          <View style={[styles.statsStrip, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
            <StatBox value={CURRENT_USER.followers.toLocaleString()} label="Followers" colors={colors} />
            <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
            <StatBox value={CURRENT_USER.following.toLocaleString()} label="Following" colors={colors} />
            <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
            <StatBox value={`${CURRENT_USER.posts}`} label="Posts" colors={colors} />
          </View>

          {/* Rank / XP row */}
          <View style={styles.rankRow}>
            <View style={[styles.rankBadge, { backgroundColor: 'rgba(124,58,237,0.18)', borderColor: 'rgba(124,58,237,0.35)' }]}>
              <Text style={[styles.rankBadgeText, { color: colors.primaryLight }]}>⚡ {CURRENT_USER.rank}</Text>
            </View>
            <Text style={[styles.rankXP, { color: colors.text.muted }]}>Lv {CURRENT_USER.level} · {CURRENT_USER.xp.toLocaleString()} XP</Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {mainMenu.map(row => <DrawerRow key={row.label} colors={colors} {...row} />)}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {moreMenu.map(row => <DrawerRow key={row.label} colors={colors} {...row} />)}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.footer}>
            <Text style={[styles.footerApp,     { color: colors.text.muted }]}>TADDLEBOX</Text>
            <Text style={[styles.footerVersion, { color: colors.text.muted }]}>v1.0.0 · Made for college students ❤️</Text>
          </View>

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ── sub-components ───────────────────────────────────────────────────────────

function StatBox({ value, label, colors }: { value: string; label: string; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statVal,   { color: colors.text.primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.text.muted   }]}>{label}</Text>
    </View>
  );
}

function DrawerRow({ icon, label, badge, onPress, purple, colors }: MenuRow & { colors: ReturnType<typeof useThemeColors> }) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[
        styles.menuIconWrap,
        { backgroundColor: purple ? 'rgba(124,58,237,0.14)' : colors.bg.card },
        purple && { borderWidth: 1, borderColor: 'rgba(124,58,237,0.25)' },
      ]}>
        <Ionicons name={icon} size={20} color={purple ? colors.primaryLight : colors.text.secondary} />
      </View>
      <Text style={[styles.menuLabel, { color: purple ? colors.text.primary : colors.text.secondary }]}>
        {label}
      </Text>
      {badge !== undefined && (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={15} color={colors.text.muted} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  panel: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: DRAWER_W, borderRightWidth: 1,
  },
  profileRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, gap: 12,
  },
  avatar: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(124,58,237,0.4)',
  },
  avatarText:    { fontSize: 28 },
  profileInfo:   { flex: 1 },
  profileName:   { fontSize: fontSizes.md, fontWeight: '800' },
  profileHandle: { fontSize: fontSizes.sm, marginTop: 2 },
  profileCollege:{ fontSize: fontSizes.xs, marginTop: 2 },
  statsStrip: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    borderRadius: radii.md, paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  statBox:  { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statDiv:  { width: 1, marginVertical: 4 },
  statVal:  { fontSize: fontSizes.md, fontWeight: '800' },
  statLabel:{ fontSize: fontSizes.xs, marginTop: 2 },
  rankRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: 10,
  },
  rankBadge: {
    borderRadius: radii.full, borderWidth: 1,
    paddingVertical: 3, paddingHorizontal: 10,
  },
  rankBadgeText: { fontSize: fontSizes.xs, fontWeight: '700' },
  rankXP:        { fontSize: fontSizes.xs },
  divider:       { height: 1, marginVertical: spacing.xs },
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: 13, gap: 14,
  },
  menuIconWrap: {
    width: 38, height: 38, borderRadius: radii.md,
    alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: fontSizes.md, fontWeight: '600' },
  badge: { borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: fontSizes.xs, color: '#fff', fontWeight: '700' },
  footer:        { paddingHorizontal: spacing.lg, paddingTop: spacing.md, alignItems: 'center' },
  footerApp:     { fontSize: fontSizes.sm, fontWeight: '800', letterSpacing: 1 },
  footerVersion: { fontSize: fontSizes.xs, marginTop: 4 },
});
