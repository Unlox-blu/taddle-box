// src/bot/ludo/LudoBot.js
module.exports = {
    // Realistic pacing: EVERY bot action waits a flat 2s first — before
    // rolling, after rolling (before moving a coin), before the next roll
    // (after a 6), after moving, etc. Each action is a separate onTurn call,
    // so this single delay covers all edge cases and the match never
    // machine-guns between turns.
    onTurn: (session, state) => {
        const ps = state.pluginState || {};
        const delay = 2000;

        session.setTimeout(() => {
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
    }
};
