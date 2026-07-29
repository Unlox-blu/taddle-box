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
  forceDark?: boolean;
}

export default function Input({
  label, icon, error, rightIcon, onRightIconPress,
  containerStyle, secureTextEntry, onPress, style, placeholderTextColor,
  selectionColor, cursorColor, forceDark = false, ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const [secure, setSecure] = useState(secureTextEntry ?? false);
  const themeColors = useThemeColors();
  const palette = forceDark ? colors : themeColors;

  const isPassword = secureTextEntry;
  const inputBg = palette.bg.card;
  const isDarkInput = /^#([0-9a-f]{6})$/i.test(inputBg)
    ? parseInt(inputBg.slice(1, 3), 16) * 0.299 +
        parseInt(inputBg.slice(3, 5), 16) * 0.587 +
        parseInt(inputBg.slice(5, 7), 16) * 0.114 < 140
    : palette.text.primary === colors.text.primary;
  const inputTextColor = isDarkInput ? colors.text.primary : palette.text.primary;
  const inputPlaceholderColor = isDarkInput ? colors.text.secondary : palette.text.muted;
  const inputCursorColor = isDarkInput ? colors.primaryLight : palette.primaryLight;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && <Text style={[styles.label, { color: palette.text.secondary }]}>{label}</Text>}
      <View style={[
        styles.container,
        { backgroundColor: inputBg, borderColor: palette.border },
        focused && { borderColor: palette.primary },
        !!error && { borderColor: palette.danger },
      ]}>
        {onPress ? (
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={onPress} activeOpacity={0.7}>
            {icon && (
              <Ionicons
                name={icon}
                size={18}
                color={focused ? palette.primaryLight : palette.text.muted}
                style={styles.leftIcon}
              />
            )}
            <View pointerEvents="none" style={{ flex: 1 }}>
              <TextInput
                style={[styles.input, style, { color: inputTextColor }]}
                placeholderTextColor={placeholderTextColor ?? inputPlaceholderColor}
                selectionColor={selectionColor ?? inputCursorColor}
                cursorColor={cursorColor ?? inputCursorColor}
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
                color={focused ? palette.primaryLight : palette.text.muted}
                style={styles.leftIcon}
              />
            )}
            <TextInput
              style={[styles.input, style, { color: inputTextColor }]}
              placeholderTextColor={placeholderTextColor ?? inputPlaceholderColor}
              selectionColor={selectionColor ?? inputCursorColor}
              cursorColor={cursorColor ?? inputCursorColor}
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
              color={palette.text.muted}
            />
          </TouchableOpacity>
        )}
        {rightIcon && !isPassword && (
          <TouchableOpacity onPress={onRightIconPress} style={styles.rightIconBtn} disabled={rightIcon === 'sync'}>
            {rightIcon === 'sync' ? (
              <ActivityIndicator size="small" color={palette.primaryLight} />
            ) : (
              <Ionicons name={rightIcon} size={18} color={palette.text.muted} />
            )}
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
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
