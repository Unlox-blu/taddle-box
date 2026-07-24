import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../context/ThemeContext';
import { fontSizes, spacing, radii } from '../../theme';

const { width } = Dimensions.get('window');
const PAD_SIZE = Math.min(width * 0.8, 320);
const BTN_SIZE = PAD_SIZE / 3.5;

interface PinPadProps {
  onPinComplete: (pin: string) => void;
  onBiometric?: () => void;
  showBiometric?: boolean;
  length?: number;
  title?: string;
  subtitle?: string;
  error?: string;
  isVerifying?: boolean;
  resetKey?: string | number; // change this to force a pin reset
}

export default function PinPad({
  onPinComplete,
  onBiometric,
  showBiometric = false,
  length = 4,
  title = "Enter PIN",
  subtitle,
  error,
  isVerifying = false,
  resetKey,
}: PinPadProps) {
  const colors = useThemeColors();
  const [pin, setPin] = useState<string>('');

  // Reset pin when resetKey changes (e.g. moving to confirm step)
  useEffect(() => {
    setPin('');
  }, [resetKey]);

  useEffect(() => {
    // Clear pin on new error
    if (error) {
      setPin('');
    }
  }, [error]);

  useEffect(() => {
    if (pin.length === length) {
      onPinComplete(pin);
    }
  }, [pin]);

  const handlePress = (val: string) => {
    if (isVerifying) return;
    if (pin.length < length) {
      setPin(prev => prev + val);
    }
  };

  const handleBackspace = () => {
    if (isVerifying) return;
    setPin(prev => prev.slice(0, -1));
  };

  const renderDots = () => {
    const dots = [];
    for (let i = 0; i < length; i++) {
      const isFilled = i < pin.length;
      dots.push(
        <View
          key={i}
          style={[
            styles.dot,
            { borderColor: colors.primary },
            isFilled && { backgroundColor: colors.primary }
          ]}
        />
      );
    }
    return <View style={styles.dotsContainer}>{dots}</View>;
  };

  const renderButton = (val: string) => (
    <TouchableOpacity
      key={val}
      style={[styles.button, { backgroundColor: colors.bg.card }]}
      onPress={() => handlePress(val)}
      disabled={isVerifying}
    >
      <Text style={[styles.buttonText, { color: colors.text.primary }]}>{val}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
      {subtitle && <Text style={[styles.subtitle, { color: colors.text.muted }]}>{subtitle}</Text>}
      
      <View style={styles.dotsWrapper}>
        {renderDots()}
        {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}
      </View>

      <View style={styles.padContainer}>
        <View style={styles.row}>
          {['1', '2', '3'].map(renderButton)}
        </View>
        <View style={styles.row}>
          {['4', '5', '6'].map(renderButton)}
        </View>
        <View style={styles.row}>
          {['7', '8', '9'].map(renderButton)}
        </View>
        <View style={styles.row}>
          {showBiometric ? (
            <TouchableOpacity style={[styles.button, styles.actionBtn]} onPress={onBiometric} disabled={isVerifying}>
              <Ionicons name="finger-print" size={32} color={colors.primaryLight} />
            </TouchableOpacity>
          ) : <View style={styles.button} />}
          
          {renderButton('0')}
          
          <TouchableOpacity style={[styles.button, styles.actionBtn]} onPress={handleBackspace} disabled={isVerifying}>
            <Ionicons name="backspace-outline" size={28} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    marginBottom: spacing.xl,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  dotsWrapper: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: spacing.md,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  errorText: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  padContainer: {
    width: PAD_SIZE,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 28,
    fontWeight: '500',
  },
  actionBtn: {
    backgroundColor: 'transparent',
  }
});
