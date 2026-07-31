module.exports = {
    onTurn: (session, state) => {
        const ps = state.pluginState;
        if (!ps) return;
        
        const drawerId = ps.turnOrder?.[ps.currentDrawerIndex];
        
        if (drawerId === session.botId) {
            // Bot is drawing
            let cx = 100;
            let cy = 100;
            session.setInterval(() => {
                cx += (session.random() - 0.5) * 50;
                cy += (session.random() - 0.5) * 50;
                session.submitMove({
                    type: 'STROKE_CHUNK',
                    points: [[Math.round(cx), Math.round(cy)]],
                    color: '#EF4444',
                    width: 6,
                });
            }, 1000);
        } else {
            // Bot is guessing
            // Wait for a reasonable amount of time before guessing
            const delay = 10000 + session.random() * 10000; 
            session.setTimeout(() => {
                session.submitMove({ type: 'GUESS', word: ps.secretWord });
            }, delay);
        }
    }
};
