import type { NextFunction, Request, Response } from 'express';
import joi from 'joi';
import APIError from '../errorHandling/apiError.js';
import InvestReportService from '../services/investReportService.js';
import DateTimeUtils from '../utils/DateTimeUtils.js';
import Logger from '../utils/Logger.js';
import CommonsController from './commonsController.js';

const getAnnualReportParamsSchema = () =>
  joi.object({
    year: joi.number().integer().min(1900).max(DateTimeUtils.getCurrentYear()).required(),
  });

const getAnnualReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const { error, value } = getAnnualReportParamsSchema().validate(req.params);
    if (error) throw APIError.badRequest(error.message);

    const data = await InvestReportService.getAnnualReportForUser(sessionData.userId, value.year);
    res.json(data);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

export default {
  getAnnualReport,
};
