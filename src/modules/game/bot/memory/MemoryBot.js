module.exports = {
    // Memory Grid round advancements typically trigger onTurn in the new architecture
    onTurn: (session, state) => {
        const ps = state.pluginState;
        if (!ps || !ps.currentPattern) return;
        
        const delay = session.difficulty.reactionMs;
        
        session.setTimeout(() => {
            session.submitMove({ type: 'READY_INPUT' });
            
            // Wait a moment then input the sequence
            session.setTimeout(() => {
                // Calculate accuracy based on difficulty profile
                const isPerfect = (session.random() * 100) <= session.difficulty.memoryAccuracy;
                let tiles = [...ps.currentPattern];
                
                if (!isPerfect && tiles.length > 0) {
                    // Make a mistake on the last tile
                    tiles[tiles.length - 1] = (tiles[tiles.length - 1] + 1) % 9; 
                }
                
                session.submitMove({ type: 'INPUT', tiles });
            }, 1000 + session.random() * 500);
        }, delay);
    }
};
