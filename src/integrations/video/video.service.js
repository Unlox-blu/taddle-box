'use strict';

const vimeoClient = require('../../config/vimeo');

const createUpload = (sizeBytes, title) =>
  new Promise((resolve, reject) => {
    vimeoClient.request(
      {
        method: 'POST',
        path: '/me/videos',
        query: {
          upload: { approach: 'tus', size: sizeBytes },
          name: title || 'Untitled',
          privacy: { view: 'unlisted' },
        },
      },
      (err, body, _status, headers) => {
        if (err) return reject(err);
        resolve({
          uploadLink: headers.location || body.upload?.upload_link,
          vimeoUri: body.uri,
        });
      }
    );
  });

  
const getVideoData = (vimeoUri) =>
  new Promise((resolve, reject) => {
    vimeoClient.request({ method: 'GET', path: vimeoUri }, (err, body) => {
      if (err) return reject(err);
      resolve({
        status: body.transcode?.status || 'unknown',
        playerUrl: body.player_embed_url,
        thumbnailUrl: body.pictures?.sizes?.[3]?.link || null,
        duration: body.duration,
      });
    });
  });

  
const deleteVideo = (vimeoUri) =>
  new Promise((resolve, reject) => {
    vimeoClient.request({ method: 'DELETE', path: vimeoUri }, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });

  
const getPlaybackUrl = async (vimeoUri) => {
  const data = await getVideoData(vimeoUri);
  return data.playerUrl;
};

module.exports = { createUpload, getVideoData, deleteVideo, getPlaybackUrl };
