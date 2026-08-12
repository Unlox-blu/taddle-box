// src/bot/ludo/LudoBot.js
module.exports = {
    // Realistic pacing: EVERY bot action waits a flat 2s first — before
    // rolling, after rolling (before moving a coin), before the next roll
    // (after a 6), after moving, etc. Each action is a separate onTurn call,
    // so this single delay covers all edge cases and the match never
    // machine-guns between turns. The engine drives exactly one action per
    // turn (ROLL → MOVE → next player), so a bot reads as
    // "roll → 2s → move → 2s → next bot" instead of rolling and moving at once.
    onTurn: (session, state) => {
        const ps = state.pluginState || {};
        const delay = 2000;

        const id = session.setTimeout(() => {
            session.pendingTurnId = null;
            if (ps.dice === null) {
                // Needs to roll
                session.submitMove({ type: 'ROLL' });
            } else {
                // Has rolled, needs to move a token
                const movable = ps.movableTokens || [];
                if (movable.length > 0) {
                    const tokenToMoveId = movable[Math.floor(session.random() * movable.length)];
                    session.submitMove({ type: 'MOVE_TOKEN', tokenId: tokenToMoveId });
                }
            }
        }, delay);
        session.pendingTurnId = id;
    },

    // If the match is paused mid-action, cancel the pending action so the bot
    // never fires a move while paused (and never double-acts after resume —
    // BotManager releases the one-action guard and resume re-drives cleanly).
    onPause: (session) => {
        if (session.pendingTurnId) {
            session.clearTimeout(session.pendingTurnId);
            session.pendingTurnId = null;
        }
    }
};
