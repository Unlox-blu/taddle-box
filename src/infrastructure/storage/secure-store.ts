/**
 * secureStore.ts — base module for the secure-storage abstraction.
 *
 * Feature code imports `@/infrastructure/storage/secure-store` (relative in
 * practice). Metro resolves the platform twin (secureStore.native.ts on iOS/
 * Android, secureStore.web.ts on web); this base file exists so TypeScript can
 * type-check the import — it re-exports the real expo-secure-store surface,
 * which the native twin mirrors. It is never bundled on iOS/Android/web.
 */
export * from "expo-secure-store";
