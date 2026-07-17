'use strict';

const path = require('path');
const winston = require('winston');
const config = require('../config/app.config');

const {
  combine,
  timestamp,
  colorize,
  errors,
  printf,
} = winston.format;



const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'blue',
  debug: 'cyan',
});



function formatStack(stack = '') {
  return stack
    .replaceAll(process.cwd() + path.sep, '')
    .replaceAll('\\', '/')
    .split('\n')
    .filter(line => !line.includes('node_modules'))
    .slice(0, 8)
    .join('\n');
}


const consoleFormatter = printf((info) => {
  const {
    timestamp,
    level,
    component = 'SYSTEM',
    message,
    requestId,
    userId,
    method,
    url,
    status,
    responseTime,
    ip,
    stack,
  } = info;

  const header = [
    `[${timestamp}]`,
    `${level}:`,
    `[backend-server]`,
    `[${component}]`,
  ];

  let output = header.join(' ');

  if (message) {
    output += ` ${message}`;
  }

    if (userId) {
    output += ` [user: ${userId}]`;
  }

  if (method) {
    output += ` ${method} ${url}`;
  }

  if(status) {
    output += ` ${status}`;
  }

  if(responseTime) {
    output += ` ${responseTime}`;
  }

  if (stack) {
    output += `\nStack:\n${formatStack(stack)}`;
  }

  return output;
});



const logger = winston.createLogger({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',

  levels,

  transports: [
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),

        timestamp({
          format: 'YYYY-MM-DD HH:mm:ss:SSS',
        }),

        errors({
          stack: true,
        }),

        consoleFormatter,
      ),
    }),
  ],
});



const loggerMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const duration =
      Number(process.hrtime.bigint() - start) / 1e6;

    logger.info('', {
      component: 'HTTP',
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      responseTime: `${duration.toFixed(3)}ms`,
      requestId: req.requestId,
      userId: req.userId ?? res.locals.userId,
      ip: req.ip,
    });
  });

  next();
};



logger.logError = (err, meta = {}) => {
  logger.error(err.message, {
    ...meta,

    stack: err.stack,
    code: err.code,
    errno: err.errno,
    syscall: err.syscall,
    status: err.status || err.statusCode,
    details: err.details,
    cause: err.cause,
    address: err.address,
    port: err.port,
  });
};

logger.httpLog = (message, meta = {}) =>
  logger.http(message, {
    component: 'HTTP',
    ...meta,
  });

logger.system = (message, meta = {}) =>
  logger.info(message, {
    component: 'SYSTEM',
    ...meta,
  });

module.exports = {
  logger,
  loggerMiddleware,
};