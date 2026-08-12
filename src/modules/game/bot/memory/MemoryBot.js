module.exports = {
    onMatchStart: (session, state) => {
        module.exports.onTurn(session, state);
    },
    onPause: (session) => {
        session.cleanup();
        session.currentRoundScheduled = -1;
    },
    onResume: (session, state) => {
        module.exports.onTurn(session, state);
    },
    // Memory Grid round advancements typically trigger onTurn in the new architecture
    onTurn: (session, state) => {
        const ps = state.pluginState;
        if (!ps || !ps.currentPattern) return;
        
        if (ps.playerInputs && ps.playerInputs[session.botId]) return;
        
        if (ps.roundPhase === 'SHOW') {
            if (session.currentRoundScheduled === ps.currentRound) return;
            session.currentRoundScheduled = ps.currentRound;
            
            session.setTimeout(() => {
                session.submitMove({ type: 'READY_INPUT' });
            }, session.difficulty.reactionMs);
        } else if (ps.roundPhase === 'INPUT') {
            if (session.currentInputScheduled === ps.currentRound) return;
            session.currentInputScheduled = ps.currentRound;

            session.setTimeout(() => {
                const isPerfect = (session.random() * 100) <= session.difficulty.memoryAccuracy;
                let tiles = [...ps.currentPattern];
                
                if (!isPerfect && tiles.length > 0) {
                    // Make a mistake on the last tile
                    tiles[tiles.length - 1] = (tiles[tiles.length - 1] + 1) % 9; 
                }
                
                session.submitMove({ type: 'INPUT', tiles });
            }, 1000 + session.random() * 500);
        }
    }
};
