import { NextFunction, Request, Response } from 'express';

import { version } from '../../package.json';

export function headerInjector(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Api-Version', version);
  next();
}
