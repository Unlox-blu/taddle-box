import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Share,
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
import PostCard             from '../../components/home/PostCard';
import CreatePostModal      from '../../components/common/CreatePostModal';
import CommentsModal        from '../../components/home/CommentsModal';
import type { CommunityStackParamList, Post } from '../../types';

const COMMUNITY_MOCK_POST_IDS: Record<string, string[]> = {
  c1: ['p3'],
  c2: ['p2'],
  c3: ['p1'],
  c4: ['p3', 'p1'],
};

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
    bannerEmoji: { fontSize: 52 },
    privateBadge: {
      position: 'absolute', top: 12, right: 14,
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
  });
}

export default function CommunityDetailScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { communityId } = route.params;
  const { isDark } = useTheme();
  const colors     = useThemeColors();
  const styles     = useMemo(() => makeStyles(colors), [colors]);

  const { communities, toggleJoin } = useCommunities();
  const { posts, toggleLike, toggleSave } = usePosts();

  const community = communities.find(c => c.id === communityId);
  const [filter, setFilter]         = useState<FeedFilter>('All');
  const [showCreate, setShowCreate]  = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);

  if (!community) return null;

  const bannerGradient = BANNER_COLORS[community.category] ?? ['#1a0a3e', '#0a1a3e'];
  const avatarGradient = AVATAR_COLORS_MAP[community.category] ?? ['#7C3AED', '#4C1D95'];

  const mockIds = COMMUNITY_MOCK_POST_IDS[community.id] ?? [];
  const communityPosts: Post[] = posts.filter(p =>
    p.community === community.name || mockIds.includes(p.id)
  );

  const displayPosts = filter === 'Trending'
    ? [...communityPosts].sort((a, b) => b.likes - a.likes)
    : filter === 'New'
    ? [...communityPosts].reverse()
    : communityPosts;

  const handleComment = (post: Post) => {
    setActiveCommentPost(post);
    setCommentsVisible(true);
  };

  const handleShare = async (post: Post) => {
    try {
      await Share.share({ message: `${post.content}\n\nShared from TADDLEBOX` });
    } catch {}
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn} onPress={() =>
          Share.share({ message: `Check out ${community.name} on TADDLEBOX!` })
        }>
          <Ionicons name="share-outline" size={22} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[2]}>
        <LinearGradient colors={bannerGradient} style={styles.banner}>
          <Text style={styles.bannerEmoji}>{community.banner}</Text>
          {community.isPrivate && (
            <View style={styles.privateBadge}>
              <Ionicons name="lock-closed" size={11} color="#fff" />
              <Text style={styles.privateBadgeText}>Private</Text>
            </View>
          )}
        </LinearGradient>

        <View style={styles.infoCard}>
          <View style={styles.avatarRow}>
            <LinearGradient colors={avatarGradient} style={styles.avatar}>
              <Text style={styles.avatarEmoji}>{community.avatar}</Text>
            </LinearGradient>
            <TouchableOpacity
              style={[styles.joinBtn, community.isJoined && styles.joinBtnJoined]}
              onPress={() => toggleJoin(community.id)}
              activeOpacity={0.8}
            >
              {community.isJoined ? (
                <LinearGradient
                  colors={['rgba(124,58,237,0.2)', 'rgba(124,58,237,0.2)']}
                  style={styles.joinBtnInner}
                >
                  <Ionicons name="checkmark" size={14} color={colors.primaryLight} />
                  <Text style={styles.joinBtnTextJoined}>Joined</Text>
                </LinearGradient>
              ) : (
                <LinearGradient
                  colors={[colors.primary, colors.cyanDark]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.joinBtnInner}
                >
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text style={styles.joinBtnText}>Join</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.commName}>{community.name}</Text>
          <Text style={styles.commDesc}>{community.description}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{(community.members / 1000).toFixed(1)}k</Text>
              <Text style={styles.statLabel}>Members</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{communityPosts.length}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{community.category}</Text>
              <Text style={styles.statLabel}>Category</Text>
            </View>
          </View>

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

        {displayPosts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>💬</Text>
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
          displayPosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onLike={toggleLike}
              onSave={toggleSave}
              onComment={handleComment}
              onShare={handleShare}
            />
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <CreatePostModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        preselectedCommunityId={community.id}
      />

      <CommentsModal
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        post={activeCommentPost}
      />
    </View>
  );
}
