/**
 * push.ts — base module for the push-notifications abstraction.
 *
 * Feature code imports `../notifications/push`. Metro resolves the platform
 * twin (push.native.ts on iOS/Android, push.web.ts on web); this base file
 * exists so TypeScript can type-check the import — it re-exports the native
 * implementation's surface, which is the superset of the web twin's no-ops.
 * It is never bundled on iOS/Android/web.
 */
export * from "./push.native";
