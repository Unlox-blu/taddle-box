// Seed: per-game tips — backend SSOT for the match-start screen tips pill.
// Date: 2026-09-09
// Mirrors the tips that were previously hardcoded in the app bundle
// (GameStartScreen GAME_TIPS / GENERAL_TIPS) so behavior is unchanged on
// first deploy; from now on tips are edited server-side only.

const TIPS_BY_SLUG = {
  chess: [
    "Control the center — it's the key to winning!",
    "Don't bring your queen out too early in the opening.",
    "Every piece has a value — protect yours wisely.",
    "Castling keeps your king safe and activates your rook.",
    "Develop your minor pieces before pushing pawns.",
  ],
  ludo: [
    "Safe zones are your best friend — opponents can't capture you there!",
    "Sometimes blocking matters more than racing home.",
    "Rolling double sixes gives you an extra turn.",
    "Keep one piece on a safe square while the others move.",
    "Leading doesn't guarantee winning — every piece must finish.",
  ],
  "snake-ladder": [
    "Luck is everything — but every step counts!",
    "Snakes pull you down, ladders push you up.",
    "A hot streak can change the entire game.",
    "Don't give up — anything can happen in Snakes & Ladders.",
    "Enjoy the ride — surprises are around every corner.",
  ],
  scribble: [
    "Keep it simple but recognizable — others need to guess!",
    "Time is limited — draw the most important features first.",
    "Watch every stroke — the clues are in the drawing.",
    "A good drawer knows when to stop adding detail.",
    "Think like a guesser — what's the one thing that stands out?",
  ],
  "word-rush": [
    "Look for long words first — they score more points!",
    "Check corners and edges — good words hide there.",
    "When time is tight, go for quick 3-letter words.",
    "The letter S and plurals are your best allies.",
    "Remember: both speed and quality matter.",
  ],
  "tap-rush": [
    "Speed matters — but accuracy matters more!",
    "Consecutive taps trigger combo bonuses.",
    "Find your rhythm — don't just tap randomly.",
    "Watch your opponent's pace — adjust yours accordingly.",
    "The final sprint can decide the winner.",
  ],
  "memory-grid": [
    "Use patterns to help remember — group cards mentally.",
    "Flip easy-to-remember positions first.",
    "Keep track of cards you've already seen.",
    "Focus beats speed — take your time.",
    "Mentally mark positions as you flip.",
  ],
};

// General tips: stored against the game row (game_id NULL) so the API can
// blend them after the game-specific ones. game_tips.game_id is NOT NULL,
// so general tips live in their own pseudo-row set keyed to a NULL slug —
// we model them as tips of the special 'general' game row if present,
// otherwise they are appended client-side from the bundled fallback.
const GENERAL_TIPS = [
  "A great start is half the battle — stay focused!",
  "Relax and enjoy the game — that's when you play best.",
  "Observe your opponent's strategy — information is power.",
  "Every game is a chance to learn something new.",
  "Take a deep breath, stay calm, and play your best.",
];

module.exports = { TIPS_BY_SLUG, GENERAL_TIPS };
