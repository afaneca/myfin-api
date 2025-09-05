import { NextFunction, Request, Response } from 'express';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

export function headerInjector(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Api-Version', version);
  res.setHeader('Access-Control-Expose-Headers', 'Api-Version');
  next();
}
