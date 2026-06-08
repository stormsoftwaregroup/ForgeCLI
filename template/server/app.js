import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import httpLogger from './src/middleware/httpLogger.js';
import routes from './src/routes/index.js';
import { errorHandler } from './src/middleware/errorHandler.js';
import swaggerSpec from './src/config/swagger.js';

dotenv.config();

const app = express();
const isDev = process.env.NODE_ENV !== 'production';

// 1. Security headers
app.use(helmet());

// 2. CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// 3. Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 4. Cookie parser
app.use(cookieParser());

// 5. HTTP request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(httpLogger);
}

// 6. Rate limiting (disabled in development)
if (!isDev) {
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', limiter);
}

// 7. API docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/docs', (_req, res) => res.redirect('/api-docs'));

// 8. Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 9. Routes
app.use(routes);

// 10. Global error handler (LAST)
app.use(errorHandler);

export default app;
