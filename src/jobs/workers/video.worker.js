'use strict';

const { Worker } = require('bullmq');
const redis = require('../../config/redis');
const videoService = require('../../integrations/video/video.service');
const mediaRepository = require('../../repositories/media.repository');
const { emitNotification } = require('../../sockets/notification.socket');
const { addVideoJob } = require('../queues/video.queue');
const { logger } = require('../../middlewares/logger.middleware');

const startVideoWorker = () => {
  const worker = new Worker(
    'video',
    async (job) => {
      logger.info(`[VideoWorker] Processing: ${job.name}`, { id: job.id });

      switch (job.name) {
        case 'poll_status': {
          // data: { mediaId, vimeoUri, uploaderId, attempt }
          const { mediaId, vimeoUri, uploaderId } = job.data;

          const videoData = await videoService.getVideoData(vimeoUri);

          if (videoData.status === 'complete') {
            // Update DB and notify uploader
            await mediaRepository.updateVimeoData(mediaId, {
              playerUrl: videoData.playerUrl,
              thumbnailUrl: videoData.thumbnailUrl,
              status: 'ready',
            });
            emitNotification(uploaderId, {
              type: 'video_ready',
              title: 'Video processed',
              message: 'Your video is ready to publish',
              resourceType: 'media',
              resourceId: mediaId,
            });
          } else if (videoData.status === 'error') {
            await mediaRepository.updateStatus(mediaId, 'error');
          } else {
            // Not ready yet — re-queue with delay (max 10 re-polls)
            const attempt = (job.data.attempt || 0) + 1;
            if (attempt <= 10) {
              await addVideoJob('poll_status', { ...job.data, attempt }, { delay: 30000 });
            } else {
              await mediaRepository.updateStatus(mediaId, 'timeout');
            }
          }
          break;
        }

        default:
          logger.warn(`[VideoWorker] Unknown job type: ${job.name}`);
      }
    },
    { connection: redis, concurrency: 3 }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[VideoWorker] Failed: ${job?.name}`, { id: job?.id, error: err.message });
  });

  return worker;
};

module.exports = { startVideoWorker };
