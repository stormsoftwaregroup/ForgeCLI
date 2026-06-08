import winston from 'winston';
import TransportStream from 'winston-transport';
import prisma from './prisma.js';

const isProduction = process.env.NODE_ENV === 'production';

// Custom transport that writes ERROR-level logs to the ErrorLog table
class PrismaErrorTransport extends TransportStream {
  constructor(opts = {}) {
    super({ ...opts, level: 'error' });
  }

  async log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    try {
      await prisma.errorLog.create({
        data: {
          message: info.message,
          stack: info.stack || null,
          method: info.method || null,
          url: info.url || null,
          body: info.body || null,
          userId: info.userId || null,
          severity: 'ERROR',
        },
      });
    } catch (err) {
      // Don't let a DB failure crash the logger
      console.error('Failed to write error log to database:', err.message);
    }

    callback();
  }
}

const defaultLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const logger = winston.createLogger({
  level: defaultLevel,
  levels: winston.config.npm.levels,
  transports: [
    new winston.transports.Console({
      format: isProduction
        ? winston.format.combine(winston.format.timestamp(), winston.format.json())
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} ${level}: ${message}${metaStr}`;
            })
          ),
    }),
    new PrismaErrorTransport(),
  ],
});

export default logger;
