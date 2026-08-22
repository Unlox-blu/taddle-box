'use strict';

const router = require('express').Router();
const { verifyToken } = require('../middlewares/auth.middleware');
const chatCtrl = require('../modules/chat/chat.controller');

router.use(verifyToken);

router.get('/inbox', chatCtrl.getInbox);
router.get('/mutuals', chatCtrl.searchMutuals);
router.post('/conversation', chatCtrl.getOrCreateConversation);
router.get('/conversation/:conversationId/messages', chatCtrl.getMessages);
router.post('/conversation/:conversationId/messages', chatCtrl.sendMessage);
router.post('/message/:messageId/reaction', chatCtrl.toggleReaction);

module.exports = router;
