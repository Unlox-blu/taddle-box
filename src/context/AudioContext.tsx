import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'taddle_media_sound_enabled';

interface AudioContextType {
  /** Whether content audio is enabled (user preference). Persisted across sessions. */
  mediaSoundEnabled: boolean;
  /** Toggle the user's media sound preference. */
  toggleMediaSound: () => void;
  /** Explicitly set media sound. */
  setMediaSoundEnabled: (enabled: boolean) => void;
}

const AudioContext = createContext<AudioContextType>({
  mediaSoundEnabled: false,
  toggleMediaSound: () => {},
  setMediaSoundEnabled: () => {},
});

export function AudioProvider({ children }: { children: React.ReactNode }) {
  // User preference — starts muted (false), persisted in SecureStore
  const [mediaSoundEnabled, setMediaSoundEnabledState] = useState(false);

  // Load persisted preference on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (stored !== null) {
          setMediaSoundEnabledState(stored === 'true');
        }
      } catch {}
    })();
  }, []);

  // Persist preference when it changes
  const setMediaSoundEnabled = useCallback((enabled: boolean) => {
    setMediaSoundEnabledState(enabled);
    SecureStore.setItemAsync(STORAGE_KEY, String(enabled)).catch(() => {});
  }, []);

  const toggleMediaSound = useCallback(() => {
    setMediaSoundEnabled(!mediaSoundEnabled);
  }, [mediaSoundEnabled, setMediaSoundEnabled]);

  return (
    <AudioContext.Provider
      value={{
        mediaSoundEnabled,
        toggleMediaSound,
        setMediaSoundEnabled,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  return useContext(AudioContext);
}
