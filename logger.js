import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { LOG_PATH } from './constants.js';

if (!fs.existsSync(LOG_PATH)) {
  fs.mkdirSync(LOG_PATH, { recursive: true });
}

const customFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} | ${level.toUpperCase().padEnd(7)} | ${message}`;
});

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    customFormat
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        customFormat
      )
    }),
    new winston.transports.File({
      filename: path.join(LOG_PATH, 'app.log'),
      maxsize: 10485760,
      maxFiles: 5
    })
  ]
});