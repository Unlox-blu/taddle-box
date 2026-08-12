const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

module.exports = {
    onMatchStart: (session, state) => {
        // Find the CLI script from the stockfish module
        const stockfishCliPath = require.resolve('stockfish/scripts/cli.js');
        
        session.enginePromise = new Promise((resolve) => {
            const process = spawn('node', [stockfishCliPath]);
            
            // Create a line reader for stdout
            const rl = readline.createInterface({
                input: process.stdout,
                terminal: false
            });

            let uciOk = false;

            const engine = {
                process,
                sendCommand: (cmd) => {
                    process.stdin.write(cmd + '\n');
                },
                quit: () => {
                    process.stdin.write('quit\n');
                    process.kill();
                }
            };
            
            rl.on('line', (line) => {
                const msg = line.trim();
                
                if (msg === 'uciok' && !uciOk) {
                    uciOk = true;
                    // Configure difficulty, then send isready — engine will
                    // finish loading NNUE networks and reply with readyok.
                    const { chessSkill } = session.difficulty;
                    engine.sendCommand(`setoption name Skill Level value ${chessSkill}`);
                    engine.sendCommand('isready');
                }

                if (msg === 'readyok') {
                    // Engine is fully initialised — safe to send 'go' now.
                    resolve(engine);
                }

                if (msg.startsWith('bestmove')) {
                    const parts = msg.split(' ');
                    const moveString = parts[1]; // e.g. "e2e4" or "e7e8q"

                    // Always release the thinking lock — including "(none)" and
                    // malformed output — so a stuck engine can never deadlock the
                    // match. A later re-drive (or the guard in handleTurn) will
                    // handle the next turn normally.
                    session.botThinking = false;

                    if (moveString && moveString !== '(none)') {
                        const from = moveString.substring(0, 2);
                        const to = moveString.substring(2, 4);
                        const promotion = moveString.length === 5 ? moveString[4] : undefined;
                        
                        const move = { from, to };
                        if (promotion) move.promotion = promotion;

                        // Add a tiny human delay using the difficulty profile
                        const delay = session.difficulty.reactionMs + (session.random() * 500);
                        session.setTimeout(() => {
                            session.submitMove(move);
                        }, delay);
                    }
                }
            });

            session.engine = engine;
            engine.sendCommand('uci');
        });
    },

    onTurn: async (session, state) => {
        if (!session.enginePromise) return;
        // Guard against double-driving the same bot (e.g. a delayed move from a
        // previous drive firing after the turn already advanced). Stockfish can
        // only produce one bestmove per `go` — a second `go` before the first
        // resolves yields a stale move that gets rejected as "Not your turn".
        if (session.botThinking) return;
        const engine = await session.enginePromise;
        if (!engine) return;

        const ps = state.pluginState;

        // Ensure it's actually the bot's turn
        if (ps.turnOrder[ps.currentTurnIndex] !== session.botId) return;

        session.botThinking = true;

        // Safety net: if stockfish never emits a bestmove (crash, hang), release
        // the lock after the move-time budget + margin so a re-drive can happen.
        const budgetMs = session.difficulty.chessMoveTime || 1000;
        session.setTimeout(() => {
            if (session.botThinking) session.botThinking = false;
        }, budgetMs + 8000);

        // Tell stockfish the current board state
        engine.sendCommand(`position fen ${ps.fen}`);
        
        // Tell it to think
        const { chessDepth, chessMoveTime } = session.difficulty;
        if (chessDepth) {
            engine.sendCommand(`go depth ${chessDepth} movetime ${chessMoveTime}`);
        } else {
            engine.sendCommand(`go movetime ${chessMoveTime}`);
        }
    },

    onPause: (session) => {
        // Release the thinking lock on pause so a resume/re-drive isn't blocked.
        session.botThinking = false;
    },

    onResume: (session) => {
        session.botThinking = false;
    },

    onMatchEnd: (session) => {
        session.botThinking = false;
    },

    cleanup: (session) => {
        session.botThinking = false;
        if (session.engine) {
            session.engine.quit();
            session.engine = null;
        }
    }
};
