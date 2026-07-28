import cors from 'cors';
import helmet from 'helmet';
import express from 'express';

export function createApp() {
  const app = express();

  app.disable('x-powered-by')

  app.use(helmet())
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
