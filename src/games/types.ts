import type { Game } from '../types';

export type HtmlGameResult = {
  score: number;
  won: boolean;
  xpEarned?: number;
  durationSeconds: number;
};

export type HtmlGameDefinition = Game & {
  slug: string;
  averageDurationLabel: string;
  buildHtml: (config: {
    gameId: string;
    sessionId: string;
    mode: string;
    maxXp: number;
  }) => string;
};

export type HtmlGameMessage =
  | { type: 'GAME_READY' }
  | { type: 'GAME_SCORE'; score: number }
  | ({ type: 'GAME_COMPLETE' } & HtmlGameResult);
