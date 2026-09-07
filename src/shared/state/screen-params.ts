/**
 * screenParams — in-memory staging for non-serializable navigation params.
 *
 * expo-router routes carry only string params in the URL (deep-linkable,
 * web-friendly). Structured objects (posts, users, events, feed decks) are
 * staged here right before a push and consumed by the target screen on mount.
 * Screens always resolve their primary entity from the id in the URL when no
 * staged object is present (e.g. a cold deep link).
 */
const staged = new Map<string, unknown>();

/** Stage a params object under `key` before navigating to the matching route. */
export function stageScreenParams(key: string, value: unknown): void {
  staged.set(key, value);
}

/** Consume (and remove) the staged params for `key`. */
export function takeScreenParams<T>(key: string): T | undefined {
  const value = staged.get(key);
  staged.delete(key);
  return value as T | undefined;
}