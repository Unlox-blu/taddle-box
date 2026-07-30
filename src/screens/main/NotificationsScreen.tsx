import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import type { HomeStackParamList, Notification } from '../../types';
import { notificationService } from '../../services/notification.service';

type Props = NativeStackScreenProps<HomeStackParamList, 'Notifications'>;

const NOTIF_ICON: Record<Notification['type'], string> = {
  like: 'heart', comment: 'chatbubble', follow: 'person-add',
  mention: 'at', event: 'calendar', achievement: 'trophy', game_invite: 'game-controller'
};

const GROUPS: { key: Notification['group']; label: string }[] = [
  { key: 'today',     label: 'Today'     },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'earlier',   label: 'Earlier'   },
];

function getNotifColor(c: ColorPalette): Record<Notification['type'], string> {
  return {
    like: c.pink, comment: c.primaryLight, follow: c.cyan,
    mention: c.cyanLight, event: c.xpGold, achievement: c.xpGold, game_invite: c.primaryLight
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
      marginHorizontal: spacing.lg, paddingVertical: 14, paddingHorizontal: 16,
      marginBottom: 8, gap: 14, borderRadius: radii.xl,
      borderWidth: 1, borderColor: 'transparent',
    },
    rowUnread: {
      backgroundColor: 'rgba(124, 58, 237, 0.08)',
      borderColor: 'rgba(124, 58, 237, 0.2)',
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10,
    },
    rowRead: {
      backgroundColor: c.bg.card,
      borderColor: c.border,
    },

    avatarWrap: { position: 'relative', width: 48 },
    avatar: {
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: c.bg.surface, borderWidth: 1, borderColor: c.borderHover,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarEmoji: { fontSize: 24 },
    typeDot: {
      position: 'absolute', bottom: -2, right: -4,
      width: 22, height: 22, borderRadius: 11,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: c.bg.base,
    },

    content: { flex: 1, justifyContent: 'center' },
    notifText: { fontSize: fontSizes.sm, color: c.text.secondary, lineHeight: 20 },
    actor:     { fontWeight: '800', color: c.text.primary, fontSize: fontSizes.md, marginBottom: 2 },
    notifBody: { fontWeight: '500' },
    time:      { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 4, fontWeight: '600' },

    unreadDot: {
      width: 10, height: 10, borderRadius: 5,
      backgroundColor: c.primary, marginTop: 18, flexShrink: 0,
      shadowColor: c.primary, shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
    },
    
    emptyState: {
      alignItems: 'center', justifyContent: 'center',
      paddingVertical: 60, marginHorizontal: spacing.xl,
    },
    emptyEmoji: { fontSize: 64, marginBottom: 16 },
    emptyTitle: { fontSize: fontSizes.xl, fontWeight: '800', color: c.text.primary, marginBottom: 8, textAlign: 'center' },
    emptySub: { fontSize: fontSizes.md, color: c.text.muted, textAlign: 'center', lineHeight: 22 },
    inviteActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    btnJoin: { flex: 1, backgroundColor: c.primary, paddingVertical: 8, borderRadius: radii.md, alignItems: 'center' },
    btnJoinText: { color: '#fff', fontSize: fontSizes.sm, fontWeight: '700' },
    btnDeny: { flex: 1, backgroundColor: c.bg.elevated, paddingVertical: 8, borderRadius: radii.md, alignItems: 'center' },
    btnDenyText: { color: c.text.secondary, fontSize: fontSizes.sm, fontWeight: '700' },
  });
}

export default function NotificationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const notifColor = useMemo(() => getNotifColor(colors), [colors]);

  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifs = async () => {
    try {
      const res = await notificationService.getNotifications();
      setNotifs(res.data);
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    }
  };

  useEffect(() => {
    fetchNotifs().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifs();
    setRefreshing(false);
  };

  const markAllRead = async () => {
    setNotifs(n => n.map(x => ({ ...x, isRead: true })));
    try {
      await notificationService.markAllRead();
    } catch (e) {
      console.error('Failed to mark all read:', e);
    }
  };

  const markRead = async (id: string) => {
    setNotifs(n => n.map(x => x.id === id ? { ...x, isRead: true } : x));
    try {
      await notificationService.markOneRead(id);
    } catch (e) {
      console.error('Failed to mark one read:', e);
    }
  };

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

      {loading ? (
        <View style={[styles.emptyState, { paddingTop: 100 }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : notifs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>You're all caught up!</Text>
          <Text style={styles.emptySub}>No new notifications right now. Check back later for updates on events, followers, and more.</Text>
        </View>
      ) : (
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={{ paddingTop: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {GROUPS.map(group => {
            const items = notifs.filter(n => n.group === group.key);
            if (!items.length) return null;
            return (
              <View key={group.key}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                {items.map(notif => (
                  <TouchableOpacity
                    key={notif.id}
                    style={[styles.row, notif.isRead ? styles.rowRead : styles.rowUnread]}
                    onPress={() => markRead(notif.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.avatarWrap}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarEmoji}>{notif.avatar}</Text>
                      </View>
                      <View style={[styles.typeDot, { backgroundColor: notifColor[notif.type] }]}>
                        <Ionicons name={NOTIF_ICON[notif.type] as any} size={10} color="#fff" />
                      </View>
                    </View>

                    <View style={styles.content}>
                      <Text style={styles.actor} numberOfLines={1}>{notif.actor}</Text>
                      <Text style={styles.notifText} numberOfLines={2}>
                        <Text style={styles.notifBody}>{notif.text}</Text>
                      </Text>
                      <Text style={styles.time}>{notif.time}</Text>

                      {notif.type === 'game_invite' && !notif.isRead && (
                        <View style={styles.inviteActions}>
                          <TouchableOpacity 
                            style={styles.btnJoin}
                            onPress={(e) => {
                              e.stopPropagation();
                              markRead(notif.id);
                              require('react-native').DeviceEventEmitter.emit('GAME_INVITE_ACCEPTED', notif.payload);
                              (navigation as any).navigate('Main', { screen: 'Games' });
                            }}
                          >
                            <Text style={styles.btnJoinText}>Join Game</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.btnDeny}
                            onPress={(e) => {
                              e.stopPropagation();
                              markRead(notif.id);
                            }}
                          >
                            <Text style={styles.btnDenyText}>Deny</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {!notif.isRead && <View style={styles.unreadDot} />}
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}
