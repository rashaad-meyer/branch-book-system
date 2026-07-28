import cors from 'cors';
import helmet from 'helmet';
import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';
import { healthRouter } from './router/health.router.js';

export function createApp() {
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

  return app;
}
