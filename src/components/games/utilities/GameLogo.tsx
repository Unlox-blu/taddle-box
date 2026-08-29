import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

export type LogoGame = {
  name: string;
  gradient: [string, string] | string[];
  imageUrl?: string | null;
  /** Branded logo asset (require'd PNG) — rendered in place of the monogram tile */
  logo?: any;
};

const DEFAULT_GRADIENT: [string, string] = ["#7C3AED", "#0891B2"];

export default function GameLogo({
  game,
  size = 72,
  radius,
  style,
}: {
  game: LogoGame;
  size?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const r = radius ?? Math.round(size * 0.26);
  // Generate monogram from game name — no hardcoded slug lookups.
  const letters =
    (game.name || "GM")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") ||
    "GM";
  const icon = "game-controller";
  const gradient =
    game.gradient?.length === 2
      ? (game.gradient as [string, string])
      : DEFAULT_GRADIENT;

  // Resolve image URL from either field — backend sends 'thumbnail',
  // frontend type uses 'imageUrl'. Accept both.
  const imageUri = game.imageUrl || (game as any).thumbnail || null;

  // Branded per-game logo wins over the remote image and the monogram tile.
  // The tile View owns the border/elevation/clipping; the Image fills it.
  if (game.logo) {
    return (
      <View
        style={[
          styles.tile,
          { width: size, height: size, borderRadius: r },
          style,
        ]}
      >
        <Image
          source={game.logo}
          style={{ width: size, height: size, borderRadius: r }}
          contentFit="cover"
        />
      </View>
    );
  }

  if (imageUri) {
    return (
      <View style={[{ width: size, height: size, borderRadius: r }, style]}>
        <Image
          source={{ uri: imageUri }}
          style={{ width: size, height: size, borderRadius: r }}
          contentFit="cover"
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: r },
        style,
      ]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.shine} />
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", marginBottom: size * 0.1 }}>
        <Text style={[styles.letters, { fontSize: size * 0.3 }]}>{letters}</Text>
      </View>
      <View
        style={[
          styles.iconBadge,
          {
            bottom: size * 0.07,
            right: size * 0.07,
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: size * 0.15,
          },
        ]}
      >
        <Ionicons name={icon} size={size * 0.17} color="#fff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "#0F172A",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  shine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "55%",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  letters: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 1.5,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  iconBadge: {
    position: "absolute",
    backgroundColor: "rgba(5,5,15,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
});
