import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useThemeColors } from '../../context/ThemeContext';
import { authService } from '../../services/auth.service';
import { fontSizes, spacing, radii } from '../../theme';

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const colors     = useThemeColors();
  const { user, updateUser, refreshUser } = useAuth();

  const [name,       setName]       = useState<string>(user?.name       ?? '');
  const [username,   setUsername]   = useState<string>(user?.username   ?? '');
  const [bio,        setBio]        = useState<string>(user?.bio        ?? '');
  const [website,    setWebsite]    = useState<string>(user?.websiteUrl ?? '');
  const [saving,     setSaving]     = useState(false);

  // Track what actually changed
  const originalRef = useRef({
    name:     user?.name       ?? '',
    username: user?.username   ?? '',
    bio:      user?.bio        ?? '',
    website:  user?.websiteUrl ?? '',
  });

  const hasChanges =
    name     !== originalRef.current.name     ||
    username !== originalRef.current.username ||
    bio      !== originalRef.current.bio      ||
    website  !== originalRef.current.website;

  const handleSave = async () => {
    if (!hasChanges) { navigation.goBack(); return; }
    if (!name.trim()) { Alert.alert('Validation', 'Name cannot be empty.'); return; }

    setSaving(true);
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

      await Promise.all(tasks);

      // Optimistic update then refresh from backend
      updateUser({ name: name.trim(), username: username.trim(), bio: bio.trim(), websiteUrl: website.trim() });
      await refreshUser();

      Alert.alert('Saved!', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
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
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.text.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* Avatar placeholder – upload feature in next update */}
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, { backgroundColor: colors.bg.elevated, borderColor: colors.border }]}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 40 }} />
              ) : (
                <Text style={{ fontSize: 36 }}>👾</Text>
              )}
            </View>
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
  avatarRow:   { alignItems: 'center', marginBottom: spacing.md },
  avatar:      { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  fieldWrap:   { gap: 6 },
  fieldLabel:  { fontSize: fontSizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput:  { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: fontSizes.md },
  hint:        { fontSize: fontSizes.xs, marginTop: spacing.sm, lineHeight: 18 },
});
