import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { fontSizes, spacing, type ColorPalette } from '../../../design-system';
import { useTheme, useThemeColors } from '../../../design-system/theme/ThemeProvider';
import type { Post } from '../../../shared/types';
import CommentsThread from '../components/CommentsThread';
import { takeScreenParams } from '../../../shared/state/screen-params';

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
    headerCenter: { flex: 1 },
    title:    { fontSize: fontSizes.lg, fontWeight: '800', color: c.text.primary },
    subtitle: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 1 },
  });
}

/**
 * Standalone comments screen — a compact thread view (comment list + composer)
 * with no post card chrome. Post detail lives in PostDetailScreen; this route
 * is for surfaces that want the thread alone.
 */
export default function CommentsScreen() {
  const router = useRouter();
  const { postId } = useLocalSearchParams<{ postId?: string }>();
  // Staged post object — consumed exactly once on mount; deep links fall back
  // to the id from the URL (the thread only needs post.id to fetch comments).
  const [staged] = useState(() => takeScreenParams<{ post?: Post }>('post'));
  const post = staged?.post ?? ({ id: postId } as Post);
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const composerRef = useRef<any>(null);

  const commentCount = post.comments ?? (post as any)?.commentsCount ?? 0;
  const postAuthorName = (post as any)?.author?.name || 'Post';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Comments</Text>
            <Text style={styles.subtitle}>on {postAuthorName}&apos;s post</Text>
          </View>
        </View>

        <CommentsThread post={post} composerRef={composerRef} />
      </View>
    </KeyboardAvoidingView>
  );
}
