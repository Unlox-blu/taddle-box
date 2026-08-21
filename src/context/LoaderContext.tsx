import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { View, Animated, StyleSheet } from "react-native";
import LottieView from "lottie-react-native";
import {
  getCachedLottieSync,
  getCachedLottie,
  S3_APP_ICON_LOTTIE_URL,
} from "../services/lottie.service";

/**
 * Centralized branded loader — always mounted, never unmounts.
 * Call `show()` from anywhere to display instantly (fade in).
 * Call `hide()` when done (fade out).
 *
 * Because the component stays in the tree, the Lottie animation and its
 * native view are pre-warmed — zero layout delay on every show().
 */
interface LoaderContextType {
  show: () => void;
  hide: () => void;
}

const LoaderContext = createContext<LoaderContextType>({
  show: () => {},
  hide: () => {},
});

export function useLoader() {
  return useContext(LoaderContext);
}

export function LoaderProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const [lottieSource, setLottieSource] = useState<any>(
    getCachedLottieSync(S3_APP_ICON_LOTTIE_URL)
  );

  // Pre-warm the Lottie source on mount
  React.useEffect(() => {
    if (!lottieSource) {
      getCachedLottie(S3_APP_ICON_LOTTIE_URL).then((data) => {
        if (data) setLottieSource(data);
      });
    }
  }, []);

  const show = useCallback(() => {
    setVisible(true);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  const hide = useCallback(() => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  }, [opacity]);

  return (
    <LoaderContext.Provider value={{ show, hide }}>
      {children}
      {/* Always mounted overlay — fades in/out without unmounting */}
      <Animated.View
        pointerEvents={visible ? "auto" : "none"}
        style={[styles.overlay, { opacity }]}
      >
        <View style={styles.container}>
          {lottieSource ? (
            <LottieView
              source={lottieSource}
              autoPlay
              loop
              cacheComposition
              resizeMode="cover"
              style={styles.lottie}
            />
          ) : (
            /* Static fallback while Lottie downloads — still instant */
            <View style={styles.staticFallback}>
              <Animated.Image
                source={require("../../assets/icon.png")}
                style={styles.staticImage}
              />
            </View>
          )}
        </View>
      </Animated.View>
    </LoaderContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#121216",
    zIndex: 9999,
    elevation: 9999,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  lottie: {
    width: 80,
    height: 80,
  },
  staticFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: "hidden",
  },
  staticImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
});
