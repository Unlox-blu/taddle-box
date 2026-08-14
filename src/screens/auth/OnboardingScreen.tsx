import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Dimensions, Animated, ListRenderItem, Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import LottieView from "lottie-react-native";
import { getCachedLottie, getCachedLottieSync, S3_APP_ICON_LOTTIE_URL } from "../../services/lottie.service";

import { colors, radii, fontSizes, spacing } from '../../theme';
import Button from '../../components/common/Button';
import type { AuthStackParamList } from '../../types';
import { useAuth } from '../../context/AuthContext';

// Updated Onboarding Slide structure
export type OnboardingSlide = {
  id: string;
  title: string;
  subtitle: string;
  icon?: keyof typeof Ionicons.glyphMap;
  isLottie?: boolean;
};

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  { 
    id: '1', 
    title: 'Welcome to TaddleBox', 
    subtitle: 'The place to rant, spill, and overshare with absolutely zero regrets.', 
    isLottie: true
  },
  { 
    id: '2', 
    title: 'Express Freely', 
    subtitle: 'Share your true thoughts anonymously or build your persona without the pressure.', 
    icon: 'megaphone-outline'
  },
  { 
    id: '3', 
    title: 'Connect & Engage', 
    subtitle: 'React, reply, and build authentic connections through unfiltered conversations.', 
    icon: 'chatbubbles-outline'
  }
];

const { width, height } = Dimensions.get('window');
type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props) {
  const { setHasSeenOnboarding } = useAuth();
  const [index, setIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [lottieSource, setLottieSource] = useState<any>(getCachedLottieSync(S3_APP_ICON_LOTTIE_URL));

  useEffect(() => {
    getCachedLottie(S3_APP_ICON_LOTTIE_URL).then((animData) => {
      if (animData) setLottieSource(animData);
    });
  }, []);

  const next = async () => {
    if (index < ONBOARDING_SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      await SecureStore.setItemAsync('hasSeenOnboarding', 'true');
      setHasSeenOnboarding(true);
      navigation.replace('Welcome');
    }
  };

  const skip = async () => {
    await SecureStore.setItemAsync('hasSeenOnboarding', 'true');
    setHasSeenOnboarding(true);
    navigation.replace('Welcome');
  };

  const renderItem: ListRenderItem<OnboardingSlide> = ({ item }) => (
    <View style={styles.slide}>
      {/* Glassmorphic Card */}
      <View style={styles.glassCard}>
        {/* Glow behind the icon */}
        <View style={styles.iconGlow} />

        <View style={styles.iconContainer}>
          {item.isLottie ? (
            lottieSource ? (
              <View style={{ width: 140, height: 140, borderRadius: 70, overflow: 'hidden', backgroundColor: 'transparent' }}>
                <LottieView
                  source={lottieSource}
                  autoPlay
                  loop
                  renderMode="SOFTWARE"
                  cacheComposition={false}
                  style={{ width: '100%', height: '100%' }}
                />
              </View>
            ) : (
              <Image 
                source={require('../../../TaddleBox_Logo.png')} 
                style={{ width: 140, height: 140, borderRadius: 70, resizeMode: 'cover' }} 
              />
            )
          ) : (
            <Ionicons name={item.icon!} size={80} color={colors.primaryLight} />
          )}
        </View>

        <View style={styles.textWrap}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>{item.subtitle}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Ambient Background Glows */}
      <View style={[styles.ambientGlow, { top: -100, left: -100, backgroundColor: 'rgba(124,58,237,0.15)' }]} />
      <View style={[styles.ambientGlow, { bottom: -150, right: -100, backgroundColor: 'rgba(6,182,212,0.1)' }]} />

      {/* Skip Button */}
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
        {/* Dynamic Pill Dots */}
        <View style={styles.dots}>
          {ONBOARDING_SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const dotWidth = scrollX.interpolate({
              inputRange, outputRange: [8, 32, 8], extrapolate: 'clamp',
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

        <Button
          label={index === ONBOARDING_SLIDES.length - 1 ? 'Get Started' : 'Continue'}
          onPress={next}
          variant="primary"
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.bg.base 
  },
  ambientGlow: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
  },
  skipBtn: {
    position: 'absolute', 
    top: 56, 
    right: 24,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 8, 
    paddingHorizontal: 16,
    borderRadius: radii.full,
  },
  skipText: { 
    fontSize: fontSizes.sm, 
    color: colors.text.secondary, 
    fontWeight: '600' 
  },
  slide: {
    width, 
    height: height * 0.85,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  glassCard: {
    width: '100%',
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    borderRadius: radii['2xl'],
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconGlow: {
    position: 'absolute',
    top: 40,
    width: 140, 
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(124,58,237,0.2)',
  },
  iconContainer: {
    width: 160, 
    height: 160,
    borderRadius: 80,
    alignItems: 'center', 
    justifyContent: 'center',
    marginBottom: 32,
  },
  textWrap: { 
    alignItems: 'center', 
    gap: 16 
  },
  title: {
    fontSize: fontSizes.h2,
    fontWeight: '800',
    color: colors.text.primary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 48,
    justifyContent: 'flex-end',
  },
  dots: { 
    flexDirection: 'row', 
    gap: 8, 
    justifyContent: 'center', 
    marginBottom: 32 
  },
  dot: { 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: colors.primaryLight 
  },
});
