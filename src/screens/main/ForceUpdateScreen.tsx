import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../context/ThemeContext';
import { fontSizes, spacing } from '../../theme';
import Button from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';

export default function ForceUpdateScreen() {
  const colors = useThemeColors();
  const { storeUrl } = useAuth();

  const handleUpdate = () => {
    if (storeUrl) {
      Linking.openURL(storeUrl);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg.base }]}>
      <View style={styles.content}>
        <View style={styles.iconBox}>
          <Ionicons name="cloud-download" size={60} color="#10B981" />
        </View>
        <Text style={[styles.title, { color: colors.text.primary }]}>Update Required</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          A new version of Taddle is available. Please update to the latest version to continue using the app.
        </Text>
        <Button 
          label="Update Now" 
          onPress={handleUpdate} 
          variant="primary" 
          fullWidth 
          style={{ marginTop: spacing.xl }} 
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconBox: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSizes.h1,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSizes.md,
    textAlign: 'center',
    lineHeight: 24,
  },
});
