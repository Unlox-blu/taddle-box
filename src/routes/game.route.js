'use strict';

// ─── src/routes/event.route.js ───────────────────────────────────────────────
const router = require('express').Router();
const { gameController }            = require('../modules/game/game.container');
const { verifyToken, optionalAuth }  = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/authorized.middleware');
const { validateRequest }                   = require('../middlewares/validator.middleware');
const { paginationSchema, searchSchema, gameIdParamSchema, matchIdParamSchema, createMatchSchema, updateMatchSchema } = require('../modules/game/game.validator');



router.get('/match',            verifyToken,  validateRequest({query: paginationSchema}),   gameController.getGameMatch);
router.get('/match/:matchId',   verifyToken,  validateRequest({params: matchIdParamSchema}),gameController.getGameMatchById);
router.post('/create-match',    verifyToken,  validateRequest({body: createMatchSchema}),   gameController.createGameMatch);
router.patch('/update-match',   verifyToken,  validateRequest({body: updateMatchSchema}),   gameController.updateGameMatch);

router.get('/',                 verifyToken,  validateRequest({query: paginationSchema}),   gameController.getGames);
router.get('/search',           verifyToken,  validateRequest({query: searchSchema}),       gameController.searchGames);
router.get('/:gameId',          verifyToken,  validateRequest({params: gameIdParamSchema}), gameController.getGameById);

module.exports = router;