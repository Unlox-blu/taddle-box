'use strict';

const {activeStatusService} = require('../modules/activestatus/activestatus.container')
const redis = require('../config/redis')

let _io = null;

const setupActiveStatus = (io) => {
  _io = io;

  io.on('connection', async (socket) => {
    const statusKey = `user:status:${socket.userId}`

    try {
        await redis.setex(statusKey, 30, 'online');
        await activeStatusService.setOnline({userId: socket.userId});

        console.log(`${socket.userId} is online`)
    } catch (error) {
        console.error(error);
    }

    socket.on('heartbeat', async () => {
        try {
            await redis.setex(statusKey, 30, 'online');
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('disconnect', async () => {
        try {
            const lastSeenTime = new Date().toISOString();

            console.log(`${socket.userId} disconnected`);

            await redis.setex(statusKey, 60, lastSeenTime);
            await activeStatusService.setOffline({userId: socket.userId});
        } catch (err) {
            console.error(err);
        }
    });
  });
};



module.exports = { setupActiveStatus };
