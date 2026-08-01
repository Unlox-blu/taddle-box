module.exports = {
    onMatchStart: (session, state) => {
        session.tapCount = 0;
        module.exports.onResume(session, state);
    },
    onPause: (session) => {
        session.cleanup();
    },
    onResume: (session, state) => {
        const doTap = () => {
            if (session.tapCount >= 14) return; // Need enough for win based on winScore=14
            
            session.submitMove({ type: 'TAP', seq: session.tapCount, clientTs: Date.now() });
            session.tapCount++;
            
            if (session.tapCount < 14) {
                // Varied interval to simulate human inconsistency
                const delay = session.difficulty.reactionMs + (session.random() * 400 - 200);
                session.setTimeout(doTap, Math.max(100, delay));
            }
        };
        
        // Start tapping
        session.setTimeout(doTap, session.difficulty.reactionMs);
    }
};
