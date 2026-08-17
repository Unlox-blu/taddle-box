import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveStatus, activeStatusIndicator } from '../../context/ActiveStatusContext';
import { useThemeColors } from '../../context/ThemeContext';

interface Props {
  /** User whose active status to show. No id → renders nothing. */
  userId?: string;
  /** Dot diameter. Default 14. */
  size?: number;
  style?: any;
}

/**
 * Purple dot over an avatar when the user is online, a small clock when they
 * were recently active, and nothing otherwise. Active status is only visible
 * for the viewer's own account and people they follow (server-enforced).
 */
export default function ActiveStatusDot({ userId, size = 14, style }: Props) {
  const colors = useThemeColors();
  const activeStatus = useActiveStatus(userId);
  const indicator = activeStatusIndicator(activeStatus);
  if (!indicator || !userId) return null;

  const dot = Math.max(10, size);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          borderColor: colors.bg.base,
          // The recent badge fills the whole circle — no gap ring around it.
          borderWidth: indicator === 'online' ? 2 : 0,
        },
        style,
      ]}
    >
      {indicator === 'online' ? (
        <View
          style={[
            styles.online,
            {
              width: dot - 3,
              height: dot - 3,
              borderRadius: (dot - 3) / 2,
              backgroundColor: colors.primary,
            },
          ]}
        />
      ) : (
        // Recently active — a black circle (theme background) with a purple
        // clock filling it: the badge occupies the whole corner circle while
        // staying subtle against the avatar.
        <View
          style={[
            styles.recent,
            {
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: colors.bg.base,
            },
          ]}
        >
          <Ionicons name="time" size={Math.round(dot * 0.7)} color="rgba(124,58,237,0.95)" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  online: {},
  recent: { alignItems: 'center', justifyContent: 'center' },
});
