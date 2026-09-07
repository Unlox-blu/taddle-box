/**
 * location.ts — base module for the location abstraction.
 *
 * Feature code imports `../location/location`. Metro resolves the platform
 * twin (location.native.ts on iOS/Android, location.web.ts on web); this base
 * file exists so TypeScript can type-check the import — it re-exports the
 * native twin's surface, which the web twin mirrors. It is never bundled on
 * iOS/Android/web.
 */
export * from "./location.native";
