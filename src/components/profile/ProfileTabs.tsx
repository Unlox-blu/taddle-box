import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors } from '../../context/ThemeContext';
import { fontSizes, spacing } from '../../theme';
import { postsService } from '../../services/posts.service';
import SharedFeed from '../common/SharedFeed';
import type { Post } from '../../types';

type Tab = 'posts' | 'media' | 'saved' | 'games';

interface ProfileTabsProps {
  userId?: string;
}

export default function ProfileTabs({ userId }: ProfileTabsProps) {
  const colors = useThemeColors();
  const navigation = useNavigation<any>();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('posts');

  useEffect(() => {
    let active = true;
    const loadPosts = async () => {
      try {
        if (!userId) return;
        setLoading(true);
        const postsRes = await postsService.getUserPosts(userId);
        if (active && postsRes?.data) {
          setPosts(postsRes.data);
        }
      } catch (e) {
        console.warn('Failed to load user posts', e);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadPosts();
    return () => { active = false; };
  }, [userId]);

  // SharedFeed handles handleLike and handleSave natively when setPosts is provided

  return (
    <View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 2 }}>
        {(['posts', 'media', 'saved', 'games'] as const).map(t => (
          <TouchableOpacity
            key={t} onPress={() => setTab(t)}
            style={[{ flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' }, tab === t && { borderBottomColor: colors.primaryLight }]}
          >
            <Text style={[{ fontSize: 14, color: colors.text.muted, fontWeight: '600' }, tab === t && { color: colors.primaryLight }]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'posts' ? (
        loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : posts.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ color: colors.text.muted }}>No posts yet.</Text>
          </View>
        ) : (
          <SharedFeed
            posts={posts}
            setPosts={setPosts}
            scrollEnabled={false}
            contentContainerStyle={{ gap: 12, paddingHorizontal: spacing.lg }}
          />
        )
      ) : tab === 'media' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 2 }}>
          {posts.filter(p => !!p.mediaUri).length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center', width: '100%' }}>
              <Text style={{ color: colors.text.muted }}>No media yet.</Text>
            </View>
          ) : (
            posts.filter(p => !!p.mediaUri).map(post => {
              return (
                <TouchableOpacity key={post.id} style={{ width: '33.33%', padding: 2, aspectRatio: 1 }} onPress={() => navigation.navigate('Comments', { post })}>
                  <Image source={{ uri: post.mediaUri }} style={{ width: '100%', height: '100%', borderRadius: 4, backgroundColor: colors.bg.elevated }} />
                </TouchableOpacity>
              );
            })
          )}
        </View>
      ) : (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <Text style={{ color: colors.text.muted }}>Nothing here yet.</Text>
        </View>
      )}
    </View>
  );
}
