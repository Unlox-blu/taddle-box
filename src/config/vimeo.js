'use strict';

const { Vimeo } = require('@vimeo/vimeo');
const config = require('./app.config');

const vimeoClient = new Vimeo(
  config.VIMEO_CLIENT_ID,
  config.VIMEO_CLIENT_SECRET,
  config.VIMEO_ACCESS_TOKEN
);

module.exports = vimeoClient;
