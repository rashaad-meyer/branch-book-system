import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import * as branchService from '../services/branch.service.js';
import { branchAvailabilityQuerySchema, idParamSchema } from '../schemas/index.js';

// Branch and availability endpoints are public: guests browse and book
// without an account. Staff-only routes live in their own router.
export function branchRouter() {
  const router = Router();

  router.get('/branches', async (req, res) => {
    const result = await branchService.listBranches(prisma);
    res.json(result);
  });

  router.get('/branches/:id/availability', async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const query = branchAvailabilityQuerySchema.parse(req.query);
    const branch = await branchService.getBranchAvailability(prisma, id, query);
    res.json(branch);
  });

  return router;
}
