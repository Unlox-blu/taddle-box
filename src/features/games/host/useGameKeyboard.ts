/**
 * useGameKeyboard — tracks the soft keyboard height for game hosts.
 *
 * Games (and the GameStageShell) use this to shrink the play area upward
 * when the keyboard opens — especially important on iOS where the keyboard
 * overlays content instead of resizing the window.
 *
 * Uses `keyboardWillShow` on iOS for smooth pre-emptive reflow, and
 * `keyboardDidShow` on Android (where willShow is unreliable).
 */

import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

export function useGameKeyboard() {
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const sub1 = Keyboard.addListener(showEvt, (e) =>
      setKbHeight(e.endCoordinates?.height || 0),
    );
    const sub2 = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, []);

  return kbHeight;
}
