/**
 * location.web.ts — web twin for the location abstraction.
 *
 * Browser geolocation via navigator.geolocation. Mirrors the native twin's
 * surface (never prompts, returns null when unpermitted/unavailable); web has
 * no reverse-geocoding, so `place` is always undefined.
 */
import { warn } from "../logging/logger";

export type GeoPosition = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  place?: string;
};

function permissionGranted(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (navigator.permissions?.query) {
        navigator.permissions
          .query({ name: "geolocation" })
          .then((s) => resolve(s.state === "granted"))
          .catch(() => resolve(false));
      } else {
        // Permissions API unavailable — try a passive check below.
        resolve(true);
      }
    } catch {
      resolve(false);
    }
  });
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 15000,
    });
  });
}

/**
 * Returns the browser's current position only if geolocation permission was
 * already granted. Returns null when it wasn't granted (we never prompt here)
 * or the capture failed — never throws.
 */
export async function getForegroundPosition(): Promise<GeoPosition | null> {
  try {
    if (!navigator.geolocation) return null;
    if (!(await permissionGranted())) return null;

    const pos = await getCurrentPosition();
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? undefined,
      place: undefined,
    };
  } catch (e) {
    warn("Location capture skipped", e);
    return null;
  }
}
