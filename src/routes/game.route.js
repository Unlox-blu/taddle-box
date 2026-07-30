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
  inviteMatchmakingSchema,
} = require('../modules/game/game.validator');



router.get('/match/history',    verifyToken,  validateRequest({query: paginationSchema}),   gameController.getGameMatch);
router.get('/match/:matchId',   verifyToken,  validateRequest({params: matchIdParamSchema}),gameController.getGameMatchById);
router.post('/create-match',    verifyToken,  validateRequest({body: createMatchSchema}),   gameController.createGameMatch);
router.patch('/update-match',   verifyToken,  validateRequest({body: updateMatchSchema}),   gameController.updateGameMatch);

router.post('/session/start',   verifyToken,  gameController.startGameSession);
router.post('/session/complete', verifyToken, gameController.completeGameSession);


router.get('/leaderboard',      verifyToken,  validateRequest({query: paginationSchema}),   gameController.getLeaderboard);
router.get('/tournaments',      verifyToken,  validateRequest({query: paginationSchema}),   gameController.getTournaments);
router.post('/tournaments/:tournamentId/join', verifyToken, validateRequest({params: tournamentIdParamSchema}), gameController.joinTournament);
router.post('/matchmaking/join', verifyToken, validateRequest({body: joinMatchmakingSchema}), gameController.joinMatchmaking);
router.post('/matchmaking/invite', verifyToken, validateRequest({body: inviteMatchmakingSchema}), gameController.inviteMatchmaking);
router.get('/matchmaking/:ticketId', verifyToken, validateRequest({params: ticketIdParamSchema}), gameController.getMatchmakingTicket);
router.post('/matchmaking/:ticketId/cancel', verifyToken, validateRequest({params: ticketIdParamSchema}), gameController.cancelMatchmakingTicket);

router.get('/trending',         verifyToken,                                                gameController.getTrendingGames);
router.get('/',                 verifyToken,  validateRequest({query: paginationSchema}),   gameController.getGames);
router.get('/search',           verifyToken,  validateRequest({query: searchSchema}),       gameController.searchGames);
router.get('/:gameId',          verifyToken,  validateRequest({params: gameIdParamSchema}), gameController.getGameById);

module.exports = router;
