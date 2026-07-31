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
                
                // You can uncomment this if you want to see engine thinking logs:
                // console.log(`[ChessBot ${session.botId}] ${msg}`);
                
                if (msg.startsWith('bestmove')) {
                    const parts = msg.split(' ');
                    const moveString = parts[1]; // e.g. "e2e4" or "e7e8q"
                    
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
            
            // Configure difficulty
            const { chessSkill } = session.difficulty;
            engine.sendCommand(`setoption name Skill Level value ${chessSkill}`);
            
            resolve(engine);
        });
    },

    onTurn: async (session, state) => {
        if (!session.enginePromise) return;
        const engine = await session.enginePromise;
        if (!engine) return;
        
        const ps = state.pluginState;
        
        // Ensure it's actually the bot's turn
        if (ps.turnOrder[ps.currentTurnIndex] !== session.botId) return;

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

    cleanup: (session) => {
        if (session.engine) {
            session.engine.quit();
            session.engine = null;
        }
    }
};
