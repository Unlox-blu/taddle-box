import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Share, FlatList, Image, Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import { useCommunities } from '../../context/CommunityContext';
import { usePosts }        from '../../context/PostsContext';
import { communityService } from '../../services/community.service';
import { postsService }     from '../../services/posts.service';
import PostCard             from '../../components/home/PostCard';
import CreatePostModal      from '../../components/common/CreatePostModal';
import SharedFeed           from '../../components/common/SharedFeed';
import { useAuth }          from '../../context/AuthContext';
import type { CommunityStackParamList, Post, Community } from '../../types';



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
type FeedFilter = 'All' | 'Trending' | 'New';

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },

    topBar: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingVertical: 10,
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    },
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
    bannerEmoji: { fontSize: 52 },
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

    filterBar: {
      flexDirection: 'row',
      backgroundColor: c.bg.base,
      borderBottomWidth: 1, borderBottomColor: c.border,
      paddingHorizontal: spacing.lg, gap: 0,
    },
    filterTab: {
      flex: 1, alignItems: 'center', paddingVertical: 12,
      borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    filterTabActive:    { borderBottomColor: c.primaryLight },
    filterTabText:      { fontSize: fontSizes.sm, fontWeight: '600', color: c.text.muted },
    filterTabTextActive: { color: c.primaryLight },

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

  const { communities, toggleJoin } = useCommunities();
  // Removed usePosts since we'll handle likes/saves locally for community posts

  const [community, setCommunity] = useState<Community | null>(
    communities.find(c => c.slug === communitySlug) || null
  );
  const [communityPosts, setCommunityPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const [filter, setFilter]         = useState<FeedFilter>('All');
  const [showCreate, setShowCreate]  = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  
  const { user: authUser } = useAuth();
  const isAdmin = community?.memberRole === 'admin' || community?.memberRole === 'moderator';
  const isOwner = community?.ownerId === authUser?.id;

  // Fetch full details and posts on mount
  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        const detailRes = await communityService.getCommunityDetail(communitySlug);
        if (detailRes.data && active) {
          setCommunity(detailRes.data);
          
          setLoadingPosts(true);
          const postsRes = await communityService.getCommunityPosts(detailRes.data.id);
          console.log("FETCHED POSTS:", JSON.stringify(postsRes).substring(0, 200));
          if (postsRes.data && active) {
            setCommunityPosts(postsRes.data);
          }
        }
      } catch (e) {
        console.log("Failed to load community details", e);
      } finally {
        if (active) setLoadingPosts(false);
      }
    };
    loadData();
    return () => { active = false; };
  }, [communitySlug]);

  const handleDeletePost = async (post: Post) => {
    try {
      await postsService.deletePost(post.id);
      setCommunityPosts(prev => prev.filter(p => p.id !== post.id));
    } catch (e) {
      console.error('Failed to delete post:', e);
    }
  };

  // Sync isJoined status from global context to reflect toggleJoin instantly
  useEffect(() => {
    if (community) {
      const contextComm = communities.find(c => c.id === community.id);
      if (contextComm && (contextComm.isJoined !== community.isJoined || contextComm.memberCount !== community.memberCount)) {
        setCommunity(prev => prev ? { ...prev, isJoined: contextComm.isJoined, memberCount: contextComm.memberCount } : prev);
      }
    }
  }, [communities, community?.id]);

  if (!community) return null;

  const bannerGradient = BANNER_COLORS[community.category?.[0]] ?? ['#1a0a3e', '#0a1a3e'];
  const avatarGradient = AVATAR_COLORS_MAP[community.category?.[0]] ?? ['#7C3AED', '#4C1D95'];

  const displayPosts = filter === 'Trending'
    ? [...communityPosts].sort((a, b) => b.likes - a.likes)
    : filter === 'New'
    ? [...communityPosts].reverse()
    : communityPosts;

  const renderHeader = () => (
    <>
      <LinearGradient colors={bannerGradient} style={styles.banner}>
        {community.bannerUrl ? (
          <Image source={{ uri: community.bannerUrl }} style={styles.bannerImage} />
        ) : (
          <View style={[styles.bannerImage, { backgroundColor: colors.bg.elevated, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="image-outline" size={48} color={colors.text.muted} />
          </View>
        )}
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
          ) : (
            <TouchableOpacity
              style={[styles.joinBtn, community.isJoined && styles.joinBtnJoined]}
              onPress={() => toggleJoin(community.id)}
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
        <Text style={styles.commDesc}>{community.description}</Text>

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

      <View style={styles.filterBar}>
        {(['All', 'Trending', 'New'] as FeedFilter[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
              {f === 'Trending' ? '🔥 Trending' : f === 'New' ? '✨ New' : '📋 All'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={[styles.topBar, { top: Math.max(10, insets.top) }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(isAdmin || isOwner) && (
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
      </View>

      <SharedFeed
        posts={displayPosts}
        setPosts={setCommunityPosts}
        onDelete={handleDeletePost}
        isAdmin={isAdmin}
        ListHeaderComponent={renderHeader()}
        ListEmptyComponent={
          !loadingPosts ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.text.muted} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptyDesc}>
                {community.isJoined
                  ? 'Be the first to post in this community!'
                  : 'Join this community to see and create posts.'}
              </Text>
              {community.isJoined && (
                <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
                  <Text style={styles.emptyBtnText}>Create First Post</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={[styles.emptyState, { marginTop: 40 }]}>
               <Text style={[styles.emptyTitle, { color: colors.text.muted }]}>Loading posts...</Text>
            </View>
          )
        }
        ListFooterComponent={<View style={{ height: 100 }} />}
      />

      <CreatePostModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        preselectedCommunityId={community.id}
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
                      navigation.navigate('UserProfile' as any, { user: { id: item.user_id, name: item.name, username: item.username, avatarUrl: item.avatar_url } } as any);
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

function ManageMembersModal({ visible, onClose, communityId, isAdmin, styles, colors }: any) {
  const navigation = useNavigation<any>();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadMembers();
    }
  }, [visible]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const res = await communityService.getMembers(communityId);
      setMembers(res.data || []);
    } catch (e) {
      console.log('Failed to load members', e);
    } finally {
      setLoading(false);
    }
  };

  const handleKick = (userId: string, name: string) => {
    Alert.alert('Kick Member', `Are you sure you want to remove ${name} from the community?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Kick', style: 'destructive', onPress: async () => {
        try {
          await communityService.removeMember(communityId, userId);
          setMembers(prev => prev.filter(m => m.user_id !== userId));
        } catch (e) {
          Alert.alert('Error', 'Failed to remove member');
        }
      }}
    ]);
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
              renderItem={({ item }) => (
                <View style={styles.requestRow}>
                  <TouchableOpacity 
                    style={styles.requestUser}
                    onPress={() => {
                      onClose();
                      navigation.navigate('UserProfile' as any, { user: { id: item.user_id, name: item.name, username: item.username, avatarUrl: item.avatar_url } } as any);
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
                  {isAdmin && item.role !== 'owner' && (
                    <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleKick(item.user_id, item.name)}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          )}
        </View>
      </View>
    </View>
  );
}
