const LEADERBOARD: any[] = [];
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, Modal, KeyboardAvoidingView,
  Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
// removed mockData import
import { useCommunities } from '../../context/CommunityContext';
import type { Community, CommunityStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<CommunityStackParamList, 'CommunityList'>;

const BANNER_COLORS: Record<string, [string, string]> = {
  Tech:      ['#1a0a3e', '#0a1f3e'],
  Lifestyle: ['#0a2e1a', '#0a3e1f'],
  Gaming:    ['#2e1a0a', '#3e1a0a'],
  Startup:   ['#1a1a0a', '#2e2e0a'],
  Creative:  ['#1a0a2e', '#2e0a3e'],
  Study:     ['#0a2e3e', '#0a3e4e'],
  All:       ['#0a0a1a', '#1a1a2e'],
};

const AVATAR_COLORS: Record<string, [string, string]> = {
  Tech:      ['#7C3AED', '#0891B2'],
  Lifestyle: ['#10B981', '#065F46'],
  Gaming:    ['#F97316', '#B45309'],
  Startup:   ['#FBBF24', '#B45309'],
  Creative:  ['#EC4899', '#9D174D'],
  Study:     ['#06B6D4', '#0891B2'],
  All:       ['#7C3AED', '#4C1D95'],
};

const CATEGORY_TABS = [
  { label: '🔥 All',       key: 'All'      },
  { label: '✅ Joined',    key: 'Joined'   },
  { label: '💻 Tech',      key: 'Tech'     },
  { label: '🎮 Gaming',    key: 'Gaming'   },
  { label: '🎓 Lifestyle', key: 'Lifestyle'},
  { label: '🚀 Startups',  key: 'Startup'  },
  { label: '🎨 Creative',  key: 'Creative' },
  { label: '📚 Study',     key: 'Study'    },
];

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.xl, paddingTop: 12, paddingBottom: 8,
    },
    title:    { fontSize: fontSizes.xxl, fontWeight: '800', color: c.text.primary },
    subtitle: { fontSize: fontSizes.xs,  color: c.primaryLight, fontWeight: '600', marginTop: 2 },
    createBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: 'rgba(124,58,237,0.15)',
      borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)',
      alignItems: 'center', justifyContent: 'center',
    },

    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: spacing.xl, marginBottom: spacing.sm,
      backgroundColor: c.bg.card,
      borderWidth: 1, borderColor: c.border,
      borderRadius: radii.md, paddingHorizontal: 14, height: 44,
    },
    searchInput: { flex: 1, fontSize: fontSizes.sm, color: c.text.primary },

    chips: { paddingHorizontal: spacing.lg, gap: 8, paddingBottom: spacing.sm },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingVertical: 6, paddingHorizontal: 14,
      borderRadius: radii.full, borderWidth: 1, borderColor: c.borderHover,
    },
    chipActive:     { backgroundColor: 'rgba(124,58,237,0.18)', borderColor: c.primary },
    chipText:       { fontSize: fontSizes.xs, color: c.text.secondary, fontWeight: '600' },
    chipTextActive: { color: c.primaryLight },
    joinedBadge: {
      backgroundColor: c.primary,
      width: 16, height: 16, borderRadius: 8,
      alignItems: 'center', justifyContent: 'center',
    },
    joinedBadgeText: { fontSize: 9, color: '#fff', fontWeight: '800' },

    sectionLabel: {
      fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '700',
      textTransform: 'uppercase', letterSpacing: 0.1,
      paddingHorizontal: spacing.xl, marginBottom: 10, marginTop: 4,
    },

    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyEmoji: { fontSize: 40, marginBottom: 10 },
    emptyTitle: { fontSize: fontSizes.md, fontWeight: '700', color: c.text.primary, marginBottom: 6 },
    emptyDesc:  { fontSize: fontSizes.sm, color: c.text.muted, textAlign: 'center', paddingHorizontal: 32 },
    emptyBtn: {
      marginTop: 18, backgroundColor: c.primary,
      paddingHorizontal: 24, paddingVertical: 10, borderRadius: radii.full,
    },
    emptyBtnText: { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },

    commCard: {
      marginHorizontal: spacing.lg, marginBottom: 10,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden',
    },
    commBanner: {
      height: 60, flexDirection: 'row', alignItems: 'flex-end',
      justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 6,
    },
    privateBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.full,
    },
    privateBadgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },
    commBody: { padding: 14, paddingTop: 0, flexDirection: 'row', gap: 10, marginTop: -22 },
    commAvatar: {
      width: 48, height: 48, borderRadius: radii.sm,
      borderWidth: 3, borderColor: c.bg.card,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    commInfo: { flex: 1, paddingTop: 22 },
    commNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
    commName: { fontSize: fontSizes.md, fontWeight: '800', color: c.text.primary },
    joinedBadgeInCard: {
      backgroundColor: 'rgba(16,185,129,0.15)',
      borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
      paddingHorizontal: 6, paddingVertical: 1, borderRadius: radii.full,
    },
    joinedBadgeInCardText: { fontSize: 9, color: '#10B981', fontWeight: '700' },
    commDesc:    { fontSize: fontSizes.xs, color: c.text.muted, marginBottom: 8, lineHeight: 16 },
    commFoot:    { flexDirection: 'row', alignItems: 'center' },
    commMembers: { flex: 1, fontSize: fontSizes.xs, color: c.text.muted },
    joinBtn: {
      backgroundColor: c.primary,
      paddingVertical: 5, paddingHorizontal: 14, borderRadius: radii.full,
    },
    joinBtnJoined: {
      backgroundColor: 'rgba(239,68,68,0.1)',
      borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    },
    joinBtnText:       { fontSize: fontSizes.xs, fontWeight: '700', color: '#fff' },
    joinBtnTextJoined: { color: '#EF4444' },

    lbCard: {
      marginHorizontal: spacing.lg, marginBottom: 10,
      backgroundColor: c.bg.card,
      borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden',
    },
    lbHeader: {
      paddingVertical: 12, paddingHorizontal: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    lbTitle:  { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.primary },
    lbSeeAll: { fontSize: fontSizes.xs, color: c.primaryLight },
    lbRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 14, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    rankNum:    { fontSize: fontSizes.md, fontWeight: '800', width: 24, textAlign: 'center' },
    rankAvatar: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: c.bg.elevated,
      alignItems: 'center', justifyContent: 'center',
    },
    rankName: { flex: 1, fontSize: fontSizes.sm, color: c.text.primary },
    rankXP:   { fontSize: fontSizes.sm, fontWeight: '700', color: c.xpGold },

    modalContainer: { flex: 1, backgroundColor: c.bg.base },
    modalHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    modalTitle:  { fontSize: fontSizes.lg, fontWeight: '700', color: c.text.primary },
    modalContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },

    createSubmitBtn:  { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radii.full },
    createSubmitText: { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },
    fieldLabel: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.secondary },
    required:   { color: c.danger },
    fieldInput: {
      backgroundColor: c.bg.card,
      borderWidth: 1, borderColor: c.border,
      borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: fontSizes.md, color: c.text.primary,
    },
    fieldInputMulti: { height: 88, paddingTop: 12 },

    emojiRow:        { gap: 10, paddingBottom: 4 },
    emojiOption: {
      width: 48, height: 48, borderRadius: radii.md,
      backgroundColor: c.bg.card,
      borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },
    emojiOptionActive: { borderColor: c.primaryLight, backgroundColor: 'rgba(124,58,237,0.2)' },

    categoryGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    catChip: {
      paddingVertical: 6, paddingHorizontal: 14,
      borderRadius: radii.full, borderWidth: 1, borderColor: c.border,
      backgroundColor: c.bg.card,
    },
    catChipActive:     { borderColor: c.primaryLight, backgroundColor: 'rgba(124,58,237,0.15)' },
    catChipText:       { fontSize: fontSizes.sm, color: c.text.muted, fontWeight: '600' },
    catChipTextActive: { color: c.primaryLight },

    privacyRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: c.bg.card,
      borderWidth: 1, borderColor: c.border,
      borderRadius: radii.md, padding: spacing.md,
    },
    privacyLeft:  { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    privacyLabel: { fontSize: fontSizes.sm, fontWeight: '600', color: c.text.primary },
    privacyDesc:  { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },
    toggle: {
      width: 44, height: 24, borderRadius: 12,
      backgroundColor: c.bg.elevated,
      borderWidth: 1, borderColor: c.border,
      justifyContent: 'center', paddingHorizontal: 2,
    },
    toggleOn:       { backgroundColor: c.primary, borderColor: c.primaryDark },
    toggleThumb:    { width: 18, height: 18, borderRadius: 9, backgroundColor: c.text.muted },
    toggleThumbOn:  { backgroundColor: '#fff', alignSelf: 'flex-end' },

    lbTabs: {
      flexDirection: 'row',
      marginHorizontal: spacing.lg, marginVertical: spacing.md,
      backgroundColor: c.bg.card,
      borderRadius: radii.md, padding: 4,
    },
    lbTab:          { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radii.sm - 2 },
    lbTabActive:    { backgroundColor: 'rgba(124,58,237,0.25)' },
    lbTabText:      { fontSize: fontSizes.sm, fontWeight: '600', color: c.text.muted },
    lbTabTextActive:{ color: c.primaryLight },
    lbFullRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: spacing.lg, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    lbMedal: { fontSize: 20, width: 28, textAlign: 'center', color: c.text.muted, fontWeight: '800' },
  });
}

