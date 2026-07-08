import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radii, fontSizes, spacing, type ColorPalette } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';

interface XPProgressBarProps {
  level: number;
  rank: string;
  currentXP: number;
  targetXP: number;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      borderRadius: radii.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: 'rgba(124,58,237,0.22)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    levelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    levelCircle: {
      width: 28, height: 28,
      borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
    },
    levelNum: {
      fontSize: fontSizes.xs, fontWeight: '800',
      color: '#fff',
    },
    levelText: {
      fontSize: fontSizes.sm, fontWeight: '600',
      color: c.text.primary,
      marginLeft: 6,
    },
    xpNext: { fontSize: fontSizes.xs, color: c.text.muted },
    track: {
      height: 6,
      backgroundColor: 'rgba(255,255,255,0.07)',
      borderRadius: radii.full,
      overflow: 'visible',
      position: 'relative',
    },
    fillWrapper: {
      height: '100%',
      borderRadius: radii.full,
      overflow: 'hidden',
    },
    fill: { flex: 1, borderRadius: radii.full },
    dot: {
      position: 'absolute',
      right: -2, top: -4,
      width: 14, height: 14,
      borderRadius: 7,
      backgroundColor: c.cyanLight,
      shadowColor: c.cyan,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 6,
      elevation: 4,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    footerText: { fontSize: fontSizes.xs, color: c.text.muted },
  });
}

export default function XPProgressBar({ level, rank, currentXP, targetXP }: XPProgressBarProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
    <LinearGradient
      colors={['rgba(124,58,237,0.14)', 'rgba(6,182,212,0.10)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.levelRow}>
          <LinearGradient
            colors={[colors.primary, colors.cyanDark]}
            style={styles.levelCircle}
          >
            <Text style={styles.levelNum}>{level}</Text>
          </LinearGradient>
          <Text style={styles.levelText}>Level {level} · {rank}</Text>
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
        <View style={styles.dot} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>⚡ {currentXP.toLocaleString()} XP earned</Text>
        <Text style={styles.footerText}>{Math.round(pct * 100)}%</Text>
      </View>
    </LinearGradient>
  );
}
