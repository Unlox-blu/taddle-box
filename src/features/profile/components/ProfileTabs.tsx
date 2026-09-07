import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { stageScreenParams } from '../../../shared/state/screen-params';
import { useThemeColors } from '../../../design-system/theme/ThemeProvider';
import { spacing } from '../../../design-system';
import SharedFeed from '../../feed/components/SharedFeed';
import { useProfilePosts } from '../../feed/queries/feed.queries';

type Tab = 'posts' | 'media' | 'saved' | 'games';

interface ProfileTabsProps {
  userId?: string;
}

export default function ProfileTabs({ userId }: ProfileTabsProps) {
  const colors = useThemeColors();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('posts');

  const {
    data: postPages,
    isLoading,
  } = useProfilePosts(userId, 'posts', tab === 'posts' || tab === 'media');

  const posts = useMemo(
    () => postPages?.pages.flat().map((r) => r.item) || [],
    [postPages],
  );

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
        isLoading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : posts.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ color: colors.text.muted }}>No posts yet.</Text>
          </View>
        ) : (
          <SharedFeed
            items={posts}
            scrollEnabled={false}
            contentContainerStyle={{ gap: 12, paddingHorizontal: spacing.lg }}
            feedItems={posts}
            feedContext="profile"
            feedContextId={userId}
          />
        )
      ) : tab === 'media' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 2 }}>
          {posts.filter((p: any) => !!p.mediaUri).length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center', width: '100%' }}>
              <Text style={{ color: colors.text.muted }}>No media yet.</Text>
            </View>
          ) : (
            posts.filter((p: any) => !!p.mediaUri).map((post: any) => {
              return (
                <TouchableOpacity key={post.id} style={{ width: '33.33%', padding: 2, aspectRatio: 1 }} onPress={() => {
                  stageScreenParams("reel", { post, feedContext: "profile", feedContextId: userId });
                  router.push({
                    pathname: `/post/${post?.id}`,
                    params: { feedContext: "profile", ...(userId ? { feedContextId: userId } : {}) },
                  } as never);
                }}>
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
