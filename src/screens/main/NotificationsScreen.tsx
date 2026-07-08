import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import type { HomeStackParamList, Notification } from '../../types';
import { NOTIFICATIONS } from '../../types/mockData';

type Props = NativeStackScreenProps<HomeStackParamList, 'Notifications'>;

const NOTIF_ICON: Record<Notification['type'], string> = {
  like: 'heart', comment: 'chatbubble', follow: 'person-add',
  mention: 'at', event: 'calendar', achievement: 'trophy',
};

const GROUPS: { key: Notification['group']; label: string }[] = [
  { key: 'today',     label: 'Today'     },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'earlier',   label: 'Earlier'   },
];

function getNotifColor(c: ColorPalette): Record<Notification['type'], string> {
  return {
    like: c.pink, comment: c.primaryLight, follow: c.cyan,
    mention: c.cyanLight, event: c.xpGold, achievement: c.xpGold,
  };
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },

    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center', marginRight: 4,
    },
    headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: fontSizes.lg, fontWeight: '800', color: c.text.primary },
    badge: {
      backgroundColor: c.primary,
      borderRadius: radii.full, minWidth: 20, height: 20,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
    },
    badgeText: { fontSize: fontSizes.xs, color: '#fff', fontWeight: '700' },
    markAll:    { fontSize: fontSizes.xs, color: c.primaryLight, fontWeight: '600' },
    markAllDim: { color: c.text.muted },

    groupLabel: {
      fontSize: fontSizes.xs, fontWeight: '700', color: c.text.muted,
      textTransform: 'uppercase', letterSpacing: 0.5,
      paddingHorizontal: spacing.xl, paddingTop: 16, paddingBottom: 4,
    },

    row: {
      flexDirection: 'row', alignItems: 'flex-start',
      paddingHorizontal: spacing.lg, paddingVertical: 14, gap: 12,
    },
    rowUnread: { backgroundColor: 'rgba(124,58,237,0.07)' },

    avatarWrap: { position: 'relative', width: 46 },
    avatar: {
      width: 46, height: 46, borderRadius: 23,
      backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarEmoji: { fontSize: 22 },
    typeDot: {
      position: 'absolute', bottom: -2, right: -2,
      width: 18, height: 18, borderRadius: 9,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: c.bg.base,
    },

    content: { flex: 1 },
    notifText: { fontSize: fontSizes.sm, color: c.text.secondary, lineHeight: 20 },
    actor:     { fontWeight: '700', color: c.text.primary },
    notifBody: { fontWeight: '400' },
    time:      { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 4 },

    unreadDot: {
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: c.primary, marginTop: 10, flexShrink: 0,
    },
  });
}

export default function NotificationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const notifColor = useMemo(() => getNotifColor(colors), [colors]);

  const [notifs, setNotifs] = useState<Notification[]>(NOTIFICATIONS);

  const markAllRead = () => setNotifs(n => n.map(x => ({ ...x, isRead: true })));
  const markRead    = (id: string) =>
    setNotifs(n => n.map(x => x.id === id ? { ...x, isRead: true } : x));

  const unreadCount = notifs.filter(n => !n.isRead).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={markAllRead} disabled={unreadCount === 0}>
          <Text style={[styles.markAll, unreadCount === 0 && styles.markAllDim]}>
            Mark all read
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {GROUPS.map(group => {
          const items = notifs.filter(n => n.group === group.key);
          if (!items.length) return null;
          return (
            <View key={group.key}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {items.map(notif => (
                <TouchableOpacity
                  key={notif.id}
                  style={[styles.row, !notif.isRead && styles.rowUnread]}
                  onPress={() => markRead(notif.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatarWrap}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarEmoji}>{notif.avatar}</Text>
                    </View>
                    <View style={[styles.typeDot, { backgroundColor: notifColor[notif.type] }]}>
                      <Ionicons name={NOTIF_ICON[notif.type] as any} size={8} color="#fff" />
                    </View>
                  </View>

                  <View style={styles.content}>
                    <Text style={styles.notifText} numberOfLines={3}>
                      <Text style={styles.actor}>{notif.actor} </Text>
                      <Text style={styles.notifBody}>{notif.text}</Text>
                    </Text>
                    <Text style={styles.time}>{notif.time}</Text>
                  </View>

                  {!notif.isRead && <View style={styles.unreadDot} />}
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
