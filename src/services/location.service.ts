import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { userService } from './user.service';

const LAST_LOC_KEY = '@taddle_last_location_capture';
// Don't hammer the API — capture at most once per 5 minutes on foreground.
const THROTTLE_MS = 5 * 60 * 1000;

export const locationService = {
  /**
   * Captures the user's current location and stores it server-side, but ONLY
   * if they already granted location permission (we never prompt here). Safe
   * to call on every app foreground — it self-throttles.
   */
  async captureIfPermitted(force = false) {
    try {
      if (!force) {
        const raw = await AsyncStorage.getItem(LAST_LOC_KEY);
        if (raw && Date.now() - Number(raw) < THROTTLE_MS) return;
      }
      // Never request permission from this flow — respect the user's choice.
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Reverse-geocode to a free-text place name ("Bengaluru, Karnataka")
      // so geo captures carry a human-readable place alongside lat/lng.
      // Best-effort — offline / quota errors fall back to null place.
      let place: string | undefined;
      try {
        const [addr] = await Location.reverseGeocodeAsync(pos.coords);
        if (addr) {
          place = [addr.city, addr.region, addr.country]
            .filter(Boolean)
            .join(", ");
        }
      } catch (e) {
        place = undefined;
      }

      await userService.recordLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        place,
      });
      await AsyncStorage.setItem(LAST_LOC_KEY, String(Date.now()));
    } catch (e) {
      // Offline / permission revoked mid-flight — never block the app.
      console.warn('Location capture skipped', e);
    }
  },
};
