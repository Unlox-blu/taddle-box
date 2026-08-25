/**
 * GameSettingsModal — game-specific settings (sound, haptics).
 * Extracted from GamesScreen.tsx for modularity.
 */

import React, { useMemo } from "react";
import { View, Text, ScrollView, Modal, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ModalHeader from "./ModalHeader";
import { useThemeColors } from "../../../context/ThemeContext";
import { makeStyles } from "../../../screens/main/GamesScreen.styles";
import { useGameSoundPrefs } from "../../../services/gameSound";

export default function GameSettingsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { soundEnabled, hapticsEnabled, setSoundEnabled, setHapticsEnabled } =
    useGameSoundPrefs();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalShell, { paddingTop: insets.top || 16 }]}>
        <ModalHeader title="Game Settings" onClose={onClose} />
        <ScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.settingsSection}>Audio & Feedback</Text>
          <View style={styles.settingsCard}>
            <View style={styles.settingsRow}>
              <View style={styles.settingsRowLeft}>
                <Ionicons
                  name="volume-high-outline"
                  size={20}
                  color={colors.primaryLight}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingsRowLabel}>Sound Effects</Text>
                  <Text style={styles.settingsRowDesc}>
                    Countdown beeps and game sounds
                  </Text>
                </View>
              </View>
              <Switch
                value={soundEnabled}
                onValueChange={(v) => setSoundEnabled(v)}
                trackColor={{ false: colors.bg.elevated, true: colors.primary }}
                thumbColor={soundEnabled ? "#fff" : colors.text.muted}
              />
            </View>
            <View
              style={[
                styles.settingsRow,
                { borderTopWidth: 1, borderTopColor: colors.border },
              ]}
            >
              <View style={styles.settingsRowLeft}>
                <Ionicons
                  name="phone-portrait-outline"
                  size={20}
                  color={colors.primaryLight}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingsRowLabel}>Haptics</Text>
                  <Text style={styles.settingsRowDesc}>
                    Vibration feedback while playing
                  </Text>
                </View>
              </View>
              <Switch
                value={hapticsEnabled}
                onValueChange={(v) => setHapticsEnabled(v)}
                trackColor={{ false: colors.bg.elevated, true: colors.primary }}
                thumbColor={hapticsEnabled ? "#fff" : colors.text.muted}
              />
            </View>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}
