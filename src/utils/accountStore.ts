/**
 * accountStore.ts
 *
 * Persistent multi-account storage using expo-secure-store.
 * Stores an array of account profiles (userId, name, username, avatarUrl)
 * and the activeUserId. All other tokens (accessToken, refreshToken,
 * sessionId) are stored at fixed keys and swapped on account switch.
 */
import * as SecureStore from "expo-secure-store";

export interface AccountProfile {
  userId: number | string;
  name: string;
  username: string;
  avatarUrl?: string | null;
}

const ACCOUNTS_KEY = "accounts"; // JSON array of AccountProfile
const ACTIVE_USER_KEY = "activeUserId";

// ── Read ────────────────────────────────────────────────────────────────────

/** Returns all stored account profiles (ordered by last-login-first). */
export async function getAccounts(): Promise<AccountProfile[]> {
  try {
    const raw = await SecureStore.getItemAsync(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Returns the userId of the currently active account, or null. */
export async function getActiveUserId(): Promise<string | number | null> {
  try {
    const raw = await SecureStore.getItemAsync(ACTIVE_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Write ───────────────────────────────────────────────────────────────────

/**
 * Saves or updates an account profile and sets it as active.
 * If the account already exists (same userId), it is moved to the front.
 * The list is capped at MAX_ACCOUNTS entries.
 */
const MAX_ACCOUNTS = 5;

export async function addAccount(profile: AccountProfile): Promise<void> {
  const accounts = await getAccounts();
  // Remove existing entry for this userId (if any) then prepend
  const filtered = accounts.filter((a) => String(a.userId) !== String(profile.userId));
  const updated = [profile, ...filtered].slice(0, MAX_ACCOUNTS);
  await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(updated));
  await SecureStore.setItemAsync(ACTIVE_USER_KEY, JSON.stringify(profile.userId));
}

/** Removes an account from the stored list. */
export async function removeAccount(userId: number | string): Promise<void> {
  const accounts = await getAccounts();
  const updated = accounts.filter((a) => String(a.userId) !== String(userId));
  await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(updated));
  // If the removed account was active, switch to the next one
  const activeId = await getActiveUserId();
  if (String(activeId) === String(userId)) {
    const next = updated[0]?.userId ?? null;
    if (next) {
      await SecureStore.setItemAsync(ACTIVE_USER_KEY, JSON.stringify(next));
    } else {
      await SecureStore.deleteItemAsync(ACTIVE_USER_KEY);
    }
  }
}

/** Clears all stored accounts (full logout from all sessions on device). */
export async function clearAllAccounts(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCOUNTS_KEY);
  await SecureStore.deleteItemAsync(ACTIVE_USER_KEY);
}

/**
 * Swaps token storage keys for account switch.
 * Call BEFORE setting the new activeUserId.
 *
 * Tokens for the PREVIOUS account are stored under prefixed keys
 * so they can be restored when switching back.
 */
export async function storeCurrentAccountTokens(
  prevUserId: number | string
): Promise<void> {
  const prefix = `user_${prevUserId}_`;
  const accessToken = await SecureStore.getItemAsync("accessToken");
  const refreshToken = await SecureStore.getItemAsync("refreshToken");
  const sessionId = await SecureStore.getItemAsync("sessionId");

  if (accessToken) await SecureStore.setItemAsync(`${prefix}accessToken`, accessToken);
  if (refreshToken) await SecureStore.setItemAsync(`${prefix}refreshToken`, refreshToken);
  if (sessionId) await SecureStore.setItemAsync(`${prefix}sessionId`, sessionId);
}

/**
 * Restores token storage keys for a target account.
 * Call AFTER setting the new activeUserId.
 */
export async function restoreAccountTokens(
  targetUserId: number | string
): Promise<void> {
  const prefix = `user_${targetUserId}_`;
  const accessToken = await SecureStore.getItemAsync(`${prefix}accessToken`);
  const refreshToken = await SecureStore.getItemAsync(`${prefix}refreshToken`);
  const sessionId = await SecureStore.getItemAsync(`${prefix}sessionId`);

  if (accessToken) await SecureStore.setItemAsync("accessToken", accessToken);
  if (refreshToken) await SecureStore.setItemAsync("refreshToken", refreshToken);
  if (sessionId) await SecureStore.setItemAsync("sessionId", sessionId);
}

/**
 * Clears saved token storage keys for a specific account.
 */
export async function clearAccountTokens(
  userId: number | string
): Promise<void> {
  const prefix = `user_${userId}_`;
  await SecureStore.deleteItemAsync(`${prefix}accessToken`);
  await SecureStore.deleteItemAsync(`${prefix}refreshToken`);
  await SecureStore.deleteItemAsync(`${prefix}sessionId`);
}
