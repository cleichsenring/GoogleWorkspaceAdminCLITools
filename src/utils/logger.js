import winston from 'winston';
import { getConfig } from './config.js';

let logger;

export function getLogger() {
  if (logger) return logger;

  const config = getConfig();
  const level = config.logging.level;

  logger = winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, stack }) => {
            const msg = stack || message;
            return `${timestamp} ${level}: ${msg}`;
          }),
        ),
      }),
      new winston.transports.File({
        filename: config.logging.file,
        format: winston.format.json(),
      }),
    ],
  });

  return logger;
}
