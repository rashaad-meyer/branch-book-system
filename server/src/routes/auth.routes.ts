import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { loginSchema } from '../schemas/index.js';
import * as authService from '../services/auth.service.js';
import { authedUserId, requireAuth } from '../middleware/auth.js';

export function authRouter(loginRateLimitMax: number) {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many login attempts, try again later' },
    },
  });

  router.post('/auth/login', loginLimiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(prisma, email, password);
    res.json(result);
  });

  router.get('/me', requireAuth, async (req, res) => {
    const user = await authService.getUser(prisma, authedUserId(req.userId));
    res.json({ user });
  });

  return router;
}
