/**
 * HistoryModal — displays match history.
 * Extracted from GamesScreen.tsx for modularity.
 */

import React, { useMemo } from "react";
import { View, ScrollView, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ModalHeader from "./ModalHeader";
import MatchRow from "./MatchRow";
import StateBlock from "../../common/StateBlock";
import { useThemeColors } from "../../../context/ThemeContext";
import { makeStyles } from "../../../screens/main/GamesScreen.styles";
import type { GameMatch } from "../../../context/GamesContext";

export default function HistoryModal({
  visible,
  matches,
  onClose,
}: {
  visible: boolean;
  matches: GameMatch[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalShell, { paddingTop: insets.top || 16 }]}>
        <ModalHeader title="Match History" onClose={onClose} />
        <ScrollView contentContainerStyle={styles.modalContent}>
          {matches.map((match) => (
            <MatchRow key={match.id} match={match} />
          ))}
          {matches.length === 0 && (
            <StateBlock
              card
              title="No matches yet"
              subtitle="Your saved game sessions will appear here."
            />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
