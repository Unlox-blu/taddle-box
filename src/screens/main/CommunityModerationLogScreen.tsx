import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../context/ThemeContext';
import { fontSizes, spacing, radii } from '../../theme';
import { communityService } from '../../services/community.service';
import type { CommunityStackParamList } from '../../types';

type Route = RouteProp<CommunityStackParamList, 'ModerationLog'>;

// Action → icon + verb so each log row reads as "actor <verb> target".
const ACTION_META: Record<string, { icon: string; color: string; verb: string }> = {
  make_admin:         { icon: 'shield-checkmark',        color: '#A78BFA', verb: 'made' },
  remove_admin:       { icon: 'shield-outline',          color: '#F59E0B', verb: 'removed' },
  transfer_ownership: { icon: 'swap-horizontal',         color: '#FBBF24', verb: 'transferred ownership to' },
  approve_join:       { icon: 'checkmark-circle',        color: '#34D399', verb: 'approved the join request of' },
  reject_join:        { icon: 'close-circle',            color: '#F87171', verb: 'rejected the join request of' },
  kick_member:        { icon: 'person-remove',           color: '#F87171', verb: 'removed member' },
  delete_post:        { icon: 'trash-outline',           color: '#F87171', verb: 'deleted a post by' },
};

const timeAgo = (iso: string) => {
  const age = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(age / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

export default function CommunityModerationLogScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { communityId } = route.params;
  const colors = useThemeColors();

  const [entries, setEntries] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (nextPage: number, refresh = false) => {
    if (nextPage === 1) setLoading(true);
    try {
      const res = await communityService.getModerationLog(communityId, nextPage, 20);
      const rows = res.data || [];
      const meta = res.meta as any;
      setHasMore(meta ? !!meta.hasNext : rows.length === 20);
      setEntries(prev => refresh ? rows : [...prev, ...rows.filter((r: any) => !prev.some((e: any) => e.id === r.id))]);
      setPage(nextPage);
    } catch (e: any) {
      console.log('Failed to load moderation log', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId]);

  useEffect(() => {
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.base, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Moderation Log</Text>
      </View>

      <FlatList
        data={entries}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(1, true); }}
            tintColor={colors.primary}
          />
        }
        onEndReached={() => { if (hasMore && !loading) load(page + 1); }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loading && entries.length > 0 ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: 14 }} />
        ) : null}
        ListEmptyComponent={() => (
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="file-tray-outline" size={48} color={colors.text.muted} />
              <Text style={[styles.emptyText, { color: colors.text.secondary }]}>No moderation actions yet.</Text>
              <Text style={[styles.emptyHint, { color: colors.text.muted }]}>
                Kicks, admin changes, ownership transfers and moderator post removals appear here.
              </Text>
            </View>
          )
        )}
        renderItem={({ item }) => {
          const meta = ACTION_META[item.action] || { icon: 'ellipse-outline', color: colors.text.muted, verb: 'acted on' };
          const hasTarget = item.target_user_id != null;
          return (
            <View style={[styles.row, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
              <View style={[styles.actionIcon, { backgroundColor: meta.color + '1F' }]}>
                <Ionicons name={meta.icon as any} size={20} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <View style={[styles.avatarWrap, { backgroundColor: colors.bg.elevated, borderColor: colors.border }]}>
                    {item.actor_avatar ? (
                      <Image source={{ uri: item.actor_avatar }} style={styles.avatar} />
                    ) : (
                      <Ionicons name="person-outline" size={14} color={colors.text.muted} />
                    )}
                  </View>
                  <Text style={[styles.actor, { color: colors.text.primary }]} numberOfLines={1}>
                    {item.actor_name || item.actor_username || 'Unknown'}
                  </Text>
                  <Text style={[styles.time, { color: colors.text.muted }]}>{timeAgo(item.created_at)}</Text>
                </View>
                <Text style={[styles.action, { color: colors.text.secondary }]} numberOfLines={2}>
                  <Text style={{ fontWeight: '700', color: meta.color }}>{meta.verb} </Text>
                  {hasTarget ? (
                    <Text style={{ color: colors.text.primary }}>{item.target_name || `@${item.target_username}`}</Text>
                  ) : null}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: fontSizes.lg, fontWeight: '800' },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderWidth: 1, borderRadius: radii.lg, padding: 14, marginBottom: 10,
  },
  actionIcon: {
    width: 38, height: 38, borderRadius: radii.full,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarWrap: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: '100%', height: '100%' },
  actor: { flex: 1, fontSize: fontSizes.md, fontWeight: '800' },
  time: { fontSize: fontSizes.xs },
  action: { fontSize: fontSizes.sm, marginTop: 6, lineHeight: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 60 },
  emptyText: { fontSize: fontSizes.md, fontWeight: '700' },
  emptyHint: { fontSize: fontSizes.sm, textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
});
