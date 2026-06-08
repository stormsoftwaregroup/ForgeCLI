import morgan from 'morgan';
import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

const stream = {
  write: (message) => logger.http(message.trim()),
};

const httpLogger = morgan(isProduction ? 'combined' : 'dev', { stream });

export default httpLogger;
