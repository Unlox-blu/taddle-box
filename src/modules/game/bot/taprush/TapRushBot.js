module.exports = {
    onMatchStart: (session, state) => {
        let tapCount = 0;
        
        const doTap = () => {
            if (tapCount >= 10) return; // 10 taps to win
            
            session.submitMove({ type: 'TAP', seq: tapCount, clientTs: Date.now() });
            tapCount++;
            
            if (tapCount < 10) {
                // Varied interval to simulate human inconsistency
                const delay = session.difficulty.reactionMs + (session.random() * 400 - 200);
                session.setTimeout(doTap, Math.max(100, delay));
            }
        };
        
        // Start tapping
        session.setTimeout(doTap, session.difficulty.reactionMs);
    }
};
