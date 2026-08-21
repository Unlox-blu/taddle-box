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
  // Always start muted on a fresh app launch
  const [mediaSoundEnabled, setMediaSoundEnabled] = useState(false);

  const toggleMediaSound = useCallback(() => {
    setMediaSoundEnabled((prev) => !prev);
  }, []);

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
