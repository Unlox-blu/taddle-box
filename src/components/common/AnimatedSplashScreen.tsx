import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import LottieView from "lottie-react-native";
import { getCachedLottie, getCachedLottieSync, S3_APP_ICON_LOTTIE_URL } from "../../services/lottie.service";
import { colors, fontSizes } from '../../theme';

const { height } = Dimensions.get('window');

type Props = {
  onAnimationFinish: () => void;
};

export default function AnimatedSplashScreen({ onAnimationFinish }: Props) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const logoSlide = useRef(new Animated.Value(20)).current;
  const tagOpac = useRef(new Animated.Value(0)).current;

  const [lottieSource, setLottieSource] = React.useState<any>(getCachedLottieSync(S3_APP_ICON_LOTTIE_URL));
  const finishedRef = useRef(false);

  const handleFinish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onAnimationFinish();
  };

  useEffect(() => {
    getCachedLottie(S3_APP_ICON_LOTTIE_URL).then((animData) => {
      if (animData) setLottieSource(animData);
    });

    // Run the text and container intro animations
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale,  { toValue: 1,    useNativeDriver: true, tension: 80, friction: 5 }),
        Animated.timing(opacity, { toValue: 1,   duration: 250, useNativeDriver: true }),
        Animated.spring(logoSlide, { toValue: 0, useNativeDriver: true, tension: 80, friction: 5 }),
      ]),
      Animated.timing(tagOpac, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    // Safety fallback: only used if Lottie totally fails to load or parse
    const fallbackTimer = setTimeout(() => {
      handleFinish();
    }, 6000);

    return () => clearTimeout(fallbackTimer);
  }, []);

  // Track the exact duration of the Lottie animation directly from its JSON data
  useEffect(() => {
    if (lottieSource && lottieSource.op && lottieSource.fr) {
      const inFrame = lottieSource.ip || 0;
      const outFrame = lottieSource.op;
      const frameRate = lottieSource.fr;
      
      // Use calculation + 1s buffer as a fallback if onAnimationFinish fails
      const fallbackDurationMs = (((outFrame - inFrame) / frameRate) * 1000) + 1000;
      
      const timer = setTimeout(() => {
        handleFinish();
      }, fallbackDurationMs);
      
      return () => clearTimeout(timer);
    }
  }, [lottieSource]);

  return (
    <LinearGradient
      colors={['#070714', '#0f0a2e', '#070714']}
      style={styles.container}
    >
      <StatusBar style="light" />

      {/* Background glow */}
      <View style={styles.glow} />

      <Animated.View style={{ opacity, transform: [{ scale }, { translateY: logoSlide }], alignItems: 'center' }}>
        {lottieSource ? (
          <View style={{ width: 120, height: 120, borderRadius: 60, overflow: 'hidden', backgroundColor: 'transparent' }}>
            <LottieView
              source={lottieSource}
              autoPlay
              loop={false}
              renderMode="SOFTWARE"
              cacheComposition={false}
              style={{ width: '100%', height: '100%' }}
              onAnimationFinish={handleFinish}
            />
          </View>
        ) : (
          <Image 
            source={require('../../../TaddleBox_Logo.png')} 
            style={{ width: 120, height: 120, borderRadius: 60, resizeMode: 'cover', alignSelf: 'center' }} 
          />
        )}
      </Animated.View>

      <Animated.Text style={[styles.tagline, { opacity: tagOpac }]}>
        Play · Earn · Connect
      </Animated.Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999, // Ensure it sits on top of navigators
    elevation: 9999, // Crucial for Android to render over native stack
  },
  glow: {
    position: 'absolute',
    width: 400, height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(124,58,237,0.12)',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -200 }, { translateY: -200 }],
  },
  tagline: {
    position: 'absolute',
    bottom: height * 0.18,
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    letterSpacing: 0.4,
    fontWeight: '600',
  },
});
