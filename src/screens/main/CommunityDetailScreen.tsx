import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, Share, FlatList, Image,  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import { usePosts }        from '../../context/PostsContext';
import { useJoinCommunity } from '../../mutations/communities';
import { communityService } from '../../services/community.service';
import { postsService }     from '../../services/posts.service';
import PostCard             from '../../components/home/PostCard';
import MainHeader           from '../../components/common/MainHeader';
import CreatePostModal      from '../../components/common/CreatePostModal';
import SharedFeed           from '../../components/common/SharedFeed';
import { useAuth }          from '../../context/AuthContext';
import { useQueryClient }   from '@tanstack/react-query';
import { queryKeys }        from '../../lib/queryKeys';
import type { CommunityStackParamList, Post, Community } from '../../types';
import { themedAlert } from '../../components/common/ThemedAlert';
import BioText from '../../components/common/BioText';



const BANNER_COLORS: Record<string, [string, string]> = {
  Tech:      ['#2a0a5e', '#0a1f5e'],
  Lifestyle: ['#0a3e1a', '#0a5e2f'],
  Gaming:    ['#3e1a0a', '#5e1a0a'],
  Startup:   ['#2e2e0a', '#4e3a0a'],
  Creative:  ['#2a0a4e', '#4e0a3e'],
  Study:     ['#0a2e3e', '#0a3e5e'],
};

const AVATAR_COLORS_MAP: Record<string, [string, string]> = {
  Tech:      ['#7C3AED', '#0891B2'],
  Lifestyle: ['#10B981', '#065F46'],
  Gaming:    ['#F97316', '#B45309'],
  Startup:   ['#FBBF24', '#B45309'],
  Creative:  ['#EC4899', '#9D174D'],
  Study:     ['#06B6D4', '#0891B2'],
};

type Nav   = NativeStackNavigationProp<CommunityStackParamList, 'CommunityDetail'>;
type Route = RouteProp<CommunityStackParamList, 'CommunityDetail'>;

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },

    backBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: 'rgba(7,7,20,0.6)',
      alignItems: 'center', justifyContent: 'center',
    },
    shareBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: 'rgba(7,7,20,0.6)',
      alignItems: 'center', justifyContent: 'center',
    },

    banner: {
      height: 160,
      alignItems: 'center', justifyContent: 'center',
    },
    bannerImage: { ...StyleSheet.absoluteFillObject },
    privateBadge: {
      position: 'absolute', bottom: 28, right: 14,
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.full,
    },
    privateBadgeText: { fontSize: fontSizes.xs, color: '#fff', fontWeight: '700' },

    infoCard: {
      backgroundColor: c.bg.card,
      marginTop: -20,
      borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
      paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
      paddingTop: 0,
    },
    avatarRow: {
      flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
      marginTop: -28, marginBottom: spacing.sm,
    },
    avatar: {
      width: 68, height: 68, borderRadius: radii.md,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 3, borderColor: c.bg.card,
    },
    avatarImage: { width: '100%', height: '100%', borderRadius: radii.md - 3 },
    avatarEmoji: { fontSize: 32 },
    joinBtn: {
      borderRadius: radii.full, overflow: 'hidden',
      borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)',
    },
    joinBtnJoined: { borderColor: 'rgba(124,58,237,0.35)' },
    joinBtnInner: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 18, paddingVertical: 9,
    },
    joinBtnText:       { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },
    joinBtnTextJoined: { fontSize: fontSizes.sm, fontWeight: '700', color: c.primaryLight },

    commName: { fontSize: fontSizes.xl, fontWeight: '800', color: c.text.primary, marginBottom: 5 },
    commDesc: { fontSize: fontSizes.sm, color: c.text.secondary, lineHeight: 19, marginBottom: spacing.md },

    statsRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.bg.elevated,
      borderRadius: radii.md, padding: spacing.md,
      marginBottom: spacing.md,
    },
    statItem:    { flex: 1, alignItems: 'center' },
    statValue:   { fontSize: fontSizes.md, fontWeight: '800', color: c.text.primary },
    statLabel:   { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },
    statDivider: { width: 1, height: 30, backgroundColor: c.border },

    writePostBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.bg.elevated,
      borderWidth: 1, borderColor: c.border,
      borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 11,
    },
    writePostAvatar: {
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: c.bg.base,
      alignItems: 'center', justifyContent: 'center',
    },
    writePostPlaceholder: { flex: 1, fontSize: fontSizes.sm, color: c.text.muted },

    emptyState: { alignItems: 'center', paddingVertical: 50 },
    emptyEmoji: { fontSize: 40, marginBottom: 12 },
    emptyTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: c.text.primary, marginBottom: 6 },
    emptyDesc:  { fontSize: fontSizes.sm, color: c.text.muted, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
    emptyBtn: {
      marginTop: 20, backgroundColor: c.primary,
      paddingHorizontal: 24, paddingVertical: 11, borderRadius: radii.full,
    },
    emptyBtnText: { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },

    manageRequestsBtn: {
      backgroundColor: 'rgba(234, 179, 8, 0.15)',
      paddingVertical: 12, paddingHorizontal: 16,
      borderRadius: radii.md,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginBottom: spacing.md,
      borderWidth: 1, borderColor: 'rgba(234, 179, 8, 0.5)',
    },
    manageRequestsText: { color: '#eab308', fontSize: fontSizes.sm, fontWeight: '700' },
    
    modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: {
      backgroundColor: c.bg.card,
      borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
      padding: spacing.lg,
      maxHeight: '80%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
    modalTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: c.text.primary },
    requestRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border
    },
    requestUser: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    requestAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.bg.elevated, alignItems: 'center', justifyContent: 'center' },
    requestName: { fontSize: fontSizes.md, fontWeight: '700', color: c.text.primary },
    requestUsername: { fontSize: fontSizes.xs, color: c.text.secondary },
    requestActions: { flexDirection: 'row', gap: 8 },
    actionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    approveBtn: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
    rejectBtn: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  });
}

