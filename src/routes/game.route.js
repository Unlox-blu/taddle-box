'use strict';

// ─── src/routes/event.route.js ───────────────────────────────────────────────
const router = require('express').Router();
const { gameController }            = require('../modules/game/game.container');
const { verifyToken, optionalAuth }  = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/authorized.middleware');
const { validateRequest }                   = require('../middlewares/validator.middleware');
const {
  paginationSchema,
  searchSchema,
  gameIdParamSchema,
  matchIdParamSchema,
  tournamentIdParamSchema,
  ticketIdParamSchema,
  createMatchSchema,
  updateMatchSchema,
  joinMatchmakingSchema,
  startGameSessionSchema,
  inviteMatchmakingSchema,
  lobbyIdParamSchema,
  lobbyPlayerParamSchema,
  updateLobbySchema,
  updateLobbyPlayerSchema
} = require('../modules/game/game.validator');



router.get('/match/history',    verifyToken,  validateRequest({query: paginationSchema}),   gameController.getGameMatch);
router.get('/match/:matchId',   verifyToken,  validateRequest({params: matchIdParamSchema}),gameController.getGameMatchById);
router.post('/create-match',    verifyToken,  validateRequest({body: createMatchSchema}),   gameController.createGameMatch);
router.patch('/update-match',   verifyToken,  validateRequest({body: updateMatchSchema}),   gameController.updateGameMatch);

router.get('/session/active',   verifyToken,  gameController.getActiveSession);
router.post('/session/start',   verifyToken,  validateRequest({body: startGameSessionSchema}),   gameController.startGameSession);
router.post('/session/complete', verifyToken, gameController.completeGameSession);


router.get('/leaderboard',      verifyToken,  validateRequest({query: paginationSchema}),   gameController.getLeaderboard);
router.get('/tournaments',      verifyToken,  validateRequest({query: paginationSchema}),   gameController.getTournaments);
router.get('/tournaments/:tournamentId/leaderboard', verifyToken, validateRequest({params: tournamentIdParamSchema, query: paginationSchema}), gameController.getTournamentLeaderboard);
router.post('/tournaments/:tournamentId/join', verifyToken, validateRequest({params: tournamentIdParamSchema}), gameController.joinTournament);
router.post('/matchmaking/join', verifyToken, validateRequest({body: joinMatchmakingSchema}), gameController.joinMatchmaking);
router.post('/matchmaking/cancel', verifyToken, gameController.cancelMatchmaking); // Global cancel

// Resource-Oriented Lobby Endpoints
router.get('/lobbies/:lobbyId', verifyToken, validateRequest({params: lobbyIdParamSchema}), gameController.getLobby);
router.patch('/lobbies/:lobbyId', verifyToken, validateRequest({params: lobbyIdParamSchema, body: updateLobbySchema}), gameController.updateLobby);
router.delete('/lobbies/:lobbyId', verifyToken, validateRequest({params: lobbyIdParamSchema}), gameController.deleteLobby);

router.post('/lobbies/join', verifyToken, gameController.joinLobbyByCode);

router.get('/lobbies/:lobbyId/players', verifyToken, validateRequest({params: lobbyIdParamSchema}), gameController.getLobbyPlayers);
router.patch('/lobbies/:lobbyId/players/:playerId', verifyToken, validateRequest({params: lobbyPlayerParamSchema, body: updateLobbyPlayerSchema}), gameController.updateLobbyPlayer);
router.delete('/lobbies/:lobbyId/players/:playerId', verifyToken, validateRequest({params: lobbyPlayerParamSchema}), gameController.removeLobbyPlayer);

router.post('/lobbies/:lobbyId/invitations', verifyToken, validateRequest({params: lobbyIdParamSchema}), gameController.inviteLobbyPlayer);

router.post('/lobbies/:lobbyId/shrink', verifyToken, validateRequest({params: lobbyIdParamSchema}), gameController.shrinkLobby);
router.post('/lobbies/:lobbyId/fill-bots', verifyToken, validateRequest({params: lobbyIdParamSchema}), gameController.fillLobbyBots);
router.post('/lobbies/:lobbyId/continue', verifyToken, validateRequest({params: lobbyIdParamSchema}), gameController.continueLobby);
router.post('/lobbies/:lobbyId/queue', verifyToken, validateRequest({params: lobbyIdParamSchema}), gameController.queueLobbyForMatchmaking);
router.post('/lobbies/:lobbyId/start', verifyToken, validateRequest({params: lobbyIdParamSchema}), gameController.startLobby);

router.get('/trending',         verifyToken,                                                gameController.getTrendingGames);
router.get('/',                 verifyToken,  validateRequest({query: paginationSchema}),   gameController.getGames);
router.get('/search',           verifyToken,  validateRequest({query: searchSchema}),       gameController.searchGames);
router.get('/:gameId',          verifyToken,  validateRequest({params: gameIdParamSchema}), gameController.getGameById);

module.exports = router;
