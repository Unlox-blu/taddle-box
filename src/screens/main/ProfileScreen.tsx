import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme, useThemeColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import MainHeader from '../../components/common/MainHeader';
import SharedProfile from '../../components/profile/SharedProfile';

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
        headerComponent={<MainHeader />}
      />
    </View>
  );
}
