import React, { useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, fontSizes, spacing, type ColorPalette } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import type { Post } from '../../types';

const CARD_W = Dimensions.get('window').width - spacing.lg * 2;

interface PostCardProps {
  post: Post;
  onLike?: (id: string) => void;
  onSave?: (id: string) => void;
  onComment?: (post: Post) => void;
  onShare?: (post: Post) => void;
  onAuthorPress?: (post: Post) => void;
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

export default function PostCard({ post, onLike, onSave, onComment, onShare, onAuthorPress }: PostCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(1)).current;

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
            <Text style={styles.author}>{post.author.name}</Text>
            <Text style={styles.sub}>
              in <Text style={styles.community}>{post.community}</Text>
              {' · '}{post.createdAt}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.xpPill}>
          <Text style={styles.xpText}>⚡ +{post.xpEarned}</Text>
        </View>
      </View>

      {/* Real media (from device picker) */}
      {post.mediaUri ? (
        <MediaBanner uri={post.mediaUri} ratio={post.mediaAspectRatio ?? '1:1'} />
      ) : post.type === 'image' && post.image ? (
        <View style={styles.imageBanner}>
          <Text style={styles.imageBannerEmoji}>{post.image}</Text>
          <View style={styles.imageBannerLabel}>
            <Text style={styles.imageBannerLabelText}>Media Post</Text>
          </View>
        </View>
      ) : null}

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.content}>{post.content}</Text>
        <View style={styles.tags}>
          {post.hashtags.map(tag => (
            <Text key={tag} style={styles.tag}>{tag}</Text>
          ))}
        </View>
      </View>

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
            {post.likes.toLocaleString()}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={() => onComment?.(post)}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.text.muted} />
          <Text style={styles.actionText}>{post.comments}</Text>
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

function MediaBanner({ uri, ratio }: { uri: string; ratio: '1:1' | '16:9' }) {
  const height = ratio === '1:1' ? CARD_W : Math.round((CARD_W * 9) / 16);
  return (
    <Image
      source={{ uri }}
      style={{ width: CARD_W, height }}
      resizeMode="cover"
    />
  );
}
