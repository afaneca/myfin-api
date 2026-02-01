import type { Application, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import Logger from '../utils/Logger.js';

export const rateLimiter = (app?: Application): RequestHandler => {
  // If an app instance is provided, configure trust proxy based on env var.
  const trustProxy = process.env.TRUST_PROXY || 'false';
  if (app) {
    if (trustProxy !== 'false') {
      if (trustProxy === 'true') {
        app.set('trust proxy', true);
      } else if (!Number.isNaN(Number(trustProxy))) {
        app.set('trust proxy', Number(trustProxy));
      } else {
        app.set('trust proxy', trustProxy);
      }
      Logger.addLog(`Trust proxy enabled: ${trustProxy}`);
    } else {
      Logger.addLog('Trust proxy disabled (direct access mode)');
    }
  }

  return rateLimit({
    windowMs: 60 * 1000,
    limit: 100, // Max: 100 requests per minute
    message: 'You have exceeded your 100 requests per minute limit.',
    legacyHeaders: true,
  });
};
