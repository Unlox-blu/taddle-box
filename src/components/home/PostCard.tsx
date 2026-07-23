import React, { useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image, Dimensions, ScrollView } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { radii, fontSizes, spacing, type ColorPalette } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import type { Post, HomeStackParamList } from '../../types';

const CARD_W = Dimensions.get('window').width - spacing.lg * 2;

interface PostCardProps {
  post: Post;
  onLike?: (id: string) => void;
  onSave?: (id: string) => void;
  onComment?: (post: Post) => void;
  onShare?: (post: Post) => void;
  onAuthorPress?: (post: Post) => void;
  isActive?: boolean;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      gap: 10,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 10,
    },
    avatar: {
      width: 38, height: 38,
      borderRadius: 19,
      backgroundColor: c.bg.elevated,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarEmoji: { fontSize: 18 },
    meta: { flex: 1 },
    author: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.primary },
    sub:    { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 1 },
    community: { color: c.primaryLight },
    xpPill: {
      backgroundColor: 'rgba(251,191,36,0.11)',
      borderWidth: 1,
      borderColor: 'rgba(251,191,36,0.24)',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: radii.full,
    },
    xpText: { fontSize: fontSizes.xs, fontWeight: '800', color: c.xpGold },
    imageBanner: {
      height: 180,
      backgroundColor: c.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    imageBannerEmoji: { fontSize: 52 },
    imageBannerLabel: {
      position: 'absolute',
      bottom: 10, left: 10,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 6,
      paddingVertical: 2,
      paddingHorizontal: 8,
    },
    imageBannerLabelText: { fontSize: fontSizes.xs, color: c.text.secondary },
    body: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    title: {
      fontSize: fontSizes.lg,
      fontWeight: '700',
      color: c.text.primary,
      marginBottom: 6,
    },
    content: {
      fontSize: fontSizes.md,
      color: c.text.primary,
      lineHeight: 21,
      marginBottom: 8,
    },
    tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    tag:  { fontSize: fontSizes.sm, color: c.cyanLight },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 14,
    },
    action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    actionText: { fontSize: fontSizes.sm, color: c.text.muted },
    spacer: { flex: 1 },
  });
}

