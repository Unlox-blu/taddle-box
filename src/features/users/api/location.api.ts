import AsyncStorage from '@react-native-async-storage/async-storage';
import { getForegroundPosition } from '../../../infrastructure/location/location';
import { userService } from './users.api';
import { warn } from '../../../infrastructure/logging/logger';

const LAST_LOC_KEY = '@taddle_last_location_capture';
// Don't hammer the API — capture at most once per 5 minutes on foreground.
const THROTTLE_MS = 5 * 60 * 1000;

/**
 * Captures the user's current location (via the infrastructure/location
 * abstraction, which never prompts) and stores it server-side. Safe to call on
 * every app foreground — it self-throttles and silently no-ops when the user
 * hasn't granted location permission.
 */
export const locationService = {
  async captureIfPermitted(force = false) {
    try {
      if (!force) {
        const raw = await AsyncStorage.getItem(LAST_LOC_KEY);
        if (raw && Date.now() - Number(raw) < THROTTLE_MS) return;
      }

      const pos = await getForegroundPosition();
      if (!pos) return;

      await userService.recordLocation({
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy: pos.accuracy,
        place: pos.place,
      });
      await AsyncStorage.setItem(LAST_LOC_KEY, String(Date.now()));
    } catch (e) {
      // Offline / permission revoked mid-flight — never block the app.
      warn('Location capture skipped', e);
    }
  },
};
