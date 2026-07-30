import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Dimensions, TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../context/ThemeContext';
import { fontSizes, radii, spacing } from '../../theme';

const { height: SCREEN_H } = Dimensions.get('window');

interface PostMenuOption {
  icon: string;
  label: string;
  color?: string;
  onPress: () => void;
}

interface PostMenuSheetProps {
  visible: boolean;
  onClose: () => void;
  options: PostMenuOption[];
}

export default function PostMenuSheet({ visible, onClose, options }: PostMenuSheetProps) {
  const colors = useThemeColors();
  const slideAnim = useRef(new Animated.Value(200)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 200,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(0,0,0,0.5)', opacity: backdropOpacity },
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.bg.card,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingBottom: 34,
            transform: [{ translateY: slideAnim }],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.15,
            shadowRadius: 20,
            elevation: 20,
          },
        ]}
      >
        {/* Handle */}
        <View
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
            alignSelf: 'center',
            marginTop: 12,
            marginBottom: 8,
          }}
        />

        {options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => {
              onClose();
              // Small delay so sheet closes before action
              setTimeout(opt.onPress, 200);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              paddingHorizontal: spacing.xl,
              paddingVertical: 16,
              borderBottomWidth: i < options.length - 1 ? 1 : 0,
              borderBottomColor: colors.border,
            }}
            activeOpacity={0.7}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: opt.color
                  ? `${opt.color}18`
                  : colors.bg.elevated,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name={opt.icon as any}
                size={18}
                color={opt.color || colors.text.secondary}
              />
            </View>
            <Text
              style={{
                fontSize: fontSizes.md,
                fontWeight: '600',
                color: opt.color || colors.text.primary,
                flex: 1,
              }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  );
}