export default function PostCard({ post, isActive, onLike, onSave, onComment, onShare, onAuthorPress }: PostCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(1)).current;
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const handleLike = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, speed: 50 }),
      Animated.spring(scale, { toValue: 1,   useNativeDriver: true, speed: 50 }),
    ]).start();
    onLike?.(post.id);
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => onAuthorPress?.(post)}
          activeOpacity={0.7}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>{post.author.avatar}</Text>
          </View>
          <View style={styles.meta}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.author}>{post.author.name}</Text>
              <View style={styles.xpPill}>
                <Text style={styles.xpText}>⚡ +{post.xpEarned}</Text>
              </View>
            </View>
            <Text style={[styles.sub, { color: colors.text.secondary, fontWeight: '500' }]}>
              @{post.author.handle || post.author.name.toLowerCase().replace(/\s+/g, '')}
            </Text>
            <Text style={styles.sub}>
              in <Text style={styles.community}>{typeof post.community === 'object' ? (post.community as any)?.name : post.community}</Text>
              {' · '}{post.createdAt}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Body Text Before Media */}
      <View style={[styles.body, { paddingTop: 0 }]}>
        {!!(post as any).title && <Text style={styles.title}>{(post as any).title}</Text>}
        {!!post.content && (
          <Text style={styles.content}>
            {(post.content || '').split(/(\{@\}\[[^\]]+\]\([^)]+\)|\{#\}\[[^\]]+\]\([^)]+\)|@\w+|#\w+)/g).map((part: string, i: number) => {
              const mentionMatch = part.match(/^\{@\}\[([^\]]+)\]\(([^)]+)\)$/);
              if (mentionMatch) {
                const name = mentionMatch[1];
                const id = mentionMatch[2];
                return (
                  <Text key={i} style={{ color: colors.primaryLight, fontWeight: '700' }} onPress={() => navigation.navigate('UserProfile', { user: { id, name, handle: name, avatar: '', level: 1, xp: 0, xpToNext: 100 } } as any)}>
                    @{name}
                  </Text>
                );
              }

              const hashMatch = part.match(/^\{#\}\[([^\]]+)\]\(([^)]+)\)$/);
              if (hashMatch) {
                const tag = hashMatch[1];
                return (
                  <Text key={i} style={{ color: colors.cyanLight }} onPress={() => navigation.navigate('Search', { query: tag })}>
                    #{tag}
                  </Text>
                );
              }

              if (part.startsWith('@')) {
                return (
                  <Text key={i} style={{ color: colors.primaryLight, fontWeight: '700' }} onPress={() => navigation.navigate('UserProfile', { user: { id: part.slice(1), name: part.slice(1), handle: part.slice(1), avatar: '', level: 1, xp: 0, xpToNext: 100 } } as any)}>
                    {part}
                  </Text>
                );
              }

              if (part.startsWith('#')) {
                return (
                  <Text key={i} style={{ color: colors.cyanLight }} onPress={() => navigation.navigate('Search', { query: part.replace('#', '') })}>
                    {part}
                  </Text>
                );
              }

              return <Text key={i}>{part}</Text>;
            })}
          </Text>
        )}
        {(post.hashtags || []).length > 0 && (
          <View style={styles.tags}>
            {(post.hashtags || []).map(tag => (
              <Text key={tag} style={styles.tag}>{tag}</Text>
            ))}
          </View>
        )}
      </View>

      {/* Multi-Media Banner */}
      {((post as any).media && (post as any).media.length > 0) ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} snapToInterval={CARD_W} decelerationRate="fast">
          {((post as any).media).map((m: any, idx: number) => {
            const url = m.cloudfront_url || m.url || m.uri;
            const isAudio = m.media_type === 'audio' || m.type === 'audio';
            const isVideo = m.media_type === 'video' || m.type === 'video';
            const hasAudioTrack = ((post as any).media).some((i: any) => i.media_type === 'audio' || i.type === 'audio');
            
            if (isAudio) {
              return (
                <View key={idx} style={[styles.imageBanner, { width: CARD_W, height: CARD_W }]}>
                  <Ionicons name="musical-notes" size={48} color={colors.primaryLight} />
                  <Text style={{color: '#fff', marginTop: 10}}>Audio File</Text>
                  <Video source={{ uri: url }} shouldPlay={isActive ?? true} isLooping={false} style={{ width: 0, height: 0 }} />
                </View>
              );
            }
            if (isVideo) {
              return (
                <View key={idx} style={{ width: CARD_W, height: CARD_W, backgroundColor: '#000' }}>
                  <Video 
                    source={{ uri: url }} 
                    style={{ width: CARD_W, height: CARD_W }} 
                    resizeMode={ResizeMode.COVER} 
                    shouldPlay={isActive ?? true} 
                    isLooping 
                    isMuted={hasAudioTrack} 
                  />
                </View>
              );
            }
            return url ? (
              <Image key={idx} source={{ uri: url }} style={{ width: CARD_W, height: CARD_W }} resizeMode="cover" />
            ) : null;
          })}
        </ScrollView>
      ) : post.mediaUri ? (
        <Image source={{ uri: post.mediaUri }} style={{ width: CARD_W, height: CARD_W }} resizeMode="cover" />
      ) : post.type === 'image' && post.image ? (
        <View style={styles.imageBanner}>
          <Text style={styles.imageBannerEmoji}>{post.image}</Text>
          <View style={styles.imageBannerLabel}>
            <Text style={styles.imageBannerLabelText}>Media Post</Text>
          </View>
        </View>
      ) : null}



      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={handleLike}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons
              name={post.isLiked ? 'heart' : 'heart-outline'}
              size={20}
              color={post.isLiked ? colors.pink : colors.text.muted}
            />
          </Animated.View>
          <Text style={[styles.actionText, post.isLiked && { color: colors.pink }]}>
            {(post.likes ?? (post as any).likesCount ?? 0).toLocaleString()}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={() => onComment?.(post)}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.text.muted} />
          <Text style={styles.actionText}>{(post.comments ?? (post as any).commentsCount ?? 0).toLocaleString()}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={() => onShare?.(post)}>
          <Ionicons name="arrow-redo-outline" size={18} color={colors.text.muted} />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>

        <View style={styles.spacer} />

        <TouchableOpacity onPress={() => onSave?.(post.id)}>
          <Ionicons
            name={post.isSaved ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={post.isSaved ? colors.primary : colors.text.muted}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

