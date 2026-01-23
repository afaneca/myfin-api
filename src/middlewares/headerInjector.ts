import { createRequire } from 'node:module';
import type { NextFunction, Request, Response } from 'express';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

export function headerInjector(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Api-Version', version);
  res.setHeader('Access-Control-Expose-Headers', 'Api-Version');
  next();
}
