import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, KeyboardAvoidingView, Platform,
  Image, Dimensions, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, fontSizes, spacing, radii } from '../../theme';
import { useAuth } from '../../context/AuthContext';
// removed mockData import
import { usePosts }        from '../../context/PostsContext';
import { useCommunities }  from '../../context/CommunityContext';
import type { Post } from '../../types';

const SCREEN_W = Dimensions.get('window').width;

interface Props {
  visible: boolean;
  onClose: () => void;
  preselectedCommunityId?: string; // pre-fill when opened from a community detail page
}

type MediaType = 'photo' | 'video' | 'gif';
type AspectRatio = '1:1' | '16:9';

const RATIO_DIMS: Record<AspectRatio, { width: number; height: number }> = {
  '1:1':  { width: 1, height: 1  },
  '16:9': { width: 16, height: 9 },
};

export default function CreatePostModal({ visible, onClose, preselectedCommunityId }: Props) {
  const { user: CURRENT_USER } = useAuth();
  const insets = useSafeAreaInsets();
  const { addPost } = usePosts();
  const { communities } = useCommunities();

  const [content, setContent]           = useState('');
  const [hashtagInput, setHashtagInput] = useState('');
  const [hashtags, setHashtags]         = useState<string[]>([]);
  const [postType, setPostType]         = useState<'feed' | 'community'>(
    preselectedCommunityId ? 'community' : 'feed'
  );
  const [selectedComId, setSelComId]    = useState<string | null>(preselectedCommunityId ?? null);
  const [showPicker, setShowPicker]     = useState(false);

  // Media state
  const [mediaUri, setMediaUri]           = useState<string | null>(null);
  const [mediaKind, setMediaKind]         = useState<MediaType | null>(null);
  const [aspectRatio, setAspectRatio]     = useState<AspectRatio>('1:1');
  const [pickLoading, setPickLoading]     = useState(false);

  const joinedCommunities = communities.filter(c => c.isJoined);
  const selectedComm      = joinedCommunities.find(c => c.id === selectedComId);
  const canPost           = content.trim().length > 0;

  // ── Media picker ────────────────────────────────────────────────
  const pickMedia = async (kind: MediaType) => {
    setPickLoading(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to your media library to upload photos and videos.');
        setPickLoading(false);
        return;
      }

      const isVideo = kind === 'video';
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: isVideo
          ? ImagePicker.MediaTypeOptions.Videos
          : ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });

      if (!result.canceled && result.assets.length > 0) {
        setMediaUri(result.assets[0].uri);
        setMediaKind(kind);
      }
    } catch {
      Alert.alert('Error', 'Could not open media library. Try again.');
    }
    setPickLoading(false);
  };

  const removeMedia = () => {
    setMediaUri(null);
    setMediaKind(null);
  };

  // ── Hashtag helpers ─────────────────────────────────────────────
  const addHashtag = () => {
    const tag = hashtagInput.trim().replace(/^#+/, '');
    if (tag && !hashtags.includes(`#${tag}`)) {
      setHashtags(prev => [...prev, `#${tag}`]);
    }
    setHashtagInput('');
  };

  // ── Submit ──────────────────────────────────────────────────────
  const resetAndClose = () => {
    setContent('');
    setHashtags([]);
    setHashtagInput('');
    setMediaUri(null);
    setMediaKind(null);
    setAspectRatio('1:1');
    setPostType(preselectedCommunityId ? 'community' : 'feed');
    setSelComId(preselectedCommunityId ?? null);
    setShowPicker(false);
    onClose();
  };

  const handlePost = () => {
    const newPost: Post = {
      id:              `post_${Date.now()}`,
      author:          CURRENT_USER,
      community:       selectedComm ? selectedComm.name : 'r/Feed',
      content:         content.trim(),
      hashtags,
      mediaUri:        mediaUri ?? undefined,
      mediaAspectRatio: mediaUri ? aspectRatio : undefined,
      likes:    0,
      comments: 0,
      shares:   0,
      xpEarned: 10,
      createdAt: 'Just now',
      isLiked:  false,
      isSaved:  false,
      type: mediaKind === 'video' ? 'video' : mediaUri ? 'image' : 'text',
    };
    addPost(newPost);
    resetAndClose();
  };

  // ── Computed media preview height ────────────────────────────────
  const previewW = SCREEN_W - spacing.lg * 2 - 32; // modal horizontal padding
  const { width: rW, height: rH } = RATIO_DIMS[aspectRatio];
  const previewH = (previewW / rW) * rH;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={resetAndClose}
    >
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top || 16 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Post</Text>
          <TouchableOpacity onPress={handlePost} disabled={!canPost}>
            <LinearGradient
              colors={canPost ? [colors.primary, colors.cyanDark] : [colors.bg.elevated, colors.bg.elevated]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.postBtn}
            >
              <Text style={[styles.postBtnText, !canPost && styles.postBtnTextDisabled]}>Post</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── User + destination ── */}
          <View style={styles.userRow}>
            <View style={styles.avatarBubble}>
              <Text style={styles.avatarText}>{CURRENT_USER?.avatarUrl ? null : '👾'}</Text>
            </View>
            <View style={styles.userMeta}>
              <Text style={styles.userName}>{(CURRENT_USER?.name || 'Taddle User')}</Text>
              <View style={styles.postTypeRow}>
                <TouchableOpacity
                  style={[styles.typePill, postType === 'feed' && styles.typePillActive]}
                  onPress={() => { setPostType('feed'); setSelComId(null); }}
                >
                  <Ionicons name="globe-outline" size={11}
                    color={postType === 'feed' ? colors.primaryLight : colors.text.muted} />
                  <Text style={[styles.typePillText, postType === 'feed' && styles.typePillTextActive]}>Feed</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.typePill, postType === 'community' && styles.typePillActive]}
                  onPress={() => { setPostType('community'); setShowPicker(true); }}
                >
                  <Ionicons name="people-outline" size={11}
                    color={postType === 'community' ? colors.primaryLight : colors.text.muted} />
                  <Text style={[styles.typePillText, postType === 'community' && styles.typePillTextActive]}>
                    {selectedComm ? selectedComm.name : 'Community'}
                  </Text>
                  <Ionicons name="chevron-down" size={11}
                    color={postType === 'community' ? colors.primaryLight : colors.text.muted} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── Content ── */}
          <TextInput
            style={styles.contentInput}
            placeholder="What's on your mind? Share your thoughts..."
            placeholderTextColor={colors.text.muted}
            multiline
            value={content}
            onChangeText={setContent}
            maxLength={500}
            autoFocus
            textAlignVertical="top"
          />
          <Text style={[styles.charCount, content.length > 450 && styles.charCountWarn]}>
            {content.length}/500
          </Text>

          {/* ── Media section ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Media <Text style={styles.optionalLabel}>(optional)</Text>
            </Text>

            {/* Media type buttons */}
            {!mediaUri && (
              <View style={styles.mediaRow}>
                {([
                  { kind: 'photo' as MediaType, icon: 'image-outline',    label: 'Photo' },
                  { kind: 'video' as MediaType, icon: 'videocam-outline', label: 'Video' },
                  { kind: 'gif'   as MediaType, icon: 'film-outline',     label: 'GIF'   },
                ]).map(({ kind, icon, label }) => (
                  <TouchableOpacity
                    key={kind}
                    style={[styles.mediaBtn, pickLoading && { opacity: 0.5 }]}
                    onPress={() => pickMedia(kind)}
                    disabled={pickLoading}
                  >
                    <Ionicons name={icon as any} size={22} color={colors.text.muted} />
                    <Text style={styles.mediaBtnLabel}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Media preview + ratio selector */}
            {mediaUri && (
              <View style={styles.previewWrapper}>
                {/* Ratio toggle */}
                <View style={styles.ratioRow}>
                  <Text style={styles.ratioLabel}>Aspect ratio</Text>
                  <View style={styles.ratioToggle}>
                    {(['1:1', '16:9'] as AspectRatio[]).map(r => (
                      <TouchableOpacity
                        key={r}
                        style={[styles.ratioPill, aspectRatio === r && styles.ratioPillActive]}
                        onPress={() => setAspectRatio(r)}
                      >
                        <Text style={[styles.ratioPillText, aspectRatio === r && styles.ratioPillTextActive]}>
                          {r}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Preview */}
                <View style={[styles.previewBox, { width: previewW, height: previewH }]}>
                  <Image
                    source={{ uri: mediaUri }}
                    style={{ width: previewW, height: previewH }}
                    resizeMode="cover"
                  />
                  {/* Remove button */}
                  <TouchableOpacity style={styles.removeMedia} onPress={removeMedia}>
                    <View style={styles.removeMediaInner}>
                      <Ionicons name="close" size={16} color="#fff" />
                    </View>
                  </TouchableOpacity>

                  {/* Replace button */}
                  <TouchableOpacity style={styles.replaceMedia} onPress={() => pickMedia(mediaKind!)}>
                    <View style={styles.replaceMediaInner}>
                      <Ionicons name="swap-horizontal" size={14} color="#fff" />
                      <Text style={styles.replaceText}>Replace</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* ── Hashtags ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Hashtags</Text>

            {hashtags.length > 0 && (
              <View style={styles.hashtagChips}>
                {hashtags.map(tag => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.hashChip}
                    onPress={() => setHashtags(prev => prev.filter(t => t !== tag))}
                  >
                    <Text style={styles.hashChipText}>{tag}</Text>
                    <Ionicons name="close-circle" size={13} color={colors.primaryLight} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.hashInputRow}>
              <Text style={styles.hashPrefix}>#</Text>
              <TextInput
                style={styles.hashInput}
                placeholder="add a tag"
                placeholderTextColor={colors.text.muted}
                value={hashtagInput}
                onChangeText={setHashtagInput}
                onSubmitEditing={addHashtag}
                returnKeyType="done"
                autoCapitalize="none"
                blurOnSubmit={false}
              />
              <TouchableOpacity onPress={addHashtag} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="add-circle" size={24} color={colors.primaryLight} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Community picker ── */}
          {showPicker && (
            <View style={styles.communitySheet}>
              <View style={styles.communitySheetHeader}>
                <Text style={styles.communitySheetTitle}>Post to Community</Text>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Ionicons name="close" size={20} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>

              {joinedCommunities.length === 0 ? (
                <View style={styles.emptyComm}>
                  <Text style={styles.emptyCommText}>You haven't joined any communities yet.</Text>
                </View>
              ) : (
                joinedCommunities.map(comm => {
                  const active = selectedComId === comm.id;
                  return (
                    <TouchableOpacity
                      key={comm.id}
                      style={[styles.communityOption, active && styles.communityOptionActive]}
                      onPress={() => { setSelComId(comm.id); setShowPicker(false); }}
                    >
                      <Text style={styles.communityAvatar}>{comm.avatar}</Text>
                      <View style={styles.communityInfo}>
                        <Text style={styles.communityName}>{comm.name}</Text>
                        <Text style={styles.communityMeta}>
                          {comm.members.toLocaleString()} members · {comm.category}
                        </Text>
                      </View>
                      {active && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.primaryLight} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.base },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  closeBtn:         { padding: 4 },
  headerTitle:      { fontSize: fontSizes.lg, fontWeight: '700', color: colors.text.primary },
  postBtn:          { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radii.full },
  postBtnText:      { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },
  postBtnTextDisabled: { color: colors.text.muted },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 40 },

  // User row
  userRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.md,
  },
  avatarBubble: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.bg.elevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.primaryDark,
  },
  avatarText: { fontSize: 22 },
  userMeta:   { flex: 1, gap: 6 },
  userName:   { fontSize: fontSizes.md, fontWeight: '700', color: colors.text.primary },
  postTypeRow: { flexDirection: 'row', gap: 8 },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radii.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bg.surface,
  },
  typePillActive:     { borderColor: colors.primaryLight, backgroundColor: 'rgba(124,58,237,0.12)' },
  typePillText:       { fontSize: fontSizes.xs, fontWeight: '600', color: colors.text.muted },
  typePillTextActive: { color: colors.primaryLight },

  // Content
  contentInput: {
    fontSize: fontSizes.md, color: colors.text.primary,
    lineHeight: 22, minHeight: 100, paddingTop: 0,
  },
  charCount:     { alignSelf: 'flex-end', fontSize: fontSizes.xs, color: colors.text.muted, marginBottom: spacing.md },
  charCountWarn: { color: colors.warning },

  // Sections
  section: {
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing.md, marginTop: spacing.sm, gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: fontSizes.sm, fontWeight: '700', color: colors.text.secondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  optionalLabel: { color: colors.text.muted, fontWeight: '400', textTransform: 'none' },

  // Media type buttons (before pick)
  mediaRow:      { flexDirection: 'row', gap: 10 },
  mediaBtn: {
    flex: 1, alignItems: 'center', gap: 5,
    paddingVertical: spacing.md,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bg.surface,
  },
  mediaBtnLabel: { fontSize: fontSizes.xs, fontWeight: '600', color: colors.text.muted },

  // Media preview
  previewWrapper: { gap: 10 },
  ratioRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ratioLabel: { fontSize: fontSizes.sm, color: colors.text.secondary, fontWeight: '600' },
  ratioToggle: { flexDirection: 'row', gap: 6 },
  ratioPill: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: radii.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bg.surface,
  },
  ratioPillActive:    { borderColor: colors.primaryLight, backgroundColor: 'rgba(124,58,237,0.14)' },
  ratioPillText:      { fontSize: fontSizes.xs, fontWeight: '600', color: colors.text.muted },
  ratioPillTextActive: { color: colors.primaryLight },

  previewBox:   { borderRadius: radii.md, overflow: 'hidden', position: 'relative' },
  removeMedia: {
    position: 'absolute', top: 8, right: 8,
  },
  removeMediaInner: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  replaceMedia: { position: 'absolute', bottom: 8, right: 8 },
  replaceMediaInner: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radii.full,
  },
  replaceText: { fontSize: fontSizes.xs, color: '#fff', fontWeight: '600' },

  // Hashtags
  hashtagChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hashChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radii.full,
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderWidth: 1, borderColor: colors.primaryDark,
  },
  hashChipText: { fontSize: fontSizes.sm, color: colors.primaryLight, fontWeight: '600' },
  hashInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.bg.surface,
    borderRadius: radii.md, paddingHorizontal: spacing.md,
    paddingVertical: 10, borderWidth: 1, borderColor: colors.border,
  },
  hashPrefix: { fontSize: fontSizes.md, fontWeight: '700', color: colors.primaryLight },
  hashInput:  { flex: 1, fontSize: fontSizes.md, color: colors.text.primary, paddingVertical: 0 },

  // Community picker
  communitySheet: {
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing.md, marginTop: spacing.sm, gap: spacing.sm,
  },
  communitySheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4,
  },
  communitySheetTitle: { fontSize: fontSizes.md, fontWeight: '700', color: colors.text.primary },
  communityOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bg.surface,
  },
  communityOptionActive: { borderColor: colors.primaryLight, backgroundColor: 'rgba(124,58,237,0.10)' },
  communityAvatar: { fontSize: 28 },
  communityInfo:   { flex: 1 },
  communityName:   { fontSize: fontSizes.md, fontWeight: '600', color: colors.text.primary },
  communityMeta:   { fontSize: fontSizes.sm, color: colors.text.muted, marginTop: 2 },
  emptyComm:       { padding: spacing.lg, alignItems: 'center' },
  emptyCommText:   { fontSize: fontSizes.sm, color: colors.text.muted, textAlign: 'center' },
});
