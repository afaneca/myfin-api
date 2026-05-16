import type { Express } from 'express-serve-static-core';
import { registerRoutes } from './routeDefinitions.js';

const router = (app: Express) => {
  registerRoutes(app);
};

export default router;
