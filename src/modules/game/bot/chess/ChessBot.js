const { spawn } = require('child_process');
const readline = require('readline');

const ENGINE_INIT_TIMEOUT_MS = 15000; // 15s to load WASM + NNUE networks

module.exports = {
    onMatchStart: (session, state) => {
        let stockfishCliPath;
        try {
            stockfishCliPath = require.resolve('stockfish/scripts/cli.js');
        } catch (e) {
            console.error('[ChessBot] stockfish CLI not found:', e.message);
            session.enginePromise = Promise.reject(new Error('Stockfish CLI not installed'));
            return;
        }

        session.enginePromise = new Promise((resolve, reject) => {
            let resolved = false;
            const rejectOnce = (err) => {
                if (!resolved) {
                    resolved = true;
                    console.error(`[ChessBot] Engine init failed for match ${session.matchId}:`, err.message || err);
                    reject(err);
                }
            };
            const resolveOnce = (eng) => {
                if (!resolved) {
                    resolved = true;
                    resolve(eng);
                }
            };

            const childProc = spawn('node', [stockfishCliPath]);

            // Handle spawn errors (e.g., node not found, permission denied)
            childProc.on('error', (err) => {
                console.error(`[ChessBot] Spawn error for match ${session.matchId}:`, err.message);
                rejectOnce(err);
            });

            // Handle unexpected process exit before readyok
            childProc.on('exit', (code, signal) => {
                if (!resolved) {
                    console.error(`[ChessBot] Engine exited unexpectedly for match ${session.matchId}: code=${code} signal=${signal}`);
                    rejectOnce(new Error(`Stockfish exited with code ${code}, signal ${signal}`));
                }
            });

            // Timeout: if engine doesn't initialize in time, reject
            const initTimer = setTimeout(() => {
                console.error(`[ChessBot] Engine init timeout for match ${session.matchId} after ${ENGINE_INIT_TIMEOUT_MS}ms`);
                try { childProc.kill(); } catch (_) {}
                rejectOnce(new Error('Stockfish init timeout'));
            }, ENGINE_INIT_TIMEOUT_MS);

            // Create a line reader for stdout
            const rl = readline.createInterface({
                input: childProc.stdout,
                terminal: false
            });

            let uciOk = false;

            const engine = {
                process: childProc,
                sendCommand: (cmd) => {
                    try {
                        childProc.stdin.write(cmd + '\n');
                    } catch (e) {
                        console.error(`[ChessBot] sendCommand error for match ${session.matchId}:`, e.message);
                    }
                },
                quit: () => {
                    try {
                        childProc.stdin.write('quit\n');
                        childProc.kill();
                    } catch (_) {}
                }
            };

            rl.on('line', (line) => {
                const msg = line.trim();

                if (msg === 'uciok' && !uciOk) {
                    uciOk = true;
                    const { chessSkill } = session.difficulty;
                    engine.sendCommand(`setoption name Skill Level value ${chessSkill}`);
                    engine.sendCommand('isready');
                }

                if (msg === 'readyok') {
                    clearTimeout(initTimer);
                    console.info(`[ChessBot] Engine ready for match ${session.matchId}, bot ${session.botId}`);
                    resolveOnce(engine);
                }

                if (msg.startsWith('bestmove')) {
                    const parts = msg.split(' ');
                    const moveString = parts[1];

                    session.botThinking = false;

                    if (moveString && moveString !== '(none)') {
                        const from = moveString.substring(0, 2);
                        const to = moveString.substring(2, 4);
                        const promotion = moveString.length === 5 ? moveString[4] : undefined;

                        const move = { from, to };
                        if (promotion) move.promotion = promotion;

                        console.info(`[ChessBot] Best move for match ${session.matchId}: ${moveString}`);

                        const delay = session.difficulty.reactionMs + (session.random() * 500);
                        session.setTimeout(() => {
                            session.submitMove(move);
                        }, delay);
                    } else {
                        console.warn(`[ChessBot] Engine returned no move for match ${session.matchId}: ${moveString}`);
                    }
                }
            });

            rl.on('close', () => {
                console.warn(`[ChessBot] Readline closed for match ${session.matchId}`);
                rejectOnce(new Error('Stockfish readline closed unexpectedly'));
            });

            session.engine = engine;
            engine.sendCommand('uci');
        });
    },

    onTurn: async (session, state) => {
        try {
            if (!session.enginePromise) {
                console.warn(`[ChessBot] No engine promise for match ${session.matchId}, bot ${session.botId}`);
                return;
            }
            if (session.botThinking) {
                console.info(`[ChessBot] Bot ${session.botId} already thinking in match ${session.matchId}, skipping`);
                return;
            }
            const engine = await session.enginePromise;
            if (!engine) {
                console.warn(`[ChessBot] Engine resolved to null for match ${session.matchId}`);
                return;
            }

            const ps = state.pluginState;

            if (ps.turnOrder[ps.currentTurnIndex] !== session.botId) {
                console.info(`[ChessBot] Not bot's turn in match ${session.matchId}: currentTurnIndex=${ps.currentTurnIndex}, turnOrder=${JSON.stringify(ps.turnOrder)}, botId=${session.botId}`);
                return;
            }

            session.botThinking = true;
            console.info(`[ChessBot] Bot ${session.botId} thinking in match ${session.matchId}, fen=${ps.fen}`);

            const budgetMs = session.difficulty.chessMoveTime || 1000;
            session.setTimeout(() => {
                if (session.botThinking) {
                    console.warn(`[ChessBot] Safety timeout: releasing botThinking for match ${session.matchId}`);
                    session.botThinking = false;
                }
            }, budgetMs + 8000);

            engine.sendCommand(`position fen ${ps.fen}`);

            const { chessDepth, chessMoveTime } = session.difficulty;
            if (chessDepth) {
                engine.sendCommand(`go depth ${chessDepth} movetime ${chessMoveTime}`);
            } else {
                engine.sendCommand(`go movetime ${chessMoveTime}`);
            }
        } catch (err) {
            console.error(`[ChessBot] onTurn error for match ${session.matchId}, bot ${session.botId}:`, err.message);
            session.botThinking = false;
        }
    },

    onPause: (session) => {
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
            try { session.engine.quit(); } catch (_) {}
            session.engine = null;
        }
    }
};
