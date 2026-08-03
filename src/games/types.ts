import type { Game } from '../types';

export type HtmlGameResult = {
  score: number;
  won: boolean;
  xpEarned?: number;
  durationSeconds: number;
  /** Optional 0–100 accuracy/hit-rate breakdown for the celebration overlay */
  accuracy?: number;
  /** Optional longest consecutive correct/streak count for the celebration overlay */
  longestStreak?: number;
};
