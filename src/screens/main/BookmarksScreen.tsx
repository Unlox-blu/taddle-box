import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import PostCard from '../../components/home/PostCard';
import { usePosts } from '../../context/PostsContext';
import type { HomeStackParamList, Post } from '../../types';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'Bookmarks'>;

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },

    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: radii.md,
      backgroundColor: c.bg.card,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.border,
    },
    headerTitle: {
      flex: 1,
      fontSize: fontSizes.xl, fontWeight: '800',
      color: c.text.primary,
      marginLeft: spacing.md,
    },
    headerRight: { width: 38, alignItems: 'flex-end' },
    countBadge: {
      backgroundColor: c.primary,
      borderRadius: radii.full,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    countText: { fontSize: fontSizes.xs, fontWeight: '800', color: '#fff' },

    subtext: {
      fontSize: fontSizes.sm, color: c.text.muted,
      paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    },

    empty: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 48, paddingBottom: 80,
    },
    emptyEmoji: { fontSize: 56, marginBottom: spacing.lg },
    emptyTitle: {
      fontSize: fontSizes.xl, fontWeight: '800',
      color: c.text.primary, textAlign: 'center',
      marginBottom: spacing.sm,
    },
    emptyDesc: {
      fontSize: fontSizes.sm, color: c.text.muted,
      textAlign: 'center', lineHeight: 20,
    },
  });
}

export default function BookmarksScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const colors     = useThemeColors();
  const styles     = useMemo(() => makeStyles(colors), [colors]);
  const { posts, toggleLike, toggleSave } = usePosts();

  const saved = posts.filter(p => p.isSaved);

  const handleAuthorPress = (post: Post) =>
    navigation.navigate('UserProfile', { user: post.author });

  const handleComment = (post: Post) =>
    navigation.navigate('Comments', { post });

  const handleShare = async (post: Post) => {
    try { await Share.share({ message: `${post.content}\n\nShared from TADDLEBOX` }); } catch {}
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bookmarks</Text>
        <View style={styles.headerRight}>
          {saved.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{saved.length}</Text>
            </View>
          )}
        </View>
      </View>

      {saved.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🔖</Text>
          <Text style={styles.emptyTitle}>No bookmarks yet</Text>
          <Text style={styles.emptyDesc}>
            Tap the bookmark icon on any post to save it here for later.
          </Text>
        </View>
      ) : (
        <FlatList
          data={saved}
          keyExtractor={p => p.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onAuthorPress={handleAuthorPress}
              onComment={handleComment}
              onShare={handleShare}
              onLike={toggleLike}
              onSave={toggleSave}
            />
          )}
          ListHeaderComponent={
            <Text style={styles.subtext}>
              {saved.length} saved {saved.length === 1 ? 'post' : 'posts'}
            </Text>
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}
