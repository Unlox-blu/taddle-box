/**
 * location.native.ts — native twin for the location abstraction.
 *
 * Device-level primitives only (expo-location). Never prompts for permission —
 * callers use these after the user has already granted it. Web builds resolve
 * to location.web.ts via Metro's platform-extension resolution.
 */
import * as Location from "expo-location";
import { warn } from "../logging/logger";

export type GeoPosition = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  /** Human-readable place ("Bengaluru, Karnataka") — best-effort. */
  place?: string;
};

/**
 * Returns the device's current position if (and only if) the user already
 * granted foreground location permission. Returns null when permission was
 * never granted, was revoked, or the capture failed — never throws.
 */
export async function getForegroundPosition(): Promise<GeoPosition | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    // Reverse-geocode to a free-text place name so captures carry a readable
    // place alongside lat/lng. Best-effort — offline/quota errors → null place.
    let place: string | undefined;
    try {
      const [addr] = await Location.reverseGeocodeAsync(pos.coords);
      if (addr) {
        place = [addr.city, addr.region, addr.country]
          .filter(Boolean)
          .join(", ");
      }
    } catch {
      place = undefined;
    }

    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? undefined,
      place,
    };
  } catch (e) {
    warn("Location capture skipped", e);
    return null;
  }
}
