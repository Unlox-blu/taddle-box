import React, { useState } from 'react';
import {
  View, TextInput, Text, TouchableOpacity,
  StyleSheet, ViewStyle, TextInputProps, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, fontSizes, spacing } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';

interface InputProps extends TextInputProps {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
  onPress?: () => void;
}

export default function Input({
  label, icon, error, rightIcon, onRightIconPress,
  containerStyle, secureTextEntry, onPress, ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const [secure, setSecure] = useState(secureTextEntry ?? false);
  const themeColors = useThemeColors();

  const isPassword = secureTextEntry;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && <Text style={[styles.label, { color: themeColors.text.secondary }]}>{label}</Text>}
      <View style={[
        styles.container,
        { backgroundColor: themeColors.bg.card, borderColor: themeColors.border },
        focused && { borderColor: themeColors.primary, backgroundColor: 'rgba(124,58,237,0.08)' },
        !!error && { borderColor: themeColors.danger },
      ]}>
        {onPress ? (
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={onPress} activeOpacity={0.7}>
            {icon && (
              <Ionicons
                name={icon}
                size={18}
                color={focused ? themeColors.primaryLight : themeColors.text.muted}
                style={styles.leftIcon}
              />
            )}
            <View pointerEvents="none" style={{ flex: 1 }}>
              <TextInput
                style={[styles.input, { color: themeColors.text.primary }]}
                placeholderTextColor={themeColors.text.muted}
                editable={false}
                {...rest}
              />
            </View>
          </TouchableOpacity>
        ) : (
          <>
            {icon && (
              <Ionicons
                name={icon}
                size={18}
                color={focused ? themeColors.primaryLight : themeColors.text.muted}
                style={styles.leftIcon}
              />
            )}
            <TextInput
              style={[styles.input, { color: themeColors.text.primary }]}
              placeholderTextColor={themeColors.text.muted}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              secureTextEntry={secure}
              {...rest}
            />
          </>
        )}
        {isPassword && (
          <TouchableOpacity onPress={() => setSecure(v => !v)} style={styles.rightIconBtn}>
            <Ionicons
              name={secure ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={themeColors.text.muted}
            />
          </TouchableOpacity>
        )}
        {rightIcon && !isPassword && (
          <TouchableOpacity onPress={onRightIconPress} style={styles.rightIconBtn} disabled={rightIcon === 'sync'}>
            {rightIcon === 'sync' ? (
              <ActivityIndicator size="small" color={themeColors.primaryLight} />
            ) : (
              <Ionicons name={rightIcon} size={18} color={themeColors.text.muted} />
            )}
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={[styles.error, { color: themeColors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 50,
  },
  leftIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    fontSize: fontSizes.md,
    paddingVertical: 12,
  },
  rightIconBtn: { padding: 4 },
  error: {
    fontSize: fontSizes.xs,
    marginTop: 4,
    marginLeft: 2,
  },
});
