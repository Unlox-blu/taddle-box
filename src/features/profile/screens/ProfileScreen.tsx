import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme, useThemeColors } from '../../../design-system/theme/ThemeProvider';
import { useAuth } from '../../auth/state/AuthProvider';
import MainHeader from '../../../shell/components/MainHeader';
import SharedProfile from '../components/SharedProfile';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const { user: authUser } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SharedProfile 
        initialUser={authUser} 
        isOwnProfile={true}
        headerComponent={<MainHeader showBack={true} />}
      />
    </View>
  );
}
