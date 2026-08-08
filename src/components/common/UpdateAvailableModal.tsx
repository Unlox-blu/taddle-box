import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '../../context/ThemeContext';
import { fontSizes, spacing, radii } from '../../theme';
import { useAuth } from '../../context/AuthContext';

/**
 * Non-blocking "A new version is available" popup. Shown once per session when
 * a newer build exists but the current one still works (force updates are
 * handled separately by the ForceUpdate screen).
 */
export default function UpdateAvailableModal() {
  const colors = useThemeColors();
  const { updateAvailable, dismissUpdate, storeUrl } = useAuth();
  if (!updateAvailable) return null;

  const handleUpdate = () => {
    dismissUpdate();
    Linking.openURL(storeUrl || 'https://play.google.com/store').catch(() => {});
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissUpdate}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(124,58,237,0.14)' }]}>
            <Ionicons name="cloud-download-outline" size={34} color={colors.primaryLight} />
          </View>
          <Text style={[styles.title, { color: colors.text.primary }]}>New version available</Text>
          <Text style={[styles.sub, { color: colors.text.secondary }]}>
            An updated version of Taddlebox is ready. Update now to get the latest features, fixes and improvements.
          </Text>
          <LinearGradient
            colors={[colors.primary, colors.cyanDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.updateBtn}
          >
            <TouchableOpacity style={styles.updateBtnInner} onPress={handleUpdate} activeOpacity={0.85}>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.updateBtnText}>Update Now</Text>
            </TouchableOpacity>
          </LinearGradient>
          <TouchableOpacity style={styles.laterBtn} onPress={dismissUpdate} activeOpacity={0.7}>
            <Text style={[styles.laterText, { color: colors.text.muted }]}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes.lg,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  sub: {
    fontSize: fontSizes.sm,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  updateBtn: {
    alignSelf: 'stretch',
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  updateBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  updateBtnText: { color: '#fff', fontSize: fontSizes.md, fontWeight: '800' },
  laterBtn: { paddingVertical: 12, paddingHorizontal: 24 },
  laterText: { fontSize: fontSizes.sm, fontWeight: '600' },
});
