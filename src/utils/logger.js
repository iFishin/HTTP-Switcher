'use strict';

const pino = require('pino');

const level = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level,
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
  formatters: {
    bindings() {
      return {}; // omit pid/hostname in production JSON too
    },
  },
});

module.exports = logger;
