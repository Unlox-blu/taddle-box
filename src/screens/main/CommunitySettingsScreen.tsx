import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';

import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useThemeColors, useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { communityService } from '../../services/community.service';
import { mediaService } from '../../services/media.service';
import { nativeBypass } from '../../utils/nativeBypass';
import type { CommunityStackParamList } from '../../types';
import { themedAlert } from '../../components/common/ThemedAlert';
import SmartInput from '../../components/common/SmartInput';
import StateBlock from '../../components/common/StateBlock';

type Route = RouteProp<CommunityStackParamList, 'CommunitySettings'>;

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    headerTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: c.text.primary },
    headerBtn: { fontSize: fontSizes.md, fontWeight: '700', color: c.primaryLight },
    content: { padding: spacing.lg, gap: 24, paddingBottom: 100 },

    sectionTitle: { fontSize: fontSizes.md, fontWeight: '800', color: c.text.primary, marginBottom: 12 },

    bannerWrap: {
      width: '100%', height: 120, borderRadius: radii.xl,
      backgroundColor: c.bg.elevated, borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    avatarWrap: {
      width: 80, height: 80, borderRadius: radii.xl,
      backgroundColor: c.bg.elevated, borderWidth: 4, borderColor: c.bg.base,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      marginTop: -40, marginLeft: 16,
    },

    inputWrap: { gap: 6 },
    label: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.secondary },
    input: {
      backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border,
      borderRadius: radii.md, paddingHorizontal: 16, paddingVertical: 14,
      fontSize: fontSizes.md, color: c.text.primary,
    },
    inputMulti: { height: 100, paddingTop: 14, textAlignVertical: 'top' },

    rowBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.bg.card, padding: 16, borderRadius: radii.lg,
      borderWidth: 1, borderColor: c.border, marginTop: 12,
    },
    rowBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowBtnText: { fontSize: fontSizes.md, fontWeight: '700', color: c.text.primary },
    deleteBtnText: { fontSize: fontSizes.md, fontWeight: '700', color: c.danger },

    privacyRow: {
      flexDirection: "row", alignItems: "center", gap: spacing.md,
      backgroundColor: c.bg.card, borderRadius: radii.md, padding: 16,
      borderWidth: 1, borderColor: c.border,
    },
    privacyLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 14 },
    privacyLabel: { fontSize: fontSizes.md, fontWeight: "700", color: c.text.primary },
    privacyDesc: { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 4, lineHeight: 18 },
    toggle: {
      width: 48, height: 26, borderRadius: 13,
      backgroundColor: c.borderHover, justifyContent: "center", paddingHorizontal: 2,
    },
    toggleOn: { backgroundColor: c.primary },
    toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff" },
    toggleThumbOn: { alignSelf: "flex-end" },
  });
}

