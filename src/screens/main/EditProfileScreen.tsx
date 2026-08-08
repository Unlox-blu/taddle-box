import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../context/ThemeContext';
import { authService } from '../../services/auth.service';
import { mediaService } from '../../services/media.service';
import { fontSizes, spacing, radii } from '../../theme';
import { appLockBypass } from '../../utils/appLockBypass';

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const colors     = useThemeColors();
  const { user, updateUser, refreshUser } = useAuth();

  const [name,       setName]       = useState<string>(user?.name       ?? '');
  const [username,   setUsername]   = useState<string>(user?.username   ?? '');
  const [bio,        setBio]        = useState<string>(user?.bio        ?? '');
  const [website,    setWebsite]    = useState<string>(user?.websiteUrl ?? '');
  const [avatarAsset, setAvatarAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [bannerAsset, setBannerAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving,     setSaving]     = useState(false);

  // Keyboard responsiveness: keep the focused field visible above the keyboard.
  const scrollRef = useRef<ScrollView>(null);
  const fieldYRef = useRef<Record<string, number>>({});
  // Media rows created during the current save that are NOT yet attached to the
  // profile (upload succeeded, updateAvatar/updateBanner not done). If the save
  // fails they're orphaned S3 objects — delete them; attached ones are removed
  // from this list so they're never cleaned up.
  const pendingMediaRef = useRef<string[]>([]);

  const scrollToField = (key: string) => {
    const y = fieldYRef.current[key];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
    }
  };

  // Track what actually changed
  const originalRef = useRef({
    name:     user?.name       ?? '',
    username: user?.username   ?? '',
    bio:      user?.bio        ?? '',
    website:  user?.websiteUrl ?? '',
  });

  const avatarPreviewUri = avatarAsset?.uri || user?.avatarUrl;
  const bannerPreviewUri = bannerAsset?.uri || user?.bannerUrl;
  const hasChanges =
    name     !== originalRef.current.name     ||
    username !== originalRef.current.username ||
    bio      !== originalRef.current.bio      ||
    website  !== originalRef.current.website ||
    !!avatarAsset ||
    !!bannerAsset;

  const pickAvatar = async () => {
    appLockBypass.beginNativeFlow();
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to your media library to update your profile image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (!result.canceled && result.assets.length > 0) {
        setAvatarAsset(result.assets[0]);
      }
    } finally {
      appLockBypass.endNativeFlow();
    }
  };

  const getAvatarFileSize = async (asset: ImagePicker.ImagePickerAsset) => {
    if (asset.fileSize) return asset.fileSize;
    const info = await FileSystem.getInfoAsync(asset.uri);
    return info.exists && 'size' in info ? info.size : 1000000;
  };

  const uploadAvatar = async (asset: ImagePicker.ImagePickerAsset) => {
    const mimeType = asset.mimeType || 'image/jpeg';
    const fileSize = await getAvatarFileSize(asset);
    const res = await mediaService.getSignedUrl(
      'avatars',
      fileSize,
      mimeType,
      asset.width,
      asset.height,
    );

    await mediaService.uploadFileDirect(res.data.signedUrl!, asset.uri, mimeType);
    await mediaService.confirmUpload(res.data.mediaId, res.data.s3Key!);
    // Pending until updateAvatar succeeds — handleSave's cleanup cancels
    // anything left in this list (attach failed) and nothing else.
    pendingMediaRef.current.push(res.data.mediaId);
    await authService.updateAvatar(res.data.mediaId);
    // Only reached when the attach succeeded — the media is now in use.
    pendingMediaRef.current = pendingMediaRef.current.filter((id) => id !== res.data.mediaId);
  };

  const pickBanner = async () => {
    appLockBypass.beginNativeFlow();
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to your media library to update your profile banner.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.85,
      });

      if (!result.canceled && result.assets.length > 0) {
        setBannerAsset(result.assets[0]);
      }
    } finally {
      appLockBypass.endNativeFlow();
    }
  };

  const uploadBanner = async (asset: ImagePicker.ImagePickerAsset) => {
    const mimeType = asset.mimeType || 'image/jpeg';
    const fileSize = await getAvatarFileSize(asset);
    const res = await mediaService.getSignedUrl(
      'banners',
      fileSize,
      mimeType,
      asset.width,
      asset.height,
    );

    await mediaService.uploadFileDirect(res.data.signedUrl!, asset.uri, mimeType);
    await mediaService.confirmUpload(res.data.mediaId, res.data.s3Key!);
    pendingMediaRef.current.push(res.data.mediaId);
    await authService.updateBanner(res.data.mediaId);
    pendingMediaRef.current = pendingMediaRef.current.filter((id) => id !== res.data.mediaId);
  };

  // EditProfile lives on the Home tab's stack, so a plain goBack() lands on
  // the HOME screen. Pop it and switch to the Profile tab instead — SharedProfile
  // refetches on focus, so the saved changes are visible immediately.
  const returnToProfile = () => {
    navigation.getParent()?.navigate('Profile' as never);
    if (navigation.canGoBack()) navigation.goBack();
  };

  const handleSave = async () => {
    if (!hasChanges) { returnToProfile(); return; }
    if (!name.trim()) { Alert.alert('Validation', 'Name cannot be empty.'); return; }

    setSaving(true);
    pendingMediaRef.current = [];
    try {
      const tasks: Promise<any>[] = [];

      // Profile fields (name, bio, websiteUrl)
      const profileChanged =
        name.trim()    !== originalRef.current.name     ||
        bio.trim()     !== originalRef.current.bio      ||
        website.trim() !== originalRef.current.website;

      if (profileChanged) {
        tasks.push(authService.updateProfile({
          name:       name.trim(),
          bio:        bio.trim()     || undefined,
          websiteUrl: website.trim() || undefined,
        }));
      }

      // Username is separate endpoint
      if (username.trim() !== originalRef.current.username) {
        tasks.push(authService.updateUsername(username.trim()));
      }

      if (avatarAsset) {
        tasks.push(uploadAvatar(avatarAsset));
      }

      if (bannerAsset) {
        tasks.push(uploadBanner(bannerAsset));
      }

      // allSettled (not all): every task runs to completion before we decide,
      // so cleanup below never races an in-flight avatar/banner attach.
      const results = await Promise.allSettled(tasks);
      const failed = results.find((r) => r.status === 'rejected');
      if (failed) {
        throw (failed as PromiseRejectedResult).reason;
      }

      // Optimistic update then refresh from backend
      updateUser({
        name: name.trim(),
        username: username.trim(),
        bio: bio.trim(),
        websiteUrl: website.trim(),
        ...(avatarAsset ? { avatarUrl: avatarAsset.uri } : {}),
        ...(bannerAsset ? { bannerUrl: bannerAsset.uri } : {}),
      });
      await refreshUser();

      Alert.alert('Saved!', 'Your profile has been updated.', [
        { text: 'OK', onPress: returnToProfile },
      ]);
    } catch (e: any) {
      // Roll back media whose attach step failed — the S3 objects + media rows
      // would otherwise be junked forever.
      pendingMediaRef.current.forEach((mediaId) => {
        mediaService.cancleUpload(mediaId).catch(() => {});
      });
      pendingMediaRef.current = [];
      Alert.alert('Error', e.response?.data?.message || 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { multiline?: boolean; placeholder?: string; keyboardType?: any; autoCapitalize?: any }
  ) => (
    <View
      style={styles.fieldWrap}
      onLayout={(e) => {
        fieldYRef.current[label] = e.nativeEvent.layout.y;
      }}
    >
      <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => scrollToField(label)}
        style={[
          styles.fieldInput,
          {
            color:           colors.text.primary,
            borderColor:     colors.border,
            backgroundColor: colors.bg.card,
          },
          opts?.multiline && { height: 90, textAlignVertical: 'top' },
        ]}
        placeholderTextColor={colors.text.muted}
        placeholder={opts?.placeholder ?? ''}
        multiline={opts?.multiline}
        keyboardType={opts?.keyboardType ?? 'default'}
        autoCapitalize={opts?.autoCapitalize ?? 'sentences'}
        numberOfLines={opts?.multiline ? 4 : 1}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg.base }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.iconBtn, { borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Edit Profile</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[
            styles.saveBtn,
            { backgroundColor: hasChanges ? colors.primary : colors.bg.elevated },
          ]}
        >
          {saving
            ? <ActivityIndicator size={16} color="#fff" />
            : <Text style={[styles.saveBtnText, { color: hasChanges ? '#fff' : colors.text.muted }]}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.bannerRow}>
            <TouchableOpacity
              onPress={pickBanner}
              disabled={saving}
              style={[styles.banner, { backgroundColor: colors.bg.elevated, borderColor: colors.border }]}
            >
              {bannerPreviewUri ? (
                <Image source={{ uri: bannerPreviewUri }} style={styles.bannerImage} />
              ) : (
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Ionicons name="image-outline" size={26} color={colors.text.muted} />
                  <Text style={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                    Add profile banner
                  </Text>
                </View>
              )}
              <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary, top: 10, bottom: undefined, right: 10 }]}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.avatarRow}>
            <TouchableOpacity
              onPress={pickAvatar}
              disabled={saving}
              style={[styles.avatar, { backgroundColor: colors.bg.elevated, borderColor: colors.border }]}
            >
              {avatarPreviewUri ? (
                <Image source={{ uri: avatarPreviewUri }} style={styles.avatarImage} />
              ) : (
                <Text style={{ fontSize: 36 }}>👾</Text>
              )}
              <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary }]}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickAvatar} disabled={saving} style={styles.changePhotoBtn}>
              <Text style={[styles.changePhotoText, { color: colors.primary }]}>
                {avatarAsset ? 'Change selected photo' : 'Change photo'}
              </Text>
            </TouchableOpacity>
          </View>

          {field('Name',       name,     setName,     { placeholder: 'Your display name', autoCapitalize: 'words' })}
          {field('Username',   username, setUsername, { placeholder: 'username', autoCapitalize: 'none' })}
          {field('Bio',        bio,      setBio,      { placeholder: 'Tell the world about yourself…', multiline: true })}
          {field('Website',    website,  setWebsite,  { placeholder: 'https://yourwebsite.com', keyboardType: 'url', autoCapitalize: 'none' })}

          <Text style={[styles.hint, { color: colors.text.muted }]}>
            Username can only contain letters, numbers and underscores (3–30 chars).
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  iconBtn:     { width: 38, height: 38, borderRadius: radii.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: fontSizes.xl, fontWeight: '800' },
  saveBtn:     { paddingHorizontal: 18, paddingVertical: 8, borderRadius: radii.full },
  saveBtnText: { fontWeight: '700', fontSize: fontSizes.sm },
  body:        { padding: spacing.lg, gap: spacing.md },
  bannerRow:   { marginBottom: spacing.sm },
  banner:      { width: '100%', height: 120, borderRadius: radii.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bannerImage: { width: '100%', height: '100%' },
  avatarRow:   { alignItems: 'center', marginBottom: spacing.md },
  avatar:      { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 40 },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoBtn: { marginTop: spacing.sm, paddingVertical: 4, paddingHorizontal: spacing.sm },
  changePhotoText: { fontSize: fontSizes.sm, fontWeight: '700' },
  fieldWrap:   { gap: 6 },
  fieldLabel:  { fontSize: fontSizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput:  { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: fontSizes.md },
  hint:        { fontSize: fontSizes.xs, marginTop: spacing.sm, lineHeight: 18 },
});
