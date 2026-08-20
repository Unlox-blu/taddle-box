import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radii, fontSizes, spacing, type ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

interface XPProgressBarProps {
  level: number;
  rank: string;
  currentXP: number;
  targetXP: number;
}

function makeStyles(c: ColorPalette, isDark: boolean) {
  return StyleSheet.create({
    container: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      marginTop: spacing.xs,
      borderRadius: radii.md,
      padding: 12,
      backgroundColor: isDark ? 'rgba(124,58,237,0.06)' : 'rgba(124,58,237,0.04)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(124,58,237,0.2)' : 'rgba(124,58,237,0.15)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    levelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    levelCircle: {
      width: 28, height: 28,
      borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
    },
    levelNum: {
      fontSize: fontSizes.xs, fontWeight: '900',
      color: '#fff',
    },
    levelText: {
      fontSize: fontSizes.sm, fontWeight: '700',
      color: c.text.primary,
    },
    rankText: {
      fontSize: fontSizes.xs - 1,
      fontWeight: '600',
      color: c.primaryLight,
      marginTop: 1,
    },
    xpNext: { fontSize: fontSizes.xs - 1, fontWeight: '600', color: c.text.secondary },
    track: {
      height: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
      borderRadius: radii.full,
      overflow: 'hidden',
      position: 'relative',
    },
    fillWrapper: {
      height: '100%',
      borderRadius: radii.full,
      overflow: 'hidden',
    },
    fill: { flex: 1, borderRadius: radii.full },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 6,
      alignItems: 'center',
    },
    footerText: { fontSize: fontSizes.xs - 1, fontWeight: '600', color: c.text.muted },
    footerEarned: { fontSize: fontSizes.xs - 1, fontWeight: '700', color: c.text.secondary },
  });
}

export default function XPProgressBar({ level, rank, currentXP, targetXP }: XPProgressBarProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const progress = useRef(new Animated.Value(0)).current;
  const pct = Math.min(currentXP / targetXP, 1);

  useEffect(() => {
    Animated.spring(progress, {
      toValue: pct,
      useNativeDriver: false,
      tension: 40,
      friction: 8,
    }).start();
  }, [pct]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.levelRow}>
          <LinearGradient
            colors={[colors.primary, colors.cyanDark]}
            style={styles.levelCircle}
          >
            <Text style={styles.levelNum}>{level}</Text>
          </LinearGradient>
          <View>
            <Text style={styles.levelText}>Level {level}</Text>
            <Text style={styles.rankText}>{rank}</Text>
          </View>
        </View>
        <Text style={styles.xpNext}>{targetXP - currentXP} XP to next</Text>
      </View>

      <View style={styles.track}>
        <Animated.View style={[styles.fillWrapper, { width }]}>
          <LinearGradient
            colors={[colors.primary, colors.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.fill}
          />
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerEarned}>⚡ {currentXP.toLocaleString()} XP earned</Text>
        <Text style={styles.footerText}>{Math.round(pct * 100)}%</Text>
      </View>
    </View>
  );
}
