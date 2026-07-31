// src/bot/ludo/LudoBot.js
module.exports = {
    onTurn: (session, state) => {
        const delay = session.difficulty.reactionMs + (session.random() * 1000);
        
        session.setTimeout(() => {
            const ps = state.pluginState;

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
