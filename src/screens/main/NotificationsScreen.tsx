import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Image, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import type { HomeStackParamList, Notification, Post } from '../../types';
import { notificationService } from '../../services/notification.service';
import { userService } from '../../services/user.service';
import { postsService } from '../../services/posts.service';
import { useNotifications } from '../../context/NotificationContext';
import { notificationBus, NOTIF_EVENTS } from '../../lib/notificationBus';
import { socketClient } from '../../services/socketClient';
import PresenceDot from '../../components/common/PresenceDot';

const FOLLOWED_BACK_KEY = '@taddle_followed_back_usernames';
// CUSTOM private lobbies stay open for 30 minutes before the invite expires.
const GAME_INVITE_TTL_MS = 30 * 60 * 1000;

type Props = NativeStackScreenProps<HomeStackParamList, 'Notifications'>;

const NOTIF_ICON: Record<Notification['type'], string> = {
  like: 'heart', comment: 'chatbubble', follow: 'person-add',
  mention: 'at', event: 'calendar', achievement: 'trophy', game_invite: 'game-controller',
  post: 'create'
};

const GROUPS: { key: Notification['group']; label: string }[] = [
  { key: 'today',     label: 'Today'     },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'earlier',   label: 'Earlier'   },
];

function getNotifColor(c: ColorPalette): Record<Notification['type'], string> {
  return {
    like: c.pink, comment: c.primaryLight, follow: c.cyan,
    mention: c.cyanLight, event: c.xpGold, achievement: c.xpGold, game_invite: c.primaryLight,
    post: c.primary
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

    // Follow-back action for "New follower" notifications
    followBackBtn: {
      alignSelf: 'flex-start', marginTop: 10,
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: radii.full,
      backgroundColor: 'rgba(124,58,237,0.16)',
      borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
    },
    followBackDone: {
      backgroundColor: 'rgba(16,185,129,0.12)',
      borderColor: 'rgba(16,185,129,0.35)',
    },
    followBackRequested: {
      backgroundColor: 'rgba(251,191,36,0.12)',
      borderColor: 'rgba(251,191,36,0.4)',
    },
    followBackText: { fontSize: fontSizes.xs, fontWeight: '800', color: c.primaryLight },
    followBackDoneText: { color: c.success },
    followBackReqText: { color: c.xpGold },

    reqStateText: { fontSize: fontSizes.xs, fontWeight: '700', marginTop: 10, alignSelf: 'flex-start' },
    reqStateApproved: { color: c.success },
    reqStateDeclined: { color: c.danger },

    reqBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      marginHorizontal: spacing.lg, marginBottom: 10,
      paddingHorizontal: spacing.md, paddingVertical: 12,
      borderRadius: radii.lg,
      backgroundColor: 'rgba(124,58,237,0.12)',
      borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)',
    },
    reqBannerTitle: { fontSize: fontSizes.sm, fontWeight: '800', color: c.text.primary },
    reqBannerSub: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },
    reqBannerBtn: {
      paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: radii.full,
      backgroundColor: c.primary,
    },
    reqBannerBtnGhost: {
      backgroundColor: 'transparent',
      borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
    },
    reqBannerBtnText: { color: '#fff', fontSize: fontSizes.xs, fontWeight: '800' },
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
  // Tracks which follow notifications the user already followed back (session)
  const [followedBack, setFollowedBack] = useState<Record<string, boolean>>({});
  // Follow-backs to PRIVATE accounts create a pending request, not an active
  // follow — these rows show "Requested" instead of "Following".
  const [followReqSent, setFollowReqSent] = useState<Record<string, boolean>>({});
  // Usernames the user has followed back — persisted so re-entering the page
  // doesn't keep showing "Follow Back" when they already follow that user.
  const [followedUsernames, setFollowedUsernames] = useState<Set<string>>(new Set());
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  // Tracks the response for incoming follow-request notifications.
  const [followReqState, setFollowReqState] = useState<
    Record<string, 'approved' | 'declined' | 'withdrawn'>
  >({});
  const [reqBusyId, setReqBusyId] = useState<string | null>(null);
  const { clearUnread } = useNotifications();

  // Latest notifications list — kept in a ref so socket listeners can update
  // matching rows without re-subscribing on every fetch.
  const notifsRef = React.useRef(notifs);
  notifsRef.current = notifs;

  // Load persisted followed-back usernames so the button stays correct across
  // screen visits.
  useEffect(() => {
    AsyncStorage.getItem(FOLLOWED_BACK_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          setFollowedUsernames(new Set(JSON.parse(raw)));
        } catch (e) {
          console.warn('Failed to parse followed-back usernames', e);
        }
      })
      .catch(() => {});
  }, []);

  const persistFollowedUsername = async (username: string) => {
    setFollowedUsernames(prev => {
      const next = new Set(prev);
      next.add(username);
      AsyncStorage.setItem(FOLLOWED_BACK_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  };

  const fetchNotifs = React.useCallback(async () => {
    try {
      const res = await notificationService.getNotifications();
      setNotifs(res.data);
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    }
  }, []);

  // Real-time follow-state sync: when a follow request is cancelled by the
  // requester, or a mutual follow happens, update the affected rows instantly
  // so stale Approve / Follow Back buttons never linger.
  useEffect(() => {
    const onReqCancelled = (data: any) => {
      const followerId = data?.followerId;
      if (!followerId) return;
      setFollowReqState((prev) => {
        const next = { ...prev };
        notifsRef.current.forEach((n) => {
          if (n.type === 'follow' && n.payload?.isFollowRequest && n.payload?.userId === followerId && !next[n.id]) {
            next[n.id] = 'withdrawn';
          }
        });
        return next;
      });
      fetchNotifs(); // reconcile with server (requestActive → false)
    };
    // The recipient APPROVED the request (this device, or another one) — flip
    // the row to "approved" so it never reads "Request withdrawn".
    const onReqResolved = (data: any) => {
      const followerId = data?.followerId;
      if (!followerId) return;
      setFollowReqState((prev) => {
        const next = { ...prev };
        notifsRef.current.forEach((n) => {
          if (n.type === 'follow' && n.payload?.isFollowRequest && n.payload?.userId === followerId) {
            next[n.id] = 'approved';
          }
        });
        return next;
      });
      fetchNotifs();
    };
    const onStateChanged = (data: any) => {
      const otherUserId = data?.otherUserId;
      if (otherUserId === undefined) return;
      if (data?.isFollowing) {
        setFollowedBack((prev) => {
          const next = { ...prev };
          notifsRef.current.forEach((n) => {
            if (n.type === 'follow' && !n.payload?.isFollowRequest && n.payload?.userId === otherUserId) {
              next[n.id] = true;
            }
          });
          return next;
        });
      }
      fetchNotifs();
    };
    socketClient.events.on('follow:requestCancelled', onReqCancelled);
    socketClient.events.on('follow:requestResolved', onReqResolved);
    socketClient.events.on('follow:stateChanged', onStateChanged);
    return () => {
      socketClient.events.off('follow:requestCancelled', onReqCancelled);
      socketClient.events.off('follow:requestResolved', onReqResolved);
      socketClient.events.off('follow:stateChanged', onStateChanged);
    };
  }, [fetchNotifs]);

  // Refetch in real-time when a new notification arrives over the socket, and
  // when the user lands here from a system-tray tap or banner.
  useEffect(() => {
    fetchNotifs().finally(() => setLoading(false));
    const offNew = notificationBus.on(NOTIF_EVENTS.NEW, () => fetchNotifs());
    const offOpen = notificationBus.on(NOTIF_EVENTS.OPEN, () => fetchNotifs());
    const sub = navigation.addListener('focus', () => fetchNotifs());

    clearUnread();

    return () => {
      offNew();
      offOpen();
      sub();
    };
  }, [fetchNotifs]);

  // Navigate to the specific content a notification refers to.
  const openNotification = async (notif: Notification) => {
    markRead(notif.id);
    const { type, payload, resourceId } = notif;

    try {
      // A follow REQUEST opens the full requests screen (approve/reject/accept
      // all) instead of the requester's profile.
      if (type === 'follow' && payload?.isFollowRequest) {
        navigation.navigate('FollowRequests');
        return;
      }

      if (type === 'follow' && payload?.username) {
        navigation.navigate('UserProfile', {
          user: {
            username: payload.username,
            name: payload.name || notif.actor,
            avatarUrl: notif.avatarUrl,
          } as any,
        });
        return;
      }

      if (type === 'event') {
        (navigation as any).navigate('Main', { screen: 'Events' });
        return;
      }

      if (type === 'game_invite') {
        (navigation as any).navigate('Main', { screen: 'Games' });
        return;
      }

      if (type === 'achievement') {
        (navigation as any).navigate('Main', { screen: 'Profile' });
        return;
      }

      // like / comment / mention / new post / repost → open that post INSIDE
      // the author's profile page (comments pop open over it), like other
      // social platforms. The tap ALWAYS lands somewhere: if the post can't be
      // fetched (deleted / private), we still open the author's profile with
      // whatever identity the notification carries.
      if (type === 'post' || type === 'like' || type === 'comment' || type === 'mention') {
        let post: Post | null = null;
        if (resourceId) {
          try {
            const res = await postsService.getPost(resourceId);
            post = res?.data || null;
          } catch (e) {
            post = null;
          }
        }
        const author: any = (post as any)?.author || {};
        // Only navigate when we have a real handle — a guessed fallback would
        // open a broken profile page.
        const username = author.username || notif.payload?.username;
        if (!username) return;
        navigation.navigate('UserProfile', {
          user: {
            id: author.id || notif.senderId,
            name: author.name || notif.actor,
            username,
            avatarUrl: author.avatarUrl || notif.avatarUrl,
            handle: username,
            avatar: '👾',
            level: 1,
            xp: 0,
            xpToNext: 100,
          } as any,
          // Only pass the post when it was actually fetched — otherwise the
          // profile would refetch it and 403 again (private account / deleted).
          ...(post ? { openPostId: post.id, openPost: post } : {}),
        });
      }
    } catch (e) {
      console.warn('Failed to open notification content', e);
    }
  };

  const isGameInviteExpired = (notif: Notification) => {
    if (notif.type !== 'game_invite') return false;
    if (!notif.createdAt) return false;
    const age = Date.now() - new Date(notif.createdAt).getTime();
    return age > GAME_INVITE_TTL_MS;
  };

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

  const handleApproveRequest = async (notif: Notification) => {
    const followerId = notif.payload?.userId;
    if (!followerId) return;
    setReqBusyId(notif.id);
    try {
      await userService.approveFollowRequest(followerId);
      setFollowReqState((prev) => ({ ...prev, [notif.id]: 'approved' }));
      markRead(notif.id);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '';
      if (/already following|no follow request/i.test(msg)) {
        setFollowReqState((prev) => ({ ...prev, [notif.id]: 'approved' }));
        markRead(notif.id);
      }
    } finally {
      setReqBusyId(null);
    }
  };

  const handleDeclineRequest = async (notif: Notification) => {
    const followerId = notif.payload?.userId;
    if (!followerId) return;
    setReqBusyId(notif.id);
    try {
      await userService.rejectFollowRequest(followerId);
      setFollowReqState((prev) => ({ ...prev, [notif.id]: 'declined' }));
      markRead(notif.id);
    } catch (e: any) {
      // The request is already gone (e.g. approved elsewhere / timed out) —
      // that's effectively declined. Any other error leaves the buttons in
      // place so the user can retry.
      const msg = e?.response?.data?.message || e?.message || '';
      if (/no follow request|already following/i.test(msg)) {
        setFollowReqState((prev) => ({ ...prev, [notif.id]: 'declined' }));
        markRead(notif.id);
      }
    } finally {
      setReqBusyId(null);
    }
  };

  // Approve every pending follow-request notification in one tap.
  const [acceptingAll, setAcceptingAll] = useState(false);
  const pendingRequestNotifs = notifs.filter(
    (n) => n.type === 'follow' && n.payload?.isFollowRequest && n.payload?.requestActive !== false && !followReqState[n.id],
  );
  const handleAcceptAllRequests = async () => {
    if (pendingRequestNotifs.length === 0 || acceptingAll) return;
    setAcceptingAll(true);
    try {
      await userService.acceptAllFollowRequests();
      const ids = pendingRequestNotifs.map((n) => n.id);
      setFollowReqState((prev) => {
        const next = { ...prev };
        ids.forEach((id) => { next[id] = 'approved'; });
        return next;
      });
      ids.forEach((id) => markRead(id));
      fetchNotifs();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '';
      if (/no pending/i.test(msg)) {
        const ids = pendingRequestNotifs.map((n) => n.id);
        setFollowReqState((prev) => {
          const next = { ...prev };
          ids.forEach((id) => { next[id] = 'approved'; });
          return next;
        });
      } else {
        Alert.alert('Error', msg || 'Failed to accept requests.');
      }
    } finally {
      setAcceptingAll(false);
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
          {pendingRequestNotifs.length > 0 && (
            <View style={styles.reqBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reqBannerTitle}>
                  {pendingRequestNotifs.length} follow request{pendingRequestNotifs.length === 1 ? '' : 's'} pending
                </Text>
                <Text style={styles.reqBannerSub}>Tap a request to review it</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.reqBannerBtn, styles.reqBannerBtnGhost]}
                  onPress={() => navigation.navigate('FollowRequests')}
                >
                  <Text style={[styles.reqBannerBtnText, { color: colors.primaryLight }]}>View Requests</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reqBannerBtn}
                  disabled={acceptingAll}
                  onPress={handleAcceptAllRequests}
                >
                  {acceptingAll ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.reqBannerBtnText}>Accept All</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

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
                    onPress={() => openNotification(notif)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.avatarWrap}>
                      <View style={styles.avatar}>
                        {notif.avatarUrl ? (
                          <Image
                            source={{ uri: notif.avatarUrl }}
                            style={{ width: 48, height: 48, borderRadius: 24 }}
                          />
                        ) : (
                          // Person placeholder — the sender's avatar is missing
                          // (system events, legacy rows), so show a clean profile
                          // icon instead of a bare letter.
                          <LinearGradient
                            colors={[colors.primary, colors.cyanDark]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Ionicons name="person" size={20} color="#fff" />
                          </LinearGradient>
                        )}
                      </View>
                      <View style={[styles.typeDot, { backgroundColor: notifColor[notif.type] }]}>
                        <Ionicons name={NOTIF_ICON[notif.type] as any} size={10} color="#fff" />
                      </View>
                      {/* Online / recently-active dot on the sender avatar */}
                      <PresenceDot
                        userId={notif.senderId || notif.payload?.userId}
                        size={13}
                        style={{ top: -3, right: 4, bottom: undefined }}
                      />
                    </View>

                    <View style={styles.content}>
                      <Text style={styles.actor} numberOfLines={1}>{notif.actor}</Text>
                      <Text style={styles.notifText} numberOfLines={2}>
                        <Text style={styles.notifBody}>{notif.text}</Text>
                      </Text>
                      <Text style={styles.time}>{notif.time}</Text>

                      {notif.type === 'game_invite' && !notif.isRead && !isGameInviteExpired(notif) && (
                        <View style={styles.inviteActions}>
                          <TouchableOpacity 
                            style={styles.btnJoin}
                            onPress={(e) => {
                              e.stopPropagation();
                              markRead(notif.id);
                              if (notif.payload) {
                                require('react-native').DeviceEventEmitter.emit('GAME_INVITE_ACCEPTED', notif.payload);
                              }
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

                      {notif.type === 'game_invite' && !notif.isRead && isGameInviteExpired(notif) && (
                        <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                          <Text style={[styles.followBackText, { color: colors.text.muted, fontWeight: '600' }]}>
                            ⏳ Invite expired
                          </Text>
                        </View>
                      )}

                      {notif.type === 'follow' &&
                        notif.payload?.isFollowRequest &&
                        notif.payload?.userId &&
                        (() => {
                          const state = followReqState[notif.id];
                          // "Withdrawn" only ever comes from the requester actively
                          // cancelling (socket event). requestActive === false just
                          // means the request is no longer pending — which also
                          // happens after an approval, so it must NOT read as
                          // "Request withdrawn".
                          const withdrawn = state === 'withdrawn';
                          if (withdrawn) {
                            return (
                              <Text
                                style={[
                                  styles.reqStateText,
                                  styles.reqStateDeclined,
                                ]}
                              >
                                Request withdrawn
                              </Text>
                            );
                          }
                          if (state === 'approved' || state === 'declined') {
                            return (
                              <Text
                                style={[
                                  styles.reqStateText,
                                  state === 'approved'
                                    ? styles.reqStateApproved
                                    : styles.reqStateDeclined,
                                ]}
                              >
                                {state === 'approved'
                                  ? '✓ Request approved'
                                  : '✕ Request declined'}
                              </Text>
                            );
                          }
                          if (notif.payload?.requestActive === false) {
                            // Resolved elsewhere (another device, private→public
                            // auto-accept, account switch) — no buttons, neutral copy.
                            return (
                              <Text
                                style={[
                                  styles.reqStateText,
                                  styles.reqStateApproved,
                                ]}
                              >
                                Request resolved
                              </Text>
                            );
                          }
                          return (
                            <View style={styles.inviteActions}>
                              <TouchableOpacity
                                style={styles.btnDeny}
                                disabled={reqBusyId !== null}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  handleDeclineRequest(notif);
                                }}
                              >
                                {reqBusyId === notif.id ? (
                                  <ActivityIndicator
                                    size="small"
                                    color={colors.text.secondary}
                                  />
                                ) : (
                                  <Text style={styles.btnDenyText}>Decline</Text>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.btnJoin}
                                disabled={reqBusyId !== null}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  handleApproveRequest(notif);
                                }}
                              >
                                {reqBusyId === notif.id ? (
                                  <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                  <Text style={styles.btnJoinText}>Approve</Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          );
                        })()}

                      {notif.type === 'follow' && !notif.payload?.isFollowRequest && notif.payload?.username && (() => {
                        const username = notif.payload.username;
                        // Private senders can't be followed directly — follow-back
                        // sends a request instead, so the button reads differently
                        // and lands in a "Requested" state, not "Following".
                        const isPrivate = notif.payload?.senderPrivacy === 'private';
                        const isReq = !!followReqSent[notif.id];
                        // Server truth (isMutual) wins — if the request was later
                        // approved, isMutual flips the row back to "Following" even
                        // though followReqSent is still set locally. The persisted
                        // set is only a fallback for data that predates enrichment.
                        const isMutual = !!notif.payload?.isMutual;
                        const isDone = isMutual || followedBack[notif.id] || isReq ||
                          (!isMutual && notif.payload?.isMutual === undefined && followedUsernames.has(username));
                        return (
                          <TouchableOpacity
                            style={[
                              styles.followBackBtn,
                              isReq && !isMutual && styles.followBackRequested,
                              isDone && !isReq && styles.followBackDone,
                            ]}
                            disabled={isDone || followBusy === notif.id}
                            onPress={async (e) => {
                              e.stopPropagation();
                              markRead(notif.id);
                              if (isDone) return;
                              const followUsername = notif.payload?.username;
                              if (!followUsername) return;
                              setFollowBusy(notif.id);
                              try {
                                await userService.followUser(followUsername);
                                if (isPrivate) {
                                  // Private account → the API creates a pending
                                  // request, so surface that state.
                                  setFollowReqSent(prev => ({ ...prev, [notif.id]: true }));
                                } else {
                                  setFollowedBack(prev => ({ ...prev, [notif.id]: true }));
                                  await persistFollowedUsername(followUsername);
                                }
                              } catch (err: any) {
                                // "already following"/"request already sent" are
                                // successes for the follow-back flow.
                                const msg = err?.response?.data?.message || err?.message || '';
                                if (/already following|request/i.test(msg)) {
                                  if (isPrivate) {
                                    setFollowReqSent(prev => ({ ...prev, [notif.id]: true }));
                                  } else {
                                    setFollowedBack(prev => ({ ...prev, [notif.id]: true }));
                                    await persistFollowedUsername(followUsername);
                                  }
                                }
                              } finally {
                                setFollowBusy(null);
                              }
                            }}
                          >
                            <Ionicons
                              name={isReq && !isMutual ? 'time' : isDone ? 'checkmark' : 'person-add'}
                              size={13}
                              color={isReq && !isMutual ? colors.xpGold : isDone ? colors.success : colors.primaryLight}
                            />
                            <Text
                              style={[
                                styles.followBackText,
                                isDone && !isReq && styles.followBackDoneText,
                                isReq && !isMutual && styles.followBackReqText,
                              ]}
                            >
                              {followBusy === notif.id
                                ? (isPrivate ? 'Sending…' : 'Following…')
                                : isReq && !isMutual
                                  ? 'Requested'
                                  : isDone
                                    ? 'Following'
                                    : isPrivate
                                      ? 'Request to Follow Back'
                                      : 'Follow Back'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })()}
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