const RANK_COLORS_FIXED = ['#FBBF24', '#94A3B8', '#CD7C2F'];

export default function CommunityScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { isDark } = useTheme();
  const colors     = useThemeColors();
  const styles     = useMemo(() => makeStyles(colors), [colors]);
  const { communities, toggleJoin, addCommunity } = useCommunities();

  const [search,          setSearch]          = useState('');
  const [activeCategory,  setActiveCategory]  = useState('All');
  const [showCreate,      setShowCreate]       = useState(false);
  const [showLeaderboard, setShowLeaderboard]  = useState(false);

  const filtered = communities.filter(c => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());
    const matchCat =
      activeCategory === 'All'    ? true :
      activeCategory === 'Joined' ? c.isJoined :
      c.category === activeCategory;
    return matchSearch && matchCat;
  });

  const joinedCount = communities.filter(c => c.isJoined).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Communities</Text>
          {joinedCount > 0 && (
            <Text style={styles.subtitle}>Joined {joinedCount} {joinedCount === 1 ? 'community' : 'communities'}</Text>
          )}
        </View>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={20} color={colors.primaryLight} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.text.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search communities..."
          placeholderTextColor={colors.text.muted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={colors.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CATEGORY_TABS.map(cat => {
          const isJoinedTab = cat.key === 'Joined';
          return (
            <TouchableOpacity
              key={cat.key}
              style={[styles.chip, activeCategory === cat.key && styles.chipActive]}
              onPress={() => setActiveCategory(cat.key)}
            >
              <Text style={[styles.chipText, activeCategory === cat.key && styles.chipTextActive]}>
                {cat.label}
              </Text>
              {isJoinedTab && joinedCount > 0 && (
                <View style={styles.joinedBadge}>
                  <Text style={styles.joinedBadgeText}>{joinedCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>
          {activeCategory === 'All'    ? 'Discover Communities 🔥'  :
           activeCategory === 'Joined' ? 'Your Communities ✅'       :
           `${activeCategory} Communities`}
        </Text>

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>
              {activeCategory === 'Joined' ? '👥' : '🔍'}
            </Text>
            <Text style={styles.emptyTitle}>
              {activeCategory === 'Joined' ? "You haven't joined any communities" : 'No communities found'}
            </Text>
            <Text style={styles.emptyDesc}>
              {activeCategory === 'Joined'
                ? 'Join communities to see them here'
                : 'Try a different search or category'}
            </Text>
            {activeCategory === 'Joined' && (
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setActiveCategory('All')}>
                <Text style={styles.emptyBtnText}>Browse Communities</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filtered.map(c => (
            <CommunityCard
              key={c.id}
              community={c}
              styles={styles}
              onPress={() => navigation.navigate('CommunityDetail', { communityId: c.id })}
              onToggleJoin={toggleJoin}
            />
          ))
        )}

        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Weekly Leaderboard 🏆</Text>
        <View style={styles.lbCard}>
          <LinearGradient
            colors={['rgba(124,58,237,0.18)', 'rgba(6,182,212,0.08)']}
            style={styles.lbHeader}
          >
            <Text style={styles.lbTitle}>🏆 Top Members This Week</Text>
            <TouchableOpacity onPress={() => setShowLeaderboard(true)}>
              <Text style={styles.lbSeeAll}>See all →</Text>
            </TouchableOpacity>
          </LinearGradient>
          {LEADERBOARD.slice(0, 5).map((entry, i) => (
            <View
              key={entry.rank}
              style={[styles.lbRow, i === 4 && { borderBottomWidth: 0 }]}
            >
              <Text style={[styles.rankNum, { color: RANK_COLORS_FIXED[i] ?? colors.text.muted }]}>
                {entry.rank}
              </Text>
              <View style={styles.rankAvatar}>
                <Text style={{ fontSize: 16 }}>{entry.avatar}</Text>
              </View>
              <Text style={styles.rankName}>{entry.user}</Text>
              <Text style={styles.rankXP}>⚡ {entry.xp.toLocaleString()}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <CreateCommunityModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={addCommunity}
        styles={styles}
        colors={colors}
      />
      <LeaderboardModal
        visible={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        styles={styles}
        colors={colors}
      />
    </View>
  );
}

function CommunityCard({
  community: c, onPress, onToggleJoin, styles,
}: {
  community:   Community;
  onPress:     () => void;
  onToggleJoin:(id: string) => void;
  styles:      ReturnType<typeof makeStyles>;
}) {
  const gradient = BANNER_COLORS[c.category] ?? BANNER_COLORS.All;
  const avGrad   = AVATAR_COLORS[c.category] ?? AVATAR_COLORS.All;
  return (
    <TouchableOpacity style={styles.commCard} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient colors={gradient} style={styles.commBanner}>
        <Text style={{ fontSize: 22 }}>{c.banner}</Text>
        {c.isPrivate && (
          <View style={styles.privateBadge}>
            <Ionicons name="lock-closed" size={10} color="#fff" />
            <Text style={styles.privateBadgeText}>Private</Text>
          </View>
        )}
      </LinearGradient>
      <View style={styles.commBody}>
        <LinearGradient colors={avGrad} style={styles.commAvatar}>
          <Text style={{ fontSize: 22 }}>{c.avatar}</Text>
        </LinearGradient>
        <View style={styles.commInfo}>
          <View style={styles.commNameRow}>
            <Text style={styles.commName}>{c.name}</Text>
            {c.isJoined && (
              <View style={styles.joinedBadgeInCard}>
                <Text style={styles.joinedBadgeInCardText}>✓ Joined</Text>
              </View>
            )}
          </View>
          <Text style={styles.commDesc} numberOfLines={2}>{c.description}</Text>
          <View style={styles.commFoot}>
            <Text style={styles.commMembers}>
              🟢 {(c.members / 1000).toFixed(1)}k members
            </Text>
            <TouchableOpacity
              style={[styles.joinBtn, c.isJoined && styles.joinBtnJoined]}
              onPress={(e) => { e.stopPropagation?.(); onToggleJoin(c.id); }}
              activeOpacity={0.75}
            >
              <Text style={[styles.joinBtnText, c.isJoined && styles.joinBtnTextJoined]}>
                {c.isJoined ? 'Leave' : 'Join'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const COMMUNITY_CATEGORIES = ['Tech', 'Gaming', 'Lifestyle', 'Startup', 'Creative', 'Study'];
const EMOJI_OPTIONS = ['🚀','⚡','🎮','🎨','🔥','🌟','💡','🏆','🎓','🦄','🌐','⚙️','🎯','🧠','🌍','🎵'];

function CreateCommunityModal({
  visible, onClose, onCreate, styles, colors,
}: {
  visible:  boolean;
  onClose:  () => void;
  onCreate: (c: Community) => void;
  styles:   ReturnType<typeof makeStyles>;
  colors:   ColorPalette;
}) {
  const insets = useSafeAreaInsets();
  const [name,      setName]      = useState('');
  const [desc,      setDesc]      = useState('');
  const [category,  setCategory]  = useState('Tech');
  const [avatar,    setAvatar]    = useState('🚀');
  const [isPrivate, setIsPrivate] = useState(false);

  const reset = () => {
    setName(''); setDesc(''); setCategory('Tech'); setAvatar('🚀'); setIsPrivate(false);
  };

  const handleCreate = () => {
    if (!name.trim()) { Alert.alert('Name required', 'Please enter a community name.'); return; }
    if (!desc.trim()) { Alert.alert('Description required', 'Please add a short description.'); return; }
    const newComm: Community = {
      id:          `c_${Date.now()}`,
      name:        name.trim(),
      description: desc.trim(),
      banner:      avatar,
      avatar,
      members:     1,
      isJoined:    true,
      isPrivate,
      category,
    };
    onCreate(newComm);
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => { reset(); onClose(); }}
    >
      <KeyboardAvoidingView
        style={[styles.modalContainer, { paddingTop: insets.top || 16 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Create Community</Text>
          <TouchableOpacity onPress={handleCreate}>
            <LinearGradient
              colors={[colors.primary, colors.cyanDark]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.createSubmitBtn}
            >
              <Text style={styles.createSubmitText}>Create</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Icon</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiRow}>
            {EMOJI_OPTIONS.map(em => (
              <TouchableOpacity
                key={em}
                style={[styles.emojiOption, avatar === em && styles.emojiOptionActive]}
                onPress={() => setAvatar(em)}
              >
                <Text style={{ fontSize: 24 }}>{em}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.fieldLabel}>
            Name <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="e.g. Campus Coders"
            placeholderTextColor={colors.text.muted}
            value={name}
            onChangeText={setName}
            maxLength={40}
          />

          <Text style={styles.fieldLabel}>
            Description <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldInputMulti]}
            placeholder="What is this community about?"
            placeholderTextColor={colors.text.muted}
            multiline
            value={desc}
            onChangeText={setDesc}
            maxLength={200}
            textAlignVertical="top"
          />

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {COMMUNITY_CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.catChip, category === cat && styles.catChipActive]}
                onPress={() => setCategory(cat)}
              >
                <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.privacyRow}
            onPress={() => setIsPrivate(v => !v)}
            activeOpacity={0.8}
          >
            <View style={styles.privacyLeft}>
              <Ionicons
                name={isPrivate ? 'lock-closed' : 'globe-outline'}
                size={20}
                color={isPrivate ? colors.primaryLight : colors.text.muted}
              />
              <View>
                <Text style={styles.privacyLabel}>
                  {isPrivate ? 'Private Community' : 'Public Community'}
                </Text>
                <Text style={styles.privacyDesc}>
                  {isPrivate
                    ? 'Only approved members can join and post'
                    : 'Anyone can find and join this community'}
                </Text>
              </View>
            </View>
            <View style={[styles.toggle, isPrivate && styles.toggleOn]}>
              <View style={[styles.toggleThumb, isPrivate && styles.toggleThumbOn]} />
            </View>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LeaderboardModal({
  visible, onClose, styles, colors,
}: {
  visible: boolean;
  onClose: () => void;
  styles:  ReturnType<typeof makeStyles>;
  colors:  ColorPalette;
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'xp' | 'posts'>('xp');
  const postBoard = [...LEADERBOARD].map((e, i) => ({ ...e, rank: i + 1, xp: Math.round(e.xp / 10) }));
  const board = tab === 'xp' ? LEADERBOARD : postBoard;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalContainer, { paddingTop: insets.top || 16 }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>🏆 Leaderboard</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.lbTabs}>
          {(['xp', 'posts'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.lbTab, tab === t && styles.lbTabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.lbTabText, tab === t && styles.lbTabTextActive]}>
                {t === 'xp' ? '⚡ XP Earned' : '📝 Posts Made'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {board.map((entry, i) => (
            <View key={`${entry.rank}-${tab}`} style={styles.lbFullRow}>
              <Text style={styles.lbMedal}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${entry.rank}`}
              </Text>
              <View style={styles.rankAvatar}>
                <Text style={{ fontSize: 18 }}>{entry.avatar}</Text>
              </View>
              <Text style={styles.rankName}>{entry.user}</Text>
              <Text style={styles.rankXP}>
                {tab === 'xp' ? `⚡ ${entry.xp.toLocaleString()}` : `📝 ${entry.xp}`}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