export default function CommunityDetailScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { communitySlug } = route.params as any; // fallback if types aren't synced perfectly in IDE yet
  const { isDark } = useTheme();
  const colors     = useThemeColors();
  const styles     = useMemo(() => makeStyles(colors), [colors]);

  // Join/leave/request is driven by the react-query mutation (the same one the
  // community LIST screen uses). The old CommunityContext is never mounted, so
  // its toggleJoin was a silent no-op and the button did nothing on this page.
  const { mutateAsync: toggleJoinMutate } = useJoinCommunity();
  // Removed usePosts since we'll handle likes/saves locally for community posts

  // Always fetch the full detail + membership state from the API (the legacy
  // CommunityContext that used to seed this is never mounted) — otherwise we
  // show a proper loading state instead of a blank screen.
  const [community, setCommunity] = useState<Community | null>(null);
  const [communityPosts, setCommunityPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Post feed pagination + pull-to-refresh. The server endpoint supports
  // page/limit (newest first); we append pages on scroll and reset on refresh.
  const [postPage, setPostPage] = useState(1);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [refreshingPosts, setRefreshingPosts] = useState(false);
  const postsReqRef = useRef(0);

  const [showCreate, setShowCreate]  = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  // Guards against double-tapping Join/Leave — two rapid taps would fire two
  // mutations and the second would 409 on the server, flipping the UI back.
  const [joinBusy, setJoinBusy] = useState(false);
  
  const { user: authUser } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = community?.memberRole === 'admin' || community?.memberRole === 'moderator';
  const isOwner = community?.ownerId === authUser?.id;

  // Join/Leave on this screen. Updates local state instantly for a responsive
  // button, then calls the real join/leave/request API via the mutation. The
  // mutation's optimistic cache update keeps the community LIST in sync, and
  // loadData() re-syncs this page from the server when it settles.
  const handleToggleJoin = async () => {
    if (!community || joinBusy) return;
    const target = community;
    const wasJoined = target.isJoined || false;
    const wasPending = target.isPending || false;
    const isPrivate = target.privacy === 'private';
    const delta = wasJoined ? -1 : 1;
    // Local optimistic flip — instant UI.
    setJoinBusy(true);
    setCommunity(prev => prev ? {
      ...prev,
      isJoined: wasPending ? false : (isPrivate ? prev.isJoined : !prev.isJoined),
      isPending: wasPending ? false : isPrivate,
      memberCount: wasPending ? prev.memberCount : Math.max(0, (prev.memberCount || 0) + delta),
    } : prev);
    const rollback = () =>
      setCommunity(prev => prev ? {
        ...prev,
        isJoined: wasJoined,
        isPending: wasPending,
        memberCount: wasPending ? prev.memberCount : Math.max(0, (prev.memberCount || 0) - delta),
      } : prev);
    try {
      await toggleJoinMutate({
        communityId: target.id,
        isCurrentlyMember: wasJoined,
        isPending: wasPending,
      });
      // Re-fetch detail + posts so the page reflects server truth (member
      // count, isJoined, and — for private — whether the request was accepted
      // immediately vs pending review). If the re-fetch FAILS we can't confirm
      // the server state, so roll the optimistic flip back rather than leave
      // the button claiming a membership we can't verify.
      const refreshed = await loadData();
      if (!refreshed) {
        rollback();
        queryClient.invalidateQueries({ queryKey: queryKeys.communities });
      }
    } catch (e) {
      // Roll back on failure.
      rollback();
      console.error('Failed to toggle community membership:', e);
    } finally {
      setJoinBusy(false);
    }
  };

  // Loads a page of the community's posts and appends/replaces the list. Uses
  // a request-id guard so a slow page-1 response can't clobber a newer one
  // after a refresh or a community switch.
  const loadPosts = useCallback(
    async (communityId: string, nextPage: number, refresh = false) => {
      const reqId = ++postsReqRef.current;
      if (!refresh) setLoadingPosts(true);
      try {
        const postsRes = await communityService.getCommunityPosts(communityId, nextPage, 20);
        if (postsReqRef.current !== reqId) return;
        const rows = postsRes.data || [];
        const meta = postsRes.meta as any;
        setHasMorePosts(meta ? !!meta.hasNext : rows.length === 20);
        setCommunityPosts((prev) =>
          refresh
            ? rows
            : [...prev, ...rows.filter((r: any) => !prev.some((p: any) => p.id === r.id))],
        );
        setPostPage(nextPage);
      } catch (e) {
        // Private communities: non-members get 403 on posts — that's fine,
        // the empty state explains they must join first.
        if (postsReqRef.current === reqId) setCommunityPosts([]);
      } finally {
        if (postsReqRef.current === reqId) {
          setLoadingPosts(false);
          setRefreshingPosts(false);
          setLoadingMorePosts(false);
        }
      }
    },
    [],
  );

  // Resolves true only when the detail re-fetch succeeded — callers use the
  // boolean to decide whether an optimistic membership flip can be trusted.
  const loadData = useMemo(
    () => async (): Promise<boolean> => {
      setLoadingDetail(true);
      setDetailError(null);
      try {
        const detailRes = await communityService.getCommunityDetail(communitySlug);
        if (detailRes.data) {
          setCommunity(detailRes.data);
          setLoadingPosts(true);
          await loadPosts(detailRes.data.id, 1, true);
          return true;
        }
        setDetailError("Community not found.");
        return false;
      } catch (e: any) {
        console.log("Failed to load community details", e);
        setDetailError(
          e?.response?.data?.message || "Could not load this community.",
        );
        return false;
      } finally {
        setLoadingDetail(false);
      }
    },
    [communitySlug, loadPosts],
  );

  // Fetch full details and posts whenever the screen gains focus (mount, or
  // returning to it) — so an approval granted while the user was elsewhere
  // shows up without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // While a join request is pending on a private community, poll the detail
  // endpoint so the moment an admin approves, posts appear immediately
  // instead of waiting for a manual refresh. Stops once membership is active.
  useEffect(() => {
    if (!community || community.privacy !== 'private' || !community.isPending) {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const res = await communityService.getCommunityDetail(communitySlug);
        const fresh = res.data;
        if (!fresh) return;
        if (fresh.isJoined && !fresh.isPending) {
          // Approved — refresh posts right away and stop polling.
          clearInterval(timer);
          setCommunity(fresh);
          setLoadingPosts(true);
          await loadPosts(fresh.id, 1, true);
        } else if (
          fresh.isPending !== community.isPending ||
          fresh.memberCount !== community.memberCount
        ) {
          setCommunity(fresh);
        }
      } catch (e) {
        // transient failure — try again on the next tick
      }
    }, 10000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community?.isPending, community?.id, communitySlug, loadPosts]);

  const handleDeletePost = async (post: Post) => {
    try {
      await postsService.deletePost(post.id);
      setCommunityPosts(prev => prev.filter(p => p.id !== post.id));
    } catch (e) {
      console.error('Failed to delete post:', e);
    }
  };


  // Loading / error states — never render a silent blank screen.
  if (loadingDetail && !community) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primaryLight} />
          <Text style={{ color: colors.text.muted }}>Loading community…</Text>
        </View>
      </View>
    );
  }

  if (!community) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 }}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.text.muted} />
          <Text style={{ color: colors.text.primary, fontSize: fontSizes.lg, fontWeight: '800' }}>
            Couldn't load community
          </Text>
          <Text style={{ color: colors.text.muted, textAlign: 'center' }}>
            {detailError || 'Something went wrong.'}
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { marginTop: 12 }]}
            onPress={loadData}
          >
            <Text style={styles.emptyBtnText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 12 }} onPress={() => navigation.goBack()}>
            <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const bannerGradient = BANNER_COLORS[community.category?.[0]] ?? ['#1a0a3e', '#0a1a3e'];
  const avatarGradient = AVATAR_COLORS_MAP[community.category?.[0]] ?? ['#7C3AED', '#4C1D95'];

  const renderHeader = () => (
    <>
      <LinearGradient colors={bannerGradient} style={styles.banner}>
        {community.bannerUrl ? (
          <Image source={{ uri: community.bannerUrl }} style={styles.bannerImage} />
        ) : null}
        {/* Owner settings + share — anchored INSIDE the banner (top-right) so
            they stick to it and scroll away with it, instead of floating over
            the feed below. */}
        <View style={{ position: 'absolute', top: 10, right: 12, flexDirection: 'row', gap: 10, zIndex: 2 }}>
          {/* Only the OWNER can edit the community / manage admins — admins get
              their powers (kick, delete posts, requests) from the member menu. */}
          {isOwner && (
            <TouchableOpacity style={styles.shareBtn} onPress={() => {
              (navigation as any).navigate('CommunitySettings', { communitySlug: community.slug });
            }}>
              <Ionicons name="settings-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.shareBtn} onPress={() =>
            Share.share({ message: `Check out ${community.name} on TADDLEBOX!` })
          }>
            <Ionicons name="share-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {community.privacy === 'private' && (
          <View style={styles.privateBadge}>
            <Ionicons name="lock-closed" size={11} color="#fff" />
            <Text style={styles.privateBadgeText}>Private</Text>
          </View>
        )}
      </LinearGradient>

      <View style={styles.infoCard}>
        <View style={styles.avatarRow}>
          <LinearGradient colors={avatarGradient} style={styles.avatar}>
            {community.avatarUrl ? (
              <Image source={{ uri: community.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="people-outline" size={36} color={colors.text.muted} />
            )}
          </LinearGradient>
          {isOwner ? (
            <View style={[styles.joinBtn, { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' }]}>
              <View style={styles.joinBtnInner}>
                <Ionicons name="shield-checkmark" size={14} color={colors.primaryLight} />
                <Text style={styles.joinBtnTextJoined}>Owner</Text>
              </View>
            </View>
          ) : community.isPending ? (
            // Pending join request → "Requested ✓"; tapping cancels the request.
            <TouchableOpacity
              style={[styles.joinBtn, styles.joinBtnJoined]}
              onPress={handleToggleJoin}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['rgba(251,191,36,0.12)', 'rgba(251,191,36,0.12)']}
                style={styles.joinBtnInner}
              >
                <Ionicons name="time" size={14} color="#FBBF24" />
                <Text style={[styles.joinBtnTextJoined, { color: '#FBBF24' }]}>
                  Requested ✓
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.joinBtn, community.isJoined && styles.joinBtnJoined]}
              onPress={handleToggleJoin}
              activeOpacity={0.8}
            >
              {community.isJoined ? (
                <LinearGradient
                  colors={['rgba(124,58,237,0.1)', 'rgba(124,58,237,0.1)']}
                  style={styles.joinBtnInner}
                >
                  <Ionicons name="exit-outline" size={14} color={colors.primaryLight} />
                  <Text style={styles.joinBtnTextJoined}>Leave</Text>
                </LinearGradient>
              ) : (
                <LinearGradient
                  colors={[colors.primary, colors.cyanDark]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.joinBtnInner}
                >
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text style={styles.joinBtnText}>{community.privacy === 'private' ? 'Request to Join' : 'Join'}</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.commName}>{community.name}</Text>
        {/* Tappable description — @mentions, #hashtags, c/communities and
            URLs resolve like the profile bio. */}
        {community.description ? (
          <BioText text={community.description} style={styles.commDesc} colors={colors} />
        ) : null}

        {community.isPending && (
          <Text style={{ fontSize: fontSizes.xs, color: '#FBBF24', fontWeight: '600', marginBottom: spacing.sm }}>
            Request sent — an admin will review it. Tap "Requested ✓" to cancel.
          </Text>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{community.memberCount || 0}</Text>
            <Text style={styles.statLabel}>Members</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{community.postCount || 0}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{community.category?.[0] || 'General'}</Text>
            <Text style={styles.statLabel}>Category</Text>
          </View>
        </View>

        {isAdmin && community.privacy === 'private' && (
          <TouchableOpacity style={styles.manageRequestsBtn} onPress={() => setShowRequests(true)}>
            <Ionicons name="people" size={18} color="#eab308" />
            <Text style={styles.manageRequestsText}>Manage Join Requests</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.manageRequestsBtn, { borderColor: 'rgba(124,58,237,0.5)', backgroundColor: 'rgba(124,58,237,0.1)' }]} onPress={() => setShowMembers(true)}>
          <Ionicons name="list" size={18} color={colors.primary} />
          <Text style={[styles.manageRequestsText, { color: colors.primary }]}>View Members</Text>
        </TouchableOpacity>

        {community.isJoined && (
          <TouchableOpacity style={styles.writePostBtn} onPress={() => setShowCreate(true)}>
            <View style={styles.writePostAvatar}>
              <Text style={{ fontSize: 14 }}>🧑‍💻</Text>
            </View>
            <Text style={styles.writePostPlaceholder}>Write something in {community.name}…</Text>
            <Ionicons name="image-outline" size={18} color={colors.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Breathing room before the first post. The header's card-coloured
          surface would otherwise sit flush against the first post card (same
          background) and read as one overlapping block. */}
      <View style={{ height: spacing.sm }} />
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Main header — logo, global search (scoped to THIS community, so the
          search box opens pre-scoped to c/slug), notifications. Back arrow
          replaces the drawer menu on this pushed screen. */}
      <MainHeader showBack />

      <SharedFeed
        posts={communityPosts}
        setPosts={setCommunityPosts}
        onDelete={handleDeletePost}
        onReposted={loadData}
        isAdmin={isAdmin}
        // Pull-to-refresh re-fetches detail + the first page of posts from the
        // server (previously nothing was wired here — the gesture did nothing).
        refreshing={refreshingPosts}
        onRefresh={async () => {
          setRefreshingPosts(true);
          try {
            await loadData();
          } finally {
            setRefreshingPosts(false);
          }
        }}
        // Infinite scroll — appends page 2, 3, … of the community's posts.
        onEndReached={() => {
          if (hasMorePosts && !loadingPosts && !loadingMorePosts) {
            setLoadingMorePosts(true);
            loadPosts(community.id, postPage + 1);
          }
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMorePosts ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ paddingVertical: 16 }}
            />
          ) : (
            <View style={{ height: 100 }} />
          )
        }
        ListHeaderComponent={renderHeader()}
        ListEmptyComponent={
          !loadingPosts ? (
            community.privacy === 'private' && !community.isJoined ? (
              /* Locked — private community and the user isn't an approved
                 member yet. The 403 on posts lands here; explain + join CTA
                 instead of a misleading "No posts yet". */
              <View style={styles.emptyState}>
                <Ionicons name="lock-closed" size={48} color={colors.text.muted} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyTitle}>Join to view posts</Text>
                <Text style={styles.emptyDesc}>
                  {community.isPending
                    ? "Your request is pending — an admin will review it. Posts appear here once you're approved."
                    : 'This is a private community. Request to join to see its posts.'}
                </Text>
                {!community.isPending && (
                  <TouchableOpacity
                    style={[styles.emptyBtn, { marginTop: 12 }]}
                    onPress={handleToggleJoin}
                    disabled={joinBusy}
                  >
                    <Text style={styles.emptyBtnText}>
                      {joinBusy ? 'Please wait…' : 'Request to Join'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={48} color={colors.text.muted} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyTitle}>No posts yet</Text>
                <Text style={styles.emptyDesc}>
                  {community.isJoined
                    ? 'Be the first to post in this community!'
                    : 'This community has no posts yet.'}
                </Text>
                {community.isJoined && (
                  <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
                    <Text style={styles.emptyBtnText}>Create First Post</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          ) : (
            <View style={[styles.emptyState, { marginTop: 40 }]}>
               <Text style={[styles.emptyTitle, { color: colors.text.muted }]}>Loading posts...</Text>
            </View>
          )
        }
      />

      <CreatePostModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        preselectedCommunityId={community.slug}
      />

      <ManageRequestsModal
        visible={showRequests}
        onClose={() => setShowRequests(false)}
        communityId={community.id}
        styles={styles}
        colors={colors}
      />

      <ManageMembersModal
        visible={showMembers}
        onClose={() => setShowMembers(false)}
        communityId={community.id}
        isAdmin={isAdmin}
        isOwner={isOwner}
        currentUserId={authUser?.id}
        // Ownership transfers / role changes / kicks all affect the screen's
        // community state (owner badge, memberRole, member count) — reload it.
        onChanged={loadData}
        styles={styles}
        colors={colors}
      />
    </View>
  );
}

function ManageRequestsModal({ visible, onClose, communityId, styles, colors }: any) {
  const navigation = useNavigation<any>();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadRequests();
    }
  }, [visible]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const res = await communityService.getRequests(communityId);
      setRequests(res.data || []);
    } catch (e) {
      console.log('Failed to load requests', e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      await communityService.approveRequest(communityId, userId);
      setRequests(prev => prev.filter(r => r.user_id !== userId));
    } catch (e) {
      console.log('Approve failed', e);
    }
  };

  const handleReject = async (userId: string) => {
    try {
      await communityService.rejectRequest(communityId, userId);
      setRequests(prev => prev.filter(r => r.user_id !== userId));
    } catch (e) {
      console.log('Reject failed', e);
    }
  };

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Join Requests</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          
          {loading ? (
            <Text style={{ color: colors.text.muted, textAlign: 'center', padding: 20 }}>Loading...</Text>
          ) : requests.length === 0 ? (
            <Text style={{ color: colors.text.muted, textAlign: 'center', padding: 20 }}>No pending requests.</Text>
          ) : (
            <FlatList
              data={requests}
              keyExtractor={item => item.user_id}
              renderItem={({ item }) => (
                <View style={styles.requestRow}>
                  <TouchableOpacity 
                    style={styles.requestUser}
                    onPress={() => {
                      onClose();
                      navigation.push('UserProfile' as any, { user: { id: item.user_id, name: item.name, username: item.username, avatarUrl: item.avatar_url } } as any);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.requestAvatar}>
                      {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={{ width: '100%', height: '100%', borderRadius: 20 }} />
                      ) : (
                        <Text style={{ fontSize: 20 }}>👾</Text>
                      )}
                    </View>
                    <View>
                      <Text style={styles.requestName}>{item.name}</Text>
                      <Text style={styles.requestUsername}>@{item.username}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.requestActions}>
                    <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => handleApprove(item.user_id)}>
                      <Ionicons name="checkmark" size={20} color="#10B981" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleReject(item.user_id)}>
                      <Ionicons name="close" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function ManageMembersModal({ visible, onClose, communityId, isAdmin, isOwner, currentUserId, onChanged, styles, colors }: any) {
  const navigation = useNavigation<any>();
  const [members, setMembers] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Viewer's role in this community (owner/admin/moderator/member/visitor) —
  // drives which actions the ⋯ menu offers. Seeded from the screen's props,
  // refreshed from the members fetch so a just-transferred owner immediately
  // sees owner controls.
  const [viewerRole, setViewerRole] = useState<string>(isOwner ? 'owner' : isAdmin ? 'admin' : 'visitor');
  // Member whose ⋯ menu is open — renders the action sheet overlay.
  const [actionMember, setActionMember] = useState<any | null>(null);

  useEffect(() => {
    if (visible) {
      setMembers([]);
      setPage(1);
      setHasMore(false);
      loadMembers(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, communityId]);

  const loadMembers = async (nextPage: number, refresh = false) => {
    setLoading(true);
    try {
      const res = await communityService.getMembers(communityId, nextPage, 20);
      const rows = res.data || [];
      const meta = res.meta as any;
      // Server reports the true viewer role + owner mapping — trust it over the
      // props (they're stale the moment ownership transfers).
      if (res.viewerRole) setViewerRole(res.viewerRole);
      setHasMore(meta ? !!meta.hasNext : rows.length === 20);
      setMembers((prev) =>
        refresh ? rows : [...prev, ...rows.filter((r: any) => !prev.some((m: any) => m.user_id === r.user_id))],
      );
      setPage(nextPage);
    } catch (e) {
      console.log('Failed to load members', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleKick = (userId: string, name: string) => {
    themedAlert('Kick Member', `Are you sure you want to remove ${name} from the community?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Kick', style: 'destructive', onPress: async () => {
        try {
          await communityService.removeMember(communityId, userId);
          setMembers(prev => prev.filter(m => m.user_id !== userId));
          setActionMember(null);
          onChanged?.();
        } catch (e: any) {
          themedAlert('Error', e?.response?.data?.message || 'Failed to remove member');
        }
      }}
    ]);
  };

  // Owner-only: promote to admin / demote to member.
  const handleRoleChange = (item: any, role: 'admin' | 'member') => {
    const isPromote = role === 'admin';
    themedAlert(
      isPromote ? 'Make Admin' : 'Remove Admin',
      isPromote
        ? `${item.name} will be able to kick members, manage join requests and delete posts.`
        : `${item.name} will lose admin powers and become a regular member.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPromote ? 'Make Admin' : 'Remove Admin',
          style: isPromote ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await communityService.updateMemberRole(communityId, item.user_id, role);
              // Flip the row locally so the badge updates instantly.
              setMembers(prev => prev.map(m => m.user_id === item.user_id ? { ...m, role } : m));
              setActionMember(null);
              onChanged?.();
            } catch (e: any) {
              themedAlert('Error', e?.response?.data?.message || 'Failed to update role');
            }
          },
        },
      ],
    );
  };

  // Owner-only: hand over the whole community. Old owner auto-becomes admin.
  const handleTransfer = (item: any) => {
    themedAlert(
      'Transfer Ownership',
      `Transfer this community to ${item.name}? You will become an admin, and the transfer cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          style: 'destructive',
          onPress: async () => {
            try {
              await communityService.transferOwnership(communityId, item.user_id);
              setActionMember(null);
              // Membership + community detail both changed (owner badge, role,
              // settings access) — refresh both.
              loadMembers(1, true);
              onChanged?.();
            } catch (e: any) {
              themedAlert('Error', e?.response?.data?.message || 'Failed to transfer ownership');
            }
          },
        },
      ],
    );
  };

  // Which actions appear for this member, given who's viewing.
  const buildActions = (item: any) => {
    const actions: { label: string; icon: string; danger?: boolean; onPress: () => void }[] = [];
    const targetRole = item.role || 'member'; // owner | admin | moderator | member
    const isTargetOwner = targetRole === 'owner';
    const isTargetSelf = item.user_id === currentUserId;
    const isViewerOwner = viewerRole === 'owner' || isOwner;
    const isViewerAdmin = viewerRole === 'admin' || viewerRole === 'moderator' || isAdmin;

    actions.push({
      label: 'View Profile',
      icon: 'person-outline',
      onPress: () => {
        setActionMember(null);
        onClose();
        navigation.push('UserProfile' as any, { user: { id: item.user_id, name: item.name, username: item.username, avatarUrl: item.avatar_url } } as any);
      },
    });

    // Owner-only admin management.
    if (isViewerOwner && !isTargetOwner) {
      if (targetRole === 'admin' || targetRole === 'moderator') {
        actions.push({ label: 'Remove Admin', icon: 'shield-outline', danger: true, onPress: () => handleRoleChange(item, 'member') });
      } else {
        actions.push({ label: 'Make Admin', icon: 'shield-checkmark-outline', onPress: () => handleRoleChange(item, 'admin') });
      }
    }

    // Owner-only transfer (never to yourself).
    if (isViewerOwner && !isTargetOwner && !isTargetSelf) {
      actions.push({ label: 'Transfer Ownership', icon: 'swap-horizontal', danger: true, onPress: () => handleTransfer(item) });
    }

    // Kick: owner may remove anyone but the owner/self; admins remove members
    // only (never other admins, never the owner).
    const canKick =
      !isTargetOwner &&
      !isTargetSelf &&
      (isViewerOwner || (isViewerAdmin && targetRole !== 'admin' && targetRole !== 'moderator'));
    if (canKick) {
      actions.push({ label: 'Kick Member', icon: 'trash-outline', danger: true, onPress: () => handleKick(item.user_id, item.name) });
    }

    return actions;
  };

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Members</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          
          {loading ? (
            <Text style={{ color: colors.text.muted, textAlign: 'center', padding: 20 }}>Loading...</Text>
          ) : members.length === 0 ? (
            <Text style={{ color: colors.text.muted, textAlign: 'center', padding: 20 }}>No members found.</Text>
          ) : (
            <FlatList
              data={members}
              keyExtractor={item => item.user_id}
              onEndReached={() => {
                if (hasMore && !loading) loadMembers(page + 1);
              }}
              onEndReachedThreshold={0.4}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadMembers(1, true);
              }}
              ListFooterComponent={
                loading && members.length > 0 ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                    style={{ paddingVertical: 14 }}
                  />
                ) : null
              }
              renderItem={({ item }) => (
                <View style={styles.requestRow}>
                  <TouchableOpacity 
                    style={styles.requestUser}
                    onPress={() => {
                      onClose();
                      navigation.push('UserProfile' as any, { user: { id: item.user_id, name: item.name, username: item.username, avatarUrl: item.avatar_url } } as any);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.requestAvatar}>
                      {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={{ width: '100%', height: '100%', borderRadius: 20 }} />
                      ) : (
                        <Text style={{ fontSize: 20 }}>👾</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.requestName} numberOfLines={1}>{item.name}</Text>
                        {item.role === 'owner' ? (
                          <View style={{ backgroundColor: 'rgba(251,191,36,0.14)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)' }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#FBBF24' }}>OWNER</Text>
                          </View>
                        ) : (item.role === 'admin' || item.role === 'moderator') ? (
                          <View style={{ backgroundColor: 'rgba(124,58,237,0.14)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)' }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#A78BFA' }}>ADMIN</Text>
                          </View>
                        ) : null}
                        {item.user_id === currentUserId && (
                          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>You</Text>
                        )}
                      </View>
                      <Text style={styles.requestUsername}>@{item.username}</Text>
                    </View>
                  </TouchableOpacity>
                  {/* Vertical-dots action button — contextual options for this member. */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: colors.border }]}
                    onPress={() => setActionMember(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="ellipsis-vertical" size={18} color={colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      </View>

      {/* Member action sheet — options depend on viewer role + target role. */}
      {actionMember && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }]}>
          <TouchableWithoutFeedback onPress={() => setActionMember(null)}>
            <View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>
          <View style={{ backgroundColor: colors.bg.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28, paddingTop: 10 }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 }} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text.primary, textAlign: 'center' }} numberOfLines={1}>
              {actionMember.name}
            </Text>
            <Text style={{ fontSize: 12, color: colors.text.muted, textAlign: 'center', marginBottom: 10 }}>
              @{actionMember.username}
            </Text>
            {buildActions(actionMember).map((a, i) => (
              <TouchableOpacity
                key={a.label}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 20, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
                onPress={a.onPress}
              >
                <Ionicons name={a.icon as any} size={18} color={a.danger ? '#EF4444' : colors.text.primary} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: a.danger ? '#EF4444' : colors.text.primary }}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={{ marginTop: 10, marginHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.bg.elevated, alignItems: 'center' }}
              onPress={() => setActionMember(null)}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text.muted }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
