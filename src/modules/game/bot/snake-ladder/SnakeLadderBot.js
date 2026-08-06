// src/bot/snake-ladder/SnakeLadderBot.js
module.exports = {
    onTurn: (session, state) => {
        // Human-like delay before rolling — slow enough that the other players
        // actually SEE the dice + token move instead of every bot turn
        // resolving in milliseconds. 1.4s-3s reads like a real player.
        const delay = 1400 + (session.random() * 1600);
        
        session.setTimeout(() => {
            const diceValue = Math.floor(session.random() * 6) + 1;
            session.submitMove({ type: 'ROLL', diceValue });
        }, delay);
    }
};
