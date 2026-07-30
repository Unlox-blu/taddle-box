/**
 * Lazy wrapper for expo-local-authentication.
 * 
 * Importing expo-local-authentication at the top level causes an
 * "Invariant Violation: native module doesn't exist" crash in Expo Go,
 * because the module accesses native APIs immediately upon import.
 * 
 * This util defers the require() to the first time a function is called,
 * so the module is only loaded when biometric auth is actually attempted.
 */

type LocalAuth = typeof import('expo-local-authentication');

let _mod: LocalAuth | null = null;
function getLocalAuth(): LocalAuth {
  if (!_mod) {
    try {
      _mod = require('expo-local-authentication') as LocalAuth;
    } catch {
      // Not available (e.g. Expo Go without dev build) — return stubs
      _mod = {
        hasHardwareAsync: async () => false,
        isEnrolledAsync:  async () => false,
        authenticateAsync: async () => ({ success: false, error: 'unavailable' }),
        supportedAuthenticationTypesAsync: async () => [],
        AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
        SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
      } as unknown as LocalAuth;
    }
  }
  return _mod;
}

export const hasHardwareAsync    = (): ReturnType<LocalAuth['hasHardwareAsync']>     => getLocalAuth().hasHardwareAsync();
export const isEnrolledAsync     = (): ReturnType<LocalAuth['isEnrolledAsync']>      => getLocalAuth().isEnrolledAsync();
export const authenticateAsync   = (opts?: Parameters<LocalAuth['authenticateAsync']>[0]): ReturnType<LocalAuth['authenticateAsync']> => getLocalAuth().authenticateAsync(opts);
