'use strict';

const activeStatusRepo = require('../repositories/activestatus.repository')
const redis = require('../config/redis')

let _io = null;

const setupActiveStatus = (io) => {
  _io = io;

  io.on('connection', async (socket) => {
    const statusKey = `user:status:${socket.userId}`

    try {
        await redis.setex(statusKey, 30, 'online');
        await activeStatusRepo.setOnline(socket.userId);

        console.log(`${socket.userId} is online`)
    } catch (error) {
        console.error(err);
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
            await activeStatusRepo.setOffline(socket.userId);
        } catch (err) {
            console.error(err);
        }
    });
  });
};



module.exports = { setupActiveStatus };
