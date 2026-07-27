let nativeFlowDepth = 0;
let bypassUntil = 0;

export const appLockBypass = {
  beginNativeFlow: (maxDurationMs = 5 * 60 * 1000) => {
    nativeFlowDepth += 1;
    bypassUntil = Math.max(bypassUntil, Date.now() + maxDurationMs);
  },

  endNativeFlow: (graceMs = 1500) => {
    nativeFlowDepth = Math.max(0, nativeFlowDepth - 1);
    bypassUntil = Date.now() + graceMs;
  },

  shouldBypassLock: () => nativeFlowDepth > 0 || Date.now() < bypassUntil,
};
