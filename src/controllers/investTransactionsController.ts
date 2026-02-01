import type { NextFunction, Request, Response } from 'express';
import joi from 'joi';
import { MYFIN } from '../consts.js';
import APIError from '../errorHandling/apiError.js';
import InvestTransactionsService from '../services/investTransactionsService.js';
import Logger from '../utils/Logger.js';
import CommonsController from './commonsController.js';

// CREATE

const createTransactionSchema = joi.object({
  date_timestamp: joi.number().required(),
  note: joi.string().allow('').optional(),
  total_price: joi.number().required(),
  units: joi.number().required(),
  // for external fees (e.g. charged to separate account)
  fees_amount: joi.number().required(),
  // for internal fees (deducted from units)
  fees_units: joi.number().required(),
  asset_id: joi.number().required(),
  type: joi
    .string()
    .allow(
      MYFIN.INVEST.TRX_TYPE.BUY,
      MYFIN.INVEST.TRX_TYPE.SELL,
      MYFIN.INVEST.TRX_TYPE.COST,
      MYFIN.INVEST.TRX_TYPE.INCOME
    )
    .required(),
});

const createTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await createTransactionSchema.validateAsync(req.body);
    await InvestTransactionsService.createTransaction(
      sessionData.userId,
      input.asset_id,
      input.date_timestamp,
      input.note,
      input.total_price,
      input.units,
      input.fees_amount,
      input.fees_units,
      input.type
    );
    res.json('Transaction successfully created!');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

// READ
const getAllTransactionsForUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const data = await InvestTransactionsService.getAllTransactionsForUser(sessionData.userId);
    res.json(data);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const getFilteredTrxByPageSchema = joi
  .object({
    page_size: joi.number().default(MYFIN.DEFAULT_TRANSACTIONS_FETCH_LIMIT).min(1).max(300),
    query: joi.string().empty('').default(''),
  })
  .unknown(true);

const getFilteredTrxByPage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await getFilteredTrxByPageSchema.validateAsync(req.query);
    const data = await InvestTransactionsService.getFilteredTrxByPage(
      sessionData.userId,
      Number.parseInt(req.params.page as string),
      input.page_size,
      input.query
    );
    res.json(data);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

// UPDATE
const updateTransactionSchema = joi.object({
  date_timestamp: joi.number().required(),
  note: joi.string().empty('').allow(''),
  total_price: joi.number().required(),
  units: joi.number().required(),
  // for external fees (e.g. charged to separate account)
  fees_amount: joi.number().required(),
  // for internal fees (deducted from units)
  fees_units: joi.number().required(),
  asset_id: joi.number().required(),
  type: joi
    .string()
    .allow(
      MYFIN.INVEST.TRX_TYPE.BUY,
      MYFIN.INVEST.TRX_TYPE.SELL,
      MYFIN.INVEST.TRX_TYPE.INCOME,
      MYFIN.INVEST.TRX_TYPE.COST
    )
    .required(),
});
const updateTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await updateTransactionSchema.validateAsync(req.body);
    const trxId = req.params.id as string;
    await InvestTransactionsService.updateTransaction(
      sessionData.userId,
      BigInt(trxId),
      input.asset_id,
      input.date_timestamp,
      input.note,
      input.total_price,
      input.units,
      input.fees_amount,
      input.fees_units,
      input.type
    );
    res.json('Transaction successfully updated!');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

// DELETE
const deleteTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const trxId = req.params.id as string;
    await InvestTransactionsService.deleteTransaction(sessionData.userId, BigInt(trxId));
    res.json('Transaction successfully deleted!');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

export default {
  getAllTransactionsForUser,
  getFilteredTrxByPage,
  updateTransaction,
  createTransaction,
  deleteTransaction,
};
