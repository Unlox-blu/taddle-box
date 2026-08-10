import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors, useTheme } from '../../context/ThemeContext';
import { authService } from '../../services/auth.service';
import { mediaService } from '../../services/media.service';
import { fontSizes, spacing, radii } from '../../theme';
import { appLockBypass } from '../../utils/appLockBypass';

const OCCUPATION_OPTIONS = [
  "Student",
  "Working Professional",
  "Self-employed / Freelancer",
  "Other",
];

const GENDER_OPTIONS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
];

const INTEREST_OPTIONS = [
  "🎮 Gaming",
  "💻 Coding",
  "🎨 Design",
  "📚 Study",
  "🏆 Sports",
  "🎵 Music",
  "🚀 Startups",
  "🤖 AI/ML",
  "📱 Mobile Dev",
  "🌐 Web Dev",
  "🔒 Cybersecurity",
  "☁️ Cloud",
];

// Keep only the emoji+name part when storing/sending (matches signup payload).
const stripInterestEmoji = (i: string) => i.replace(/^\S+\s/, '').trim();

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const colors     = useThemeColors();
  const { isDark } = useTheme();
  const { user, updateUser, refreshUser } = useAuth();

  const [name,       setName]       = useState<string>(user?.name       ?? '');
  const [username,   setUsername]   = useState<string>(user?.username   ?? '');
  const [bio,        setBio]        = useState<string>(user?.bio        ?? '');
  const [website,    setWebsite]    = useState<string>(user?.websiteUrl ?? '');
  const [location,   setLocation]   = useState<string>((user as any)?.location   ?? '');
  const [organization, setOrganization] = useState<string>((user as any)?.organization ?? '');
  const [occupation, setOccupation] = useState<string>((user as any)?.occupation ?? '');
  const [gender,     setGender]     = useState<string>((user as any)?.gender     ?? '');
  const [dateOfBirth, setDateOfBirth] = useState<string>((user as any)?.dateOfBirth
    ? String((user as any).dateOfBirth).slice(0, 10)
    : '');
  const [interests,  setInterests]  = useState<string[]>(
    Array.isArray((user as any)?.interests) ? (user as any).interests : [],
  );
  const [avatarAsset, setAvatarAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [bannerAsset, setBannerAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving,     setSaving]     = useState(false);

  // ── Date of birth picker (iOS spinner modal, Android native dialog) ──
  const [showDobPicker, setShowDobPicker] = useState(false);
  const dobDate = useMemo(() => {
    const d = new Date(dateOfBirth || '2000-01-01');
    return isNaN(d.getTime()) ? new Date(2000, 0, 1) : d;
  }, [dateOfBirth]);
  const onChangeDate = (event: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowDobPicker(false);
    if (event?.type === 'dismissed' || !selected) return;
    const yyyy = selected.getFullYear();
    const mm = String(selected.getMonth() + 1).padStart(2, '0');
    const dd = String(selected.getDate()).padStart(2, '0');
    setDateOfBirth(`${yyyy}-${mm}-${dd}`);
  };

  // ── Username availability (on the go, while typing) ──
  const originalUsername = user?.username ?? '';
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'loading' | 'available' | 'taken'>('idle');
  const [usernameMsg, setUsernameMsg] = useState('');
  const usernameValid = /^[a-zA-Z0-9_]{3,30}$/.test(username);
  React.useEffect(() => {
    // No check needed when unchanged, too short, or invalid format.
    if (username === originalUsername || !usernameValid) {
      setUsernameStatus('idle');
      setUsernameMsg('');
      return;
    }
    setUsernameStatus('loading');
    setUsernameMsg('');
    const timer = setTimeout(async () => {
      try {
        await authService.checkUsername(username);
        setUsernameStatus('available');
        setUsernameMsg('Username is available');
      } catch (e: any) {
        setUsernameStatus('taken');
        setUsernameMsg(e?.response?.data?.message || 'Username is already taken');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [username, originalUsername, usernameValid]);

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
    location: (user as any)?.location      ?? '',
    organization: (user as any)?.organization ?? '',
    occupation: (user as any)?.occupation  ?? '',
    gender:   (user as any)?.gender        ?? '',
    dateOfBirth: (user as any)?.dateOfBirth ? String((user as any).dateOfBirth).slice(0, 10) : '',
    interests: Array.isArray((user as any)?.interests) ? (user as any).interests : [],
  });

  const avatarPreviewUri = avatarAsset?.uri || user?.avatarUrl;
  const bannerPreviewUri = bannerAsset?.uri || user?.bannerUrl;
  const hasChanges =
    name          !== originalRef.current.name          ||
    username      !== originalRef.current.username      ||
    bio           !== originalRef.current.bio           ||
    website       !== originalRef.current.website       ||
    location      !== originalRef.current.location      ||
    organization  !== originalRef.current.organization  ||
    occupation    !== originalRef.current.occupation    ||
    gender        !== originalRef.current.gender        ||
    dateOfBirth   !== originalRef.current.dateOfBirth   ||
    JSON.stringify(interests) !== JSON.stringify(originalRef.current.interests) ||
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
    if (username !== originalUsername && !usernameValid) {
      Alert.alert('Validation', 'Username can only contain letters, numbers and underscores (3–30 chars).');
      return;
    }
    if (usernameStatus === 'taken') {
      Alert.alert('Validation', 'That username is already taken.');
      return;
    }

    setSaving(true);
    pendingMediaRef.current = [];
    try {
      const tasks: Promise<any>[] = [];

      // Profile fields (all editable fields the API supports)
      const profileChanged =
        name.trim()          !== originalRef.current.name          ||
        bio.trim()           !== originalRef.current.bio           ||
        website.trim()       !== originalRef.current.website       ||
        location.trim()      !== originalRef.current.location      ||
        organization.trim()  !== originalRef.current.organization  ||
        occupation           !== originalRef.current.occupation    ||
        gender               !== originalRef.current.gender        ||
        dateOfBirth          !== originalRef.current.dateOfBirth   ||
        JSON.stringify(interests) !== JSON.stringify(originalRef.current.interests);

      if (profileChanged) {
        tasks.push(authService.updateProfile({
          name:       name.trim(),
          bio:        bio.trim()     || undefined,
          websiteUrl: website.trim() || undefined,
          location:   location.trim()    || undefined,
          organization: organization.trim() || undefined,
          // Raw value INCLUDING '' — the API treats empty string as "clear
          // this field" (persists NULL), so clearing a previously-set
          // occupation/gender actually sticks.
          occupation: occupation,
          gender:     gender as any,
          dateOfBirth: dateOfBirth || undefined,
          // Always send interests (even an empty array) so clearing them
          // actually clears them server-side instead of silently keeping the
          // old list.
          interests:  interests.map(stripInterestEmoji),
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
    opts?: { multiline?: boolean; placeholder?: string; keyboardType?: any; autoCapitalize?: any; trailing?: React.ReactNode }
  ) => (
    <View
      style={styles.fieldWrap}
      onLayout={(e) => {
        fieldYRef.current[label] = e.nativeEvent.layout.y;
      }}
    >
      <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>{label}</Text>
      <View style={styles.inputShell}>
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
        {opts?.trailing}
      </View>
    </View>
  );

  const selectChips = (
    label: string,
    options: { label: string; value: string }[],
    selected: string,
    onSelect: (v: string) => void,
  ) => (
    <View
      style={styles.fieldWrap}
      onLayout={(e) => {
        fieldYRef.current[label] = e.nativeEvent.layout.y;
      }}
    >
      <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const active = selected === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onSelect(active ? '' : opt.value)}
              style={[
                styles.chip,
                {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? 'rgba(124,58,237,0.12)' : colors.bg.card,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? colors.primaryLight : colors.text.secondary },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const interestChips = (
    <View
      style={styles.fieldWrap}
      onLayout={(e) => {
        fieldYRef.current['Interests'] = e.nativeEvent.layout.y;
      }}
    >
      <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>Interests</Text>
      <View style={styles.chipRow}>
        {INTEREST_OPTIONS.map((opt) => {
          const value = stripInterestEmoji(opt);
          const active = interests.includes(value);
          return (
            <TouchableOpacity
              key={opt}
              onPress={() =>
                setInterests((prev) =>
                  active ? prev.filter((i) => i !== value) : [...prev, value],
                )
              }
              style={[
                styles.chip,
                {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? 'rgba(124,58,237,0.12)' : colors.bg.card,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? colors.primaryLight : colors.text.secondary },
                ]}
              >
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
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

          {/* Username with live availability */}
          <View
            style={styles.fieldWrap}
            onLayout={(e) => {
              fieldYRef.current['Username'] = e.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>Username</Text>
            <View style={styles.inputShell}>
              <TextInput
                value={username}
                onChangeText={setUsername}
                onFocus={() => scrollToField('Username')}
                style={[
                  styles.fieldInput,
                  {
                    color:           colors.text.primary,
                    borderColor:     colors.border,
                    backgroundColor: colors.bg.card,
                  },
                ]}
                placeholderTextColor={colors.text.muted}
                placeholder="username"
                autoCapitalize="none"
              />
              {username !== originalUsername && usernameValid && (
                <View style={styles.usernameStatus}>
                  {usernameStatus === 'loading' ? (
                    <ActivityIndicator size={14} color={colors.text.muted} />
                  ) : (
                    <Ionicons
                      name={usernameStatus === 'available' ? 'checkmark-circle' : 'close-circle'}
                      size={18}
                      color={usernameStatus === 'available' ? '#22c55e' : '#ef4444'}
                    />
                  )}
                </View>
              )}
            </View>
            {username !== originalUsername && (
              <Text
                style={[
                  styles.fieldHint,
                  {
                    color:
                      usernameStatus === 'available'
                        ? '#22c55e'
                        : usernameStatus === 'taken'
                          ? '#ef4444'
                          : colors.text.muted,
                  },
                ]}
              >
                {usernameStatus === 'loading'
                  ? 'Checking…'
                  : usernameStatus === 'available'
                    ? 'Username is available'
                    : usernameStatus === 'taken'
                      ? usernameMsg
                      : 'Username can only contain letters, numbers and underscores (3–30 chars).'}
              </Text>
            )}
          </View>

          {field('Bio',        bio,      setBio,      { placeholder: 'Tell the world about yourself…', multiline: true })}
          {field('Website',    website,  setWebsite,  { placeholder: 'https://yourwebsite.com', keyboardType: 'url', autoCapitalize: 'none' })}
          {field('Location',   location, setLocation, { placeholder: 'e.g. Bangalore, India' })}
          {field('Organization / College', organization, setOrganization, { placeholder: 'Where do you work or study?' })}

          {selectChips('Occupation', OCCUPATION_OPTIONS.map(o => ({ label: o, value: o })), occupation, setOccupation)}
          {selectChips('Gender', GENDER_OPTIONS, gender, setGender)}

          {/* Date of birth */}
          <View
            style={styles.fieldWrap}
            onLayout={(e) => {
              fieldYRef.current['Date of Birth'] = e.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>Date of Birth</Text>
            <TouchableOpacity
              onPress={() => setShowDobPicker(true)}
              style={[
                styles.fieldInput,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.bg.card,
                  justifyContent: 'center',
                },
              ]}
            >
              <Text style={{ color: dateOfBirth ? colors.text.primary : colors.text.muted, fontSize: fontSizes.md }}>
                {dateOfBirth || 'Select your date of birth'}
              </Text>
            </TouchableOpacity>
          </View>

          {interestChips}

          <Text style={[styles.hint, { color: colors.text.muted }]}>
            Interests show up on your profile and help personalize your feed.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── iOS date picker modal ── */}
      {Platform.OS === 'ios' && (
        <Modal visible={showDobPicker} transparent animationType="slide">
          <TouchableOpacity
            style={styles.dateBackdrop}
            activeOpacity={1}
            onPress={() => setShowDobPicker(false)}
          >
            <View style={[styles.dateSheet, { backgroundColor: colors.bg.card }]}>
              <View style={[styles.dateHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => setShowDobPicker(false)}>
                  <Text style={{ color: colors.primaryLight, fontWeight: '700', fontSize: 16 }}>
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dobDate}
                mode="date"
                display="spinner"
                themeVariant={isDark ? 'dark' : 'light'}
                maximumDate={new Date()}
                onChange={onChangeDate}
                style={{ height: 200 }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}
      {/* Android native dialog */}
      {Platform.OS === 'android' && showDobPicker && (
        <DateTimePicker
          value={dobDate}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onChangeDate}
        />
      )}
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
  inputShell:  { position: 'relative' },
  fieldInput:  { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: fontSizes.md },
  usernameStatus: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  fieldHint:   { fontSize: fontSizes.xs, lineHeight: 16 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { borderWidth: 1, borderRadius: radii.full, paddingVertical: 7, paddingHorizontal: 14 },
  chipText:    { fontSize: fontSizes.sm, fontWeight: '600' },
  hint:        { fontSize: fontSizes.xs, marginTop: spacing.sm, lineHeight: 18 },
  dateBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  dateSheet:   { borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, paddingBottom: 24 },
  dateHeader:  { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1 },
});
