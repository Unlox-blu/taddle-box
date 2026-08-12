import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, TextInput,
  StyleSheet, Modal, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useJoinedCommunities } from '../../queries/communities';
import type { Community } from '../../types';

export interface AudienceListProps {
  /** null = Feed (everyone), undefined = no selection yet. */
  selectedId: string | null | undefined;
  onSelect: (communityId: string | null, community?: Community) => void;
  /** Feed row label — e.g. "Public", "Followers", or "Feed". */
  feedLabel: string;
  /** Feed row description. */
  feedMeta: string;
  /** Ionicons name for the Feed row (globe / lock). */
  feedIcon?: string;
  /** Bounded height for embedding (repost sheet); modal gives it flex:1. */
  height?: number;
}

interface ModalProps extends AudienceListProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    // ── Modal wrapper ───────────────────────────────────────────────
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      borderWidth: 1,
      backgroundColor: c.bg.card,
      borderColor: c.border,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      maxHeight: '78%',
      minHeight: 320,
    },
    dragHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderHover,
      marginBottom: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    title: { fontSize: fontSizes.lg, fontWeight: '800', color: c.text.primary },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Search ──────────────────────────────────────────────────────
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg.surface,
      marginBottom: 12,
    },
    searchInput: {
      flex: 1,
      fontSize: fontSizes.sm,
      color: c.text.primary,
      padding: 0,
      margin: 0,
    },

    // ── Rows ────────────────────────────────────────────────────────
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      paddingHorizontal: 10,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: 'transparent',
      marginBottom: 4,
    },
    optionActive: {
      backgroundColor: 'rgba(124,58,237,0.1)',
      borderColor: 'rgba(124,58,237,0.35)',
    },
    optionIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.bg.base,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    optionAvatar: { fontSize: 18 },
    optionInfo: { flex: 1 },
    optionName: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.primary },
    optionMeta: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 1 },
    check: { marginLeft: 4 },

    footer: { paddingVertical: 14, alignItems: 'center' },
    empty: { alignItems: 'center', paddingVertical: 36, gap: 6 },
    emptyEmoji: { fontSize: 36 },
    emptyTitle: { fontSize: fontSizes.md, fontWeight: '700', color: c.text.primary },
    emptyText: { fontSize: fontSizes.xs, color: c.text.muted, textAlign: 'center', paddingHorizontal: 20 },
  });
}

/**
 * Embeddable list part — search box + paginated community rows + Feed option.
 * Works both inside the modal wrapper and embedded in the repost sheet.
 */
export function AudiencePickerList({
  selectedId,
  onSelect,
  feedLabel,
  feedMeta,
  feedIcon = 'globe-outline',
  height,
}: AudienceListProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();

  // Debounced search — refetches the server with the term so results are
  // correct even when the user is in 1,000+ communities (not just page 1).
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useJoinedCommunities(search);
  const communities = (query.data?.pages || [])
    .flatMap((p: any) => p.items);

  const isEmptySearch = search.length > 0 && communities.length === 0 && !query.isFetching;

  return (
    <View style={{ flex: 1, height: height ?? undefined }}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.text.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your communities…"
          placeholderTextColor={colors.text.muted}
          value={searchInput}
          onChangeText={setSearchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchInput.length > 0 && (
          <TouchableOpacity onPress={() => setSearchInput('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={communities}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <TouchableOpacity
            style={[styles.option, selectedId === null && styles.optionActive]}
            onPress={() => onSelect(null)}
            activeOpacity={0.7}
          >
            <View style={styles.optionIcon}>
              <Ionicons name={feedIcon as any} size={20} color={selectedId === null ? colors.primaryLight : colors.text.secondary} />
            </View>
            <View style={styles.optionInfo}>
              <Text style={[styles.optionName, selectedId === null && { color: colors.primaryLight }]}>
                {feedLabel} (Feed)
              </Text>
              <Text style={styles.optionMeta}>{feedMeta}</Text>
            </View>
            {selectedId === null && (
              <Ionicons name="checkmark-circle" size={20} color={colors.primaryLight} style={styles.check} />
            )}
          </TouchableOpacity>
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          query.isFetching ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : isEmptySearch ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyTitle}>No communities found</Text>
              <Text style={styles.emptyText}>No communities match "{search}". Try a different name.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>👥</Text>
              <Text style={styles.emptyTitle}>No communities yet</Text>
              <Text style={styles.emptyText}>You haven't joined any communities yet. Join one to post to it.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const active = selectedId === item.id;
          return (
            <TouchableOpacity
              style={[styles.option, active && styles.optionActive]}
              onPress={() => onSelect(item.id, item)}
              activeOpacity={0.7}
            >
              <View style={styles.optionIcon}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={styles.optionAvatar}>{item.avatar || '👥'}</Text>
                )}
              </View>
              <View style={styles.optionInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={[styles.optionName, active && { color: colors.primaryLight }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.privacy === 'private' && (
                    <Ionicons name="lock-closed" size={11} color={colors.text.muted} />
                  )}
                </View>
                <Text style={styles.optionMeta} numberOfLines={1}>
                  {(item.memberCount || 0).toLocaleString()} members · {item.privacy === 'private' ? 'Private' : 'Public'}
                  {item.category ? ` · ${item.category}` : ''}
                </Text>
              </View>
              {active && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primaryLight} style={styles.check} />
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

/**
 * Bottom-sheet "Select Audience" modal — used by create post. The searchable,
 * paginated list is shared with the repost sheet via AudiencePickerList.
 */
export default function AudiencePicker({
  visible,
  onClose,
  selectedId,
  onSelect,
  feedLabel,
  feedMeta,
  feedIcon,
  title = 'Select Audience',
}: ModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.dragHandle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          {/* key forces a fresh list (search cleared) each time it opens */}
          <AudiencePickerList
            key={visible ? 'open' : 'closed'}
            selectedId={selectedId}
            onSelect={onSelect}
            feedLabel={feedLabel}
            feedMeta={feedMeta}
            feedIcon={feedIcon}
          />
        </View>
      </View>
    </Modal>
  );
}
