import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export function healthRouter() {
  const router = Router();

  router.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });

  return router;
}
