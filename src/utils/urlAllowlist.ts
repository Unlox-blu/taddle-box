import { Linking } from "react-native";
import { themedAlert } from "../components/common/ThemedAlert";

/**
 * Allowed URL patterns for opening externally.
 * Only HTTPS and known safe custom schemes (mailto, tel) are permitted.
 */
const ALLOWED_HOSTS = [
  "taddlebox.com",
  "www.taddlebox.com",
  "taddlebox.app",
  "play.google.com",
  "apps.apple.com",
  "apps.apple.com",
];

const ALLOWED_SCHEMES = ["https:", "mailto:", "tel:"];

/**
 * Opens a URL only if it passes the allowlist check.
 * Silently drops custom-scheme URLs (intent://, myapp://, etc.)
 * that could be used for phishing or deep-link injection.
 */
export async function safeOpenURL(url: string): Promise<void> {
  try {
    const parsed = new URL(url);

    // Check scheme
    if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
      // Log in dev only — the logger import would be circular in some contexts
      if (__DEV__) {
        console.warn(`[urlAllowlist] Blocked non-HTTPS URL: ${url}`);
      }
      return;
    }

    // For HTTPS, check host against allowlist
    if (parsed.protocol === "https:") {
      const host = parsed.hostname.toLowerCase();
      const allowed = ALLOWED_HOSTS.some(
        (h) => host === h || host.endsWith(`.${h}`),
      );
      if (!allowed) {
        if (__DEV__) {
          console.warn(`[urlAllowlist] Blocked unknown host: ${host}`);
        }
        // Show a confirmation dialog for unknown HTTPS hosts
        themedAlert(
          "Open External Link?",
          `Do you want to open ${host}?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open",
              onPress: () => Linking.openURL(url).catch(() => {}),
            },
          ],
        );
        return;
      }
    }

    await Linking.openURL(url);
  } catch {
    // Invalid URL — ignore
  }
}
