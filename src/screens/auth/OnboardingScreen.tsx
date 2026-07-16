import React, { useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Dimensions, Animated, ListRenderItem,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { colors, radii, fontSizes, spacing } from '../../theme';
import Button from '../../components/common/Button';
import type { AuthStackParamList, OnboardingSlide } from '../../types';
const ONBOARDING_SLIDES: OnboardingSlide[] = [
  { id: '1', title: 'Welcome', subtitle: 'Join the community', emoji: '👋', gradient: ['#4ade80', '#3b82f6'] },
  { id: '2', title: 'Connect', subtitle: 'Meet new people', emoji: '🤝', gradient: ['#f472b6', '#a855f7'] }
];

const { width, height } = Dimensions.get('window');
type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props) {
  const [index, setIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const next = async () => {
    if (index < ONBOARDING_SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      await SecureStore.setItemAsync('hasSeenOnboarding', 'true');
      navigation.replace('Welcome');
    }
  };

  const skip = async () => {
    await SecureStore.setItemAsync('hasSeenOnboarding', 'true');
    navigation.replace('Welcome');
  };

  const renderItem: ListRenderItem<OnboardingSlide> = ({ item }) => (
    <LinearGradient
      colors={item.gradient as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.slide}
    >
      {/* Glow */}
      <View style={styles.slideGlow} />

      {/* Emoji illustration */}
      <View style={styles.emojiWrap}>
        <LinearGradient
          colors={[colors.primary + '33', colors.cyan + '22']}
          style={styles.emojiBox}
        >
          <Text style={styles.emoji}>{item.emoji}</Text>
        </LinearGradient>
      </View>

      {/* Text */}
      <View style={styles.textWrap}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle}>{item.subtitle}</Text>
      </View>
    </LinearGradient>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Skip */}
      <TouchableOpacity style={styles.skipBtn} onPress={skip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <Animated.FlatList
        ref={flatRef}
        data={ONBOARDING_SLIDES}
        renderItem={renderItem}
        keyExtractor={i => i.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={e => {
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
      />

      {/* Bottom controls */}
      <View style={styles.controls}>
        {/* Dots */}
        <View style={styles.dots}>
          {ONBOARDING_SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const dotWidth = scrollX.interpolate({
              inputRange, outputRange: [8, 24, 8], extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width: dotWidth, opacity }]}
              />
            );
          })}
        </View>

        {/* Next / Get Started */}
        <Button
          label={index === ONBOARDING_SLIDES.length - 1 ? 'Get Started →' : 'Next →'}
          onPress={next}
          variant="primary"
          fullWidth
        />

        {index === ONBOARDING_SLIDES.length - 1 && (
          <TouchableOpacity style={styles.loginLink} onPress={() => navigation.replace('Login')}>
            <Text style={styles.loginLinkText}>
              Already have an account? <Text style={{ color: colors.primaryLight }}>Log in</Text>
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.base },
  skipBtn: {
    position: 'absolute', top: 56, right: 24,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: radii.full,
  },
  skipText: { fontSize: fontSizes.sm, color: colors.text.secondary, fontWeight: '600' },
  slide: {
    width, height: height * 0.75,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  slideGlow: {
    position: 'absolute',
    width: 300, height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(124,58,237,0.12)',
    top: height * 0.05,
  },
  emojiWrap: { marginBottom: 40 },
  emojiBox: {
    width: 140, height: 140,
    borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emoji: { fontSize: 72 },
  textWrap: { alignItems: 'center', gap: 14 },
  title: {
    fontSize: fontSizes.h2,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 22,
  },
  controls: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 36,
    justifyContent: 'space-between',
  },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 16 },
  dot:  { height: 8, borderRadius: 4, backgroundColor: colors.primaryLight },
  loginLink: { alignItems: 'center', marginTop: 14 },
  loginLinkText: { fontSize: fontSizes.sm, color: colors.text.muted },
});
