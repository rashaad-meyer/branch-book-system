import cors from 'cors';
import helmet from 'helmet';
import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { branchRouter } from './routes/branch.routes.js';
import { appointmentRouter } from './routes/appointment.routes.js';
import { errorHandler } from './middleware/error-handler.js';

export interface AppOptions {
  /** Override the login rate limit — used by tests to trigger 429 quickly. */
  loginRateLimitMax?: number;
}

export function createApp(options: AppOptions = {}) {
  const app = express();

  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '100kb' }));

  app.use(
    pinoHttp({
      logger: pino({ level: env.NODE_ENV === 'test' ? 'silent' : 'info' }),
      redact: ['req.headers.authorization'],
    }),
  );

  app.use('/api/v1', healthRouter());
  app.use('/api/v1', authRouter(options.loginRateLimitMax ?? 10));
  app.use('/api/v1', branchRouter());
  app.use('/api/v1', appointmentRouter());

  app.use(errorHandler);

  return app;
}
