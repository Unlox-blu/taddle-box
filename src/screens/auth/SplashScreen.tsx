import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { colors, fontSizes } from '../../theme';
import type { AuthStackParamList } from '../../types';

const { width, height } = Dimensions.get('window');
type Props = NativeStackScreenProps<AuthStackParamList, 'Splash'>;

export default function SplashScreen({ navigation }: Props) {
  const opacity   = useRef(new Animated.Value(0)).current;
  const scale     = useRef(new Animated.Value(0.6)).current;
  const logoSlide = useRef(new Animated.Value(30)).current;
  const tagOpac   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let hasSeen = false;
    SecureStore.getItemAsync('hasSeenOnboarding').then(res => { hasSeen = !!res; }).catch(() => {});

    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale,  { toValue: 1,    useNativeDriver: true, tension: 50, friction: 7 }),
        Animated.timing(opacity, { toValue: 1,   duration: 600, useNativeDriver: true }),
        Animated.spring(logoSlide, { toValue: 0, useNativeDriver: true, tension: 60, friction: 8 }),
      ]),
      Animated.delay(200),
      Animated.timing(tagOpac, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(900),
    ]).start(() => {
      navigation.replace(hasSeen ? 'Welcome' : 'Onboarding');
    });
  }, []);

  return (
    <LinearGradient
      colors={['#070714', '#0f0a2e', '#070714']}
      style={styles.container}
    >
      <StatusBar style="light" />

      {/* Background glow */}
      <View style={styles.glow} />

      <Animated.View style={{ opacity, transform: [{ scale }, { translateY: logoSlide }], alignItems: 'center' }}>
        {/* Icon */}
        <LinearGradient
          colors={[colors.primary, colors.cyanDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconBox}
        >
          <Text style={styles.iconText}>⚡</Text>
        </LinearGradient>

        {/* Wordmark */}
        <Text style={styles.wordmark}>
          <Text style={styles.wordmarkWhite}>TADDL</Text>
          <Text style={styles.wordmarkGrad}>EBOX</Text>
        </Text>
      </Animated.View>

      <Animated.Text style={[styles.tagline, { opacity: tagOpac }]}>
        Play · Earn · Connect
      </Animated.Text>


    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 400, height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(124,58,237,0.12)',
    top: height * 0.2,
    alignSelf: 'center',
  },
  iconBox: {
    width: 88, height: 88,
    borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 12,
  },
  iconText: { fontSize: 44 },
  wordmark: {
    fontSize: fontSizes.display,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  wordmarkWhite: { color: '#fff' },
  wordmarkGrad:  { color: colors.primaryLight },
  tagline: {
    position: 'absolute',
    bottom: height * 0.18,
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    letterSpacing: 0.4,
    fontWeight: '600',
  },
  loader: {
    position: 'absolute',
    bottom: height * 0.1,
    flexDirection: 'row',
    gap: 8,
  },
  loaderDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
