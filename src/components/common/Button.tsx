import React from 'react';
import {
  TouchableOpacity, Text, StyleSheet, ActivityIndicator,
  ViewStyle, TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, fontSizes } from '../../theme';

type Variant = 'primary' | 'secondary' | 'cyan' | 'xp' | 'ghost' | 'danger' | 'success';
type Size    = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftEmoji?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const GRADIENTS: Record<Variant, [string, string]> = {
  primary: [colors.primary, colors.primaryDark],
  secondary: [colors.secondary, colors.secondaryDark],
  cyan:    [colors.cyan, colors.cyanDark],
  xp:      [colors.xpGold, colors.xpOrange],
  ghost:   ['transparent', 'transparent'],
  danger:  [colors.danger, '#B91C1C'],
  success: [colors.success, '#059669'],
};

const TEXT_COLORS: Record<Variant, string> = {
  primary: '#fff',
  secondary: '#42016d',
  cyan:    '#fff',
  xp:      '#1A0A00',
  ghost:   colors.text.secondary,
  danger:  '#fff',
  success: '#fff',
};

const SIZES = {
  sm: { paddingVertical: 8,  paddingHorizontal: 16, fontSize: fontSizes.sm, radius: radii.full },
  md: { paddingVertical: 12, paddingHorizontal: 24, fontSize: fontSizes.md, radius: radii.md  },
  lg: { paddingVertical: 15, paddingHorizontal: 28, fontSize: fontSizes.lg, radius: radii.md  },
};

export default function Button({
  label, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, fullWidth = false,
  leftEmoji, style, textStyle,
}: ButtonProps) {
  const sz = SIZES[size];
  const isGhost = variant === 'ghost';

  const inner = (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.78}
      style={[
        styles.base,
        { borderRadius: sz.radius, paddingVertical: sz.paddingVertical, paddingHorizontal: sz.paddingHorizontal },
        isGhost && styles.ghost,
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        isGhost && style, // Only apply to inner if it's a ghost button
      ]}
    >
      {loading ? (
        <ActivityIndicator color={TEXT_COLORS[variant]} size="small" />
      ) : (
        <Text style={[
          styles.label,
          { fontSize: sz.fontSize, color: TEXT_COLORS[variant], textAlign: 'center' },
          variant === 'xp' && styles.xpLabel,
          textStyle,
        ]}>
          {leftEmoji ? `${leftEmoji}  ${label}` : label}
        </Text>
      )}
    </TouchableOpacity>
  );

  if (isGhost) return inner;

  return (
    <LinearGradient
      colors={GRADIENTS[variant]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.gradient,
        { borderRadius: sz.radius },
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {inner}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient:  { overflow: 'hidden' },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: {
    borderWidth: 1,
    borderColor: colors.borderHover,
    borderRadius: radii.md,
  },
  fullWidth: { width: '100%' },
  disabled:  { opacity: 0.5 },
  label: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  xpLabel: {
    fontWeight: '800',
    color: '#1A0A00',
  },
});
