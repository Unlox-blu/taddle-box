/**
 * secureStore.web.ts — web twin for expo-secure-store.
 *
 * expo-secure-store has no web implementation (its web stub exports `{}`,
 * so every getItemAsync/setItemAsync call throws on react-native-web).
 * Metro (see metro.config.js) aliases `expo-secure-store` to this module on
 * web only; native builds keep the real Keychain/Keystore implementation.
 *
 * This is NOT a security boundary — the browser has no hardware keychain, so
 * the closest honest equivalent is localStorage, which is what the session
 * would survive in anyway. Values are stored verbatim under a namespaced key
 * so they never collide with app-owned localStorage entries.
 *
 * The API mirrors the subset of expo-secure-store the app actually uses
 * (async + sync accessors and deletion). Options are accepted and ignored.
 */
const PREFIX = "expo-secure-store:";

const store = () => (typeof window !== "undefined" ? window.localStorage : null);

const get = (key: string): string | null => store()?.getItem(PREFIX + key) ?? null;

const set = (key: string, value: string): void => {
  store()?.setItem(PREFIX + key, value);
};

const remove = (key: string): void => {
  store()?.removeItem(PREFIX + key);
};

export const isAvailableAsync = async (): Promise<boolean> => true;

export const getItemAsync = async (
  key: string,
  _options?: unknown,
): Promise<string | null> => get(key);

export const setItemAsync = async (
  key: string,
  value: string,
  _options?: unknown,
): Promise<void> => {
  set(key, value);
};

export const deleteItemAsync = async (
  key: string,
  _options?: unknown,
): Promise<void> => {
  remove(key);
};

export const getItem = (key: string, _options?: unknown): string | null =>
  get(key);

export const setItem = (key: string, value: string, _options?: unknown): void =>
  set(key, value);

export default {
  isAvailableAsync,
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  getItem,
  setItem,
};
