import React, { useState } from 'react';
import {
  View, TextInput, Text, TouchableOpacity,
  StyleSheet, ViewStyle, TextInputProps, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, fontSizes, spacing } from '../../theme';

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

  const isPassword = secureTextEntry;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[
        styles.container,
        focused && styles.containerFocused,
        !!error && styles.containerError,
      ]}>
        {onPress ? (
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={onPress} activeOpacity={0.7}>
            {icon && (
              <Ionicons
                name={icon}
                size={18}
                color={focused ? colors.primaryLight : colors.text.muted}
                style={styles.leftIcon}
              />
            )}
            <View pointerEvents="none" style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                placeholderTextColor={colors.text.muted}
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
                color={focused ? colors.primaryLight : colors.text.muted}
                style={styles.leftIcon}
              />
            )}
            <TextInput
              style={styles.input}
              placeholderTextColor={colors.text.muted}
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
              color={colors.text.muted}
            />
          </TouchableOpacity>
        )}
        {rightIcon && !isPassword && (
          <TouchableOpacity onPress={onRightIconPress} style={styles.rightIconBtn} disabled={rightIcon === 'sync'}>
            {rightIcon === 'sync' ? (
              <ActivityIndicator size="small" color={colors.primaryLight} />
            ) : (
              <Ionicons name={rightIcon} size={18} color={colors.text.muted} />
            )}
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 50,
  },
  containerFocused: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(124,58,237,0.08)',
  },
  containerError: {
    borderColor: colors.danger,
  },
  leftIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.text.primary,
    paddingVertical: 12,
  },
  rightIconBtn: { padding: 4 },
  error: {
    fontSize: fontSizes.xs,
    color: colors.danger,
    marginTop: 4,
    marginLeft: 2,
  },
});
