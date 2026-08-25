/**
 * ModalHeader — shared modal header with close button.
 * Extracted from GamesScreen.tsx for modularity.
 */

import React, { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "../../../context/ThemeContext";
import { makeStyles } from "../../../screens/main/GamesScreen.styles";

export default function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.modalHeader}>
      <TouchableOpacity onPress={onClose}>
        <Ionicons name="close" size={24} color={colors.text.secondary} />
      </TouchableOpacity>
      <Text style={styles.modalTitle}>{title}</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}
