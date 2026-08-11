/**
 * AppRefreshControl
 *
 * Shows the app icon during pull-to-refresh instead of the platform spinner.
 * No spinning — just the icon fading in with a spring pop.
 */

import React, { useEffect, useRef } from 'react';
import {
  RefreshControl,
  View,
  StyleSheet,
  Animated,
  Image,
} from 'react-native';
import { useThemeColors } from '../../context/ThemeContext';

const APP_ICON = require('../../../assets/icon.png');

interface Props {
  refreshing: boolean;
  onRefresh: () => void;
  /** Size of the icon in px (default 36) */
  iconSize?: number;
}

export default function AppRefreshControl({
  refreshing,
  onRefresh,
  iconSize = 36,
}: Props) {
  const colors = useThemeColors();
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (refreshing) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 140,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.7,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [refreshing]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      // Hide the native spinner on both platforms; our icon replaces it.
      tintColor="transparent"
      colors={['transparent']}
      progressBackgroundColor="transparent"
      style={{ backgroundColor: 'transparent' }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.iconWrap,
          { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View
          style={[
            styles.iconBubble,
            {
              width: iconSize + 12,
              height: iconSize + 12,
              borderRadius: (iconSize + 12) / 2,
              backgroundColor: colors.bg.elevated,
              borderColor: colors.border,
            },
          ]}
        >
          <Image
            source={APP_ICON}
            style={{ width: iconSize, height: iconSize, borderRadius: iconSize / 4 }}
            resizeMode="contain"
          />
        </View>
      </Animated.View>
    </RefreshControl>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  iconBubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#7C3AED',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
