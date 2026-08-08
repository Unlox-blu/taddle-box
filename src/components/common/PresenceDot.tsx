import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePresence, presenceIndicator } from '../../context/PresenceContext';
import { useThemeColors } from '../../context/ThemeContext';

interface Props {
  /** User whose presence to show. No id → renders nothing. */
  userId?: string;
  /** Dot diameter. Default 14. */
  size?: number;
  style?: any;
}

/**
 * Purple dot over an avatar when the user is online, a small clock when they
 * were recently active, and nothing otherwise. Presence is only visible for
 * the viewer's own account and people they follow (server-enforced).
 */
export default function PresenceDot({ userId, size = 14, style }: Props) {
  const colors = useThemeColors();
  const presence = usePresence(userId);
  const indicator = presenceIndicator(presence);
  if (!indicator || !userId) return null;

  const dot = Math.max(10, size);
  // Ionicons glyphs carry internal padding — 62% of the bubble fills it
  // without clipping, so the clock reads as a proper filled indicator.
  const iconSize = Math.round(dot * 0.62);

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
        // Recently active — same footprint/position as the online dot, but
        // fainter: a visible purple fill with a clock glyph that fills it.
        <View
          style={[
            styles.recent,
            {
              width: dot - 3,
              height: dot - 3,
              borderRadius: (dot - 3) / 2,
              backgroundColor: 'rgba(124,58,237,0.18)',
            },
          ]}
        >
          <Ionicons name="time" size={iconSize} color="rgba(124,58,237,0.9)" />
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
