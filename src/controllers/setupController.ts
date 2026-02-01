import type { NextFunction, Request, Response } from 'express';
import joi from 'joi';
import { MYFIN } from '../consts.js';
import APIError from '../errorHandling/apiError.js';
import setupService from '../services/setupService.js';
import Logger from '../utils/Logger.js';

const initInstanceSchema = joi.object({
  username: joi.string().trim().required(),
  password: joi.string().trim().required(),
  email: joi.string().email().required(),
  currency: joi
    .string()
    .trim()
    .valid(...Object.values(MYFIN.CURRENCIES).map((currency) => currency.code))
    .required(),
});
const initInstance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = await initInstanceSchema.validateAsync(req.body);
    await setupService.initInstance(input.username, input.password, input.email, input.currency);
    res.json('Done!');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

export default {
  initInstance,
};
