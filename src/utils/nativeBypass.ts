let nativeFlowDepth = 0;
let bypassUntil = 0;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;

export const nativeBypass = {
  /**
   * Signal that a native OS flow (camera, image picker, etc.) has started.
   * The lock overlay will be suppressed until `endNativeFlow()` is called or
   * the grace period expires. A safety timer auto-resets `nativeFlowDepth`
   * after `maxDurationMs` to prevent a permanent bypass if `endNativeFlow`
   * is never called (e.g. the component crashes or the user navigates away).
   */
  beginNativeFlow: (maxDurationMs = 5 * 60 * 1000) => {
    nativeFlowDepth += 1;
    bypassUntil = Math.max(bypassUntil, Date.now() + maxDurationMs);

    // Safety net: if endNativeFlow is not called within maxDurationMs,
    // force-reset nativeFlowDepth so the lock can engage again.
    if (safetyTimer) clearTimeout(safetyTimer);
    safetyTimer = setTimeout(() => {
      nativeFlowDepth = 0;
      bypassUntil = Date.now() + 1500; // short grace period
      safetyTimer = null;
    }, maxDurationMs);
  },

  /**
   * Signal that the native flow has finished. The lock overlay remains
   * suppressed for `graceMs` (default 1.5 s) so the user sees a smooth
   * transition back into the app rather than an instant lock.
   */
  endNativeFlow: (graceMs = 1500) => {
    nativeFlowDepth = Math.max(0, nativeFlowDepth - 1);
    bypassUntil = Date.now() + graceMs;
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  },

  /** Returns `true` while a native flow is active or within the grace period. */
  shouldBypassLock: () => nativeFlowDepth > 0 || Date.now() < bypassUntil,
};
