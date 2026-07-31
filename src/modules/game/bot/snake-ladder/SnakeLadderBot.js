// src/bot/snake-ladder/SnakeLadderBot.js
module.exports = {
    onTurn: (session, state) => {
        // Human-like delay before rolling
        const delay = session.difficulty.reactionMs + (session.random() * 1000);
        
        session.setTimeout(() => {
            // Dice roll is determined by the server ultimately, but the client sends a ROLL event.
            // If the server determines the value, the client just sends { type: 'ROLL' }
            // Let's send the move just like the old bot did: { type: 'ROLL', diceValue }
            const diceValue = Math.floor(session.random() * 6) + 1;
            session.submitMove({ type: 'ROLL', diceValue });
        }, delay);
    }
};
