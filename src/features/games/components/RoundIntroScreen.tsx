import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface RoundIntroScreenProps {
  gameName: string;
  roundNumber: number;
  totalRounds: number;
  instruction: string;
}

export default function RoundIntroScreen({
  gameName,
  roundNumber,
  totalRounds,
  instruction,
}: RoundIntroScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.gameName}>{gameName.toUpperCase()}</Text>
      <Text style={styles.roundNumber}>ROUND {roundNumber}</Text>
      <Text style={styles.roundTotal}>OF {totalRounds}</Text>
      <View style={styles.rule} />
      <Text style={styles.instruction}>{instruction}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05050F",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  gameName: {
    color: "#A78BFA",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 2,
  },
  roundNumber: {
    color: "#F8FAFC",
    fontSize: 42,
    fontWeight: "900",
    marginTop: 12,
  },
  roundTotal: {
    color: "#64748B",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 2,
  },
  rule: {
    width: 56,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#7C3AED",
    marginVertical: 22,
  },
  instruction: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
  },
});
