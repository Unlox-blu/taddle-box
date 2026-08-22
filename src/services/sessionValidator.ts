/**
 * sessionValidator.ts
 *
 * Batch-validates all stored account sessions against the backend.
 * Called on app foreground transition and cold start to detect sessions
 * that were revoked while the app was in the background or closed.
 *
 * One HTTP call regardless of how many accounts are stored (batch endpoint).
 */
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { getBackendOrigin } from "./backendUrl";
import { log, warn } from '../utils/logger';
import {
  getAccounts,
  removeAccount as storeRemoveAccount,
  type AccountProfile,
} from "../utils/accountStore";

const API_URL = `${getBackendOrigin()}/api/v1`;

// Guard: prevent overlapping validation runs
let _validating = false;

interface SessionInput {
  userId: number | string;
  refreshToken: string;
  sessionId: string;
}

interface ValidationResult {
  /** Accounts whose sessions are still valid. */
  validUserIds: (number | string)[];
  /** Accounts whose sessions were revoked — already removed from store. */
  removedUserIds: (number | string)[];
  /** Whether the currently active account was revoked. */
  activeAccountRevoked: boolean;
}

/**
 * Reads stored refreshToken + sessionId for a given account from SecureStore.
 */
async function readStoredSession(
  userId: number | string,
): Promise<SessionInput | null> {
  const activeUserIdRaw = await SecureStore.getItemAsync("activeUserId");
  const parsedActiveId = activeUserIdRaw ? JSON.parse(activeUserIdRaw) : null;
  const isActive =
    parsedActiveId != null && String(parsedActiveId) === String(userId);

  // If this is the currently active account, ALWAYS use the root keys first,
  // since they are the most up-to-date (e.g. after a token refresh).
  if (isActive) {
    const rootRefresh = await SecureStore.getItemAsync("refreshToken");
    const rootSession = await SecureStore.getItemAsync("sessionId");
    if (rootRefresh && rootSession) {
      return { userId, refreshToken: rootRefresh, sessionId: rootSession };
    }
  }

  // Otherwise, use the prefixed keys for inactive accounts.
  const prefix = `user_${userId}_`;
  const refreshToken = await SecureStore.getItemAsync(`${prefix}refreshToken`);
  const sessionId = await SecureStore.getItemAsync(`${prefix}sessionId`);

  if (!refreshToken || !sessionId) {
    return null;
  }

  return { userId, refreshToken, sessionId };
}

/**
 * Validates all stored account sessions in a single batch call.
 *
 * - Removes accounts with revoked/expired sessions from the store.
 * - Returns which accounts were removed and whether the active account was affected.
 * - No-op if already validating (debounce) or if offline.
 */
export async function validateStoredAccounts(): Promise<ValidationResult> {
  if (_validating) {
    return {
      validUserIds: [],
      removedUserIds: [],
      activeAccountRevoked: false,
    };
  }
  _validating = true;

  const result: ValidationResult = {
    validUserIds: [],
    removedUserIds: [],
    activeAccountRevoked: false,
  };

  try {
    const accounts = await getAccounts();
    if (!accounts.length) return result;

    const activeUserIdRaw = await SecureStore.getItemAsync("activeUserId");
    const activeUserId = activeUserIdRaw ? JSON.parse(activeUserIdRaw) : null;

    // Build session payloads for all accounts
    const sessions: SessionInput[] = [];
    const accountMap = new Map<string, AccountProfile>();

    for (const account of accounts) {
      const session = await readStoredSession(account.userId);
      if (session) {
        sessions.push(session);
        accountMap.set(String(account.userId), account);
      } else {
        // Account has no session in SecureStore -> remove it immediately
        await storeRemoveAccount(account.userId);
        result.removedUserIds.push(account.userId);
        if (
          activeUserId != null &&
          String(activeUserId) === String(account.userId)
        ) {
          result.activeAccountRevoked = true;
        }
      }
    }

    if (!sessions.length) return result;

    // Single batch call to the backend
    const res = await axios.post(
      `${API_URL}/auth/validate-sessions`,
      { sessions },
      { timeout: 10000 },
    );

    const results: { userId: number | string; valid: boolean }[] =
      res.data?.data?.results || [];

    // Process results
    for (const r of results) {
      if (r.valid) {
        result.validUserIds.push(r.userId);
      } else {
        // Session revoked — remove from store
        await storeRemoveAccount(r.userId);
        result.removedUserIds.push(r.userId);

        if (activeUserId != null && String(activeUserId) === String(r.userId)) {
          result.activeAccountRevoked = true;
        }

        log(
          `[SessionValidator] Removed revoked account ${r.userId} from store`,
        );
      }
    }
  } catch (err: any) {
    // Network error or server failure — don't remove anything, just skip.
    // The device socket or forced-logout handler will catch these cases later.      warn("[SessionValidator] Validation skipped:", err?.message || err);
  } finally {
    _validating = false;
  }

  return result;
}