export default function CommunitySettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { communitySlug } = route.params;

  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user: authUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [community, setCommunity] = useState<any>(null);

  // Form State
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [allowReposts, setAllowReposts] = useState(true);
  
  // Media State
  const [avatarAsset, setAvatarAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [bannerAsset, setBannerAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);

  useEffect(() => {
    loadCommunity();
  }, [communitySlug]);

  const loadCommunity = async () => {
    try {
      const res = await communityService.getCommunityDetail(communitySlug);
      const c = res.data;
      setCommunity(c);
      setName(c.name || '');
      setDesc(c.description || '');
      setIsPrivate(c.privacy === 'private');
      setAllowReposts(c.allowReposts ?? true);
    } catch (e) {
      themedAlert('Error', 'Failed to load community details');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async (type: 'avatar' | 'banner') => {
    nativeBypass.beginNativeFlow();
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        themedAlert('Permission needed', 'Allow access to your media library to upload images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: type === 'avatar' ? [1, 1] : [3, 1], // Cropper for avatar and banner
        quality: 0.85,
      });

      if (!result.canceled && result.assets.length > 0) {
        if (type === 'avatar') setAvatarAsset(result.assets[0]);
        else setBannerAsset(result.assets[0]);
      }
    } finally {
      nativeBypass.endNativeFlow();
    }
  };

  const getFileSize = async (asset: ImagePicker.ImagePickerAsset) => {
    if (asset.fileSize) return asset.fileSize;
    const info = await FileSystem.getInfoAsync(asset.uri);
    return info.exists && 'size' in info ? info.size : 1000000;
  };

  const uploadMedia = async (asset: ImagePicker.ImagePickerAsset, type: 'avatar' | 'banner') => {
    const mimeType = asset.mimeType || 'image/jpeg';
    const fileSize = await getFileSize(asset);
    const res = await mediaService.getSignedUrl(
      type === 'avatar' ? 'avatars' : 'banners',
      fileSize,
      mimeType,
      asset.width,
      asset.height,
    );
    await mediaService.uploadFileDirect(res.data.signedUrl!, asset.uri, mimeType);
    await mediaService.confirmUpload(res.data.mediaId, res.data.s3Key!);
    return res.data.mediaId;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      themedAlert('Validation Error', 'Name is required.');
      return;
    }
    setSaving(true);
    try {
      const updates: any = {};
      if (name.trim() !== community.name) updates.name = name.trim();
      if (desc.trim() !== community.description) updates.description = desc.trim();
      if ((isPrivate ? 'private' : 'public') !== community.privacy) updates.privacy = isPrivate ? 'private' : 'public';
      if (allowReposts !== (community.allowReposts ?? true)) updates.allowReposts = allowReposts;

      const tasks: Promise<any>[] = [];
      if (Object.keys(updates).length > 0) {
        tasks.push(communityService.updateCommunity(community.id, updates));
      }

      if (avatarAsset) {
        tasks.push(uploadMedia(avatarAsset, 'avatar').then(mediaId => communityService.updateAvatar(community.id, mediaId)));
      }
      if (bannerAsset) {
        tasks.push(uploadMedia(bannerAsset, 'banner').then(mediaId => communityService.updateBanner(community.id, mediaId)));
      }

      await Promise.all(tasks);
      themedAlert('Saved!', 'Community updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      themedAlert('Error', e.response?.data?.message || 'Failed to update community.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    themedAlert('Delete Community', 'Are you sure you want to permanently delete this community? This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await communityService.deleteCommunity(community.id);
            navigation.navigate('CommunityList');
          } catch (e) {
            themedAlert('Error', 'Failed to delete community');
          }
      }}
    ]);
  };

  if (loading || !community) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StateBlock loading />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} disabled={saving}>
          <Text style={{ fontSize: 16, color: colors.text.secondary }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? <StateBlock inline loading loaderSize={18} /> : <Text style={styles.headerBtn}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <TouchableOpacity style={styles.bannerWrap} onPress={() => pickImage('banner')}>
            {bannerAsset ? (
              <Image source={{ uri: bannerAsset.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (community.bannerUrl || community.banner_url || community.banner) ? (
              <Image source={{ uri: community.bannerUrl || community.banner_url || community.banner }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <Ionicons name="image-outline" size={32} color={colors.text.muted} />
            )}
            <View style={{ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: radii.md }}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.avatarWrap} onPress={() => pickImage('avatar')}>
            {avatarAsset ? (
              <Image source={{ uri: avatarAsset.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (community.avatarUrl || community.avatar_url || community.avatar) ? (
              <Image source={{ uri: community.avatarUrl || community.avatar_url || community.avatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <Ionicons name="people-outline" size={32} color={colors.text.muted} />
            )}
            <View style={{ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: radii.full }}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.inputWrap}>
          <Text style={styles.label}>Community Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Name your community"
            placeholderTextColor={colors.text.muted}
          />
        </View>

        <View style={styles.inputWrap}>
          <Text style={styles.label}>Description</Text>
          {/* @mention / #hashtag suggestions like the profile bio — saved text
              carries the structured {@}/{#} markup the view renders as
              tappable links. */}
          <SmartInput
            value={desc}
            onChange={setDesc}
            placeholder="What is this community about?"
            placeholderTextColor={colors.text.muted}
            multiline
            style={[styles.input, styles.inputMulti, { textAlignVertical: 'top' }]}
          />
        </View>

        <TouchableOpacity
          style={styles.privacyRow}
          activeOpacity={0.8}
          onPress={() => setIsPrivate(!isPrivate)}
        >
          <View style={styles.privacyLeft}>
            <Ionicons name={isPrivate ? "lock-closed" : "earth"} size={22} color={isPrivate ? colors.warning : colors.primaryLight} />
            <View>
              <Text style={styles.privacyLabel}>{isPrivate ? "Private Community" : "Public Community"}</Text>
              <Text style={styles.privacyDesc}>{isPrivate ? "Users must request to join" : "Anyone can view and join"}</Text>
            </View>
          </View>
          <View style={[styles.toggle, isPrivate && styles.toggleOn]}>
            <View style={[styles.toggleThumb, isPrivate && styles.toggleThumbOn]} />
          </View>
        </TouchableOpacity>

        {/* Community-level "Allow Reposting" toggle — when OFF, nobody can
            create new reposts of posts in this community (server-enforced). */}
        <TouchableOpacity
          style={styles.privacyRow}
          activeOpacity={0.8}
          onPress={() => setAllowReposts(!allowReposts)}
        >
          <View style={styles.privacyLeft}>
            <Ionicons name="repeat" size={22} color={allowReposts ? colors.primaryLight : colors.text.muted} />
            <View>
              <Text style={styles.privacyLabel}>Allow Reposting</Text>
              <Text style={styles.privacyDesc}>
                {allowReposts ? "Members can repost this community's posts" : "Reposting this community's posts is disabled"}
              </Text>
            </View>
          </View>
          <View style={[styles.toggle, allowReposts && styles.toggleOn]}>
            <View style={[styles.toggleThumb, allowReposts && styles.toggleThumbOn]} />
          </View>
        </TouchableOpacity>

        {community.privacy === 'private' && (
          <TouchableOpacity style={styles.rowBtn} onPress={() => navigation.navigate('ManageRequests', { communityId: community.id })}>
            <View style={styles.rowBtnLeft}>
              <Ionicons name="person-add-outline" size={20} color={colors.text.primary} />
              <Text style={styles.rowBtnText}>Manage Join Requests</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
          </TouchableOpacity>
        )}

        {/* Moderation log — owner and admins only (server also enforces it).
            community.memberRole is the VIEWER's role (owner is seeded 'admin'). */}
        {(community.ownerId === authUser?.id || ['admin', 'moderator'].includes(community.memberRole)) && (
          <TouchableOpacity style={styles.rowBtn} onPress={() => navigation.navigate('ModerationLog', { communityId: community.id })}>
            <View style={styles.rowBtnLeft}>
              <Ionicons name="file-tray-full-outline" size={20} color={colors.text.primary} />
              <Text style={styles.rowBtnText}>Moderation Log</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.rowBtn, { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.05)' }]} onPress={handleDelete}>
          <View style={styles.rowBtnLeft}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={styles.deleteBtnText}>Delete Community</Text>
          </View>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}
