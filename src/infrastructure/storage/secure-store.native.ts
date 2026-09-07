/**
 * secureStore.native.ts — native twin for the secure-storage abstraction.
 *
 * Re-exports the real Keychain/Keystore implementation (expo-secure-store) so
 * feature code imports `@/infrastructure/storage/secure-store` without knowing
 * about Platform.OS. Web builds resolve to secureStore.web.ts via Metro's
 * platform-extension resolution (see metro.config.js).
 *
 * The surface mirrors secureStore.web.ts (async + sync accessors) plus the
 * option constants native callers may pass.
 */
export {
  isAvailableAsync,
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  getItem,
  setItem,
  WHEN_UNLOCKED,
  AFTER_FIRST_UNLOCK,
  ALWAYS,
} from "expo-secure-store";