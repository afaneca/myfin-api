import {NextFunction, Request, Response} from "express";
import Logger from "../utils/Logger.js";
import APIError from "../errorHandling/apiError.js";
import CommonsController from "./commonsController.js";
import InvestTransactionsService from "../services/investTransactionsService.js";
import joi from "joi";
import {MYFIN} from "../consts.js";

// CREATE

const createTransactionSchema = joi.object({
    date_timestamp: joi.number().required(),
    note: joi.string().allow('').optional(),
    total_price: joi.number().required(),
    units: joi.number().required(),
    fees: joi.number().required(),
    asset_id: joi.number().required(),
    type: joi.string().allow(MYFIN.INVEST.TRX_TYPE.BUY, MYFIN.INVEST.TRX_TYPE.SELL).required(),
    /* SPLIT TRX - FOR DEDUCTED FEES */
    is_split: joi.boolean().default(false),
    split_total_price: joi.number().empty('').optional(),
    split_units: joi.number().empty('').optional(),
    split_note: joi.string().empty('').trim().optional(),
    split_type: joi.string().allow(MYFIN.INVEST.TRX_TYPE.BUY, MYFIN.INVEST.TRX_TYPE.SELL, '').optional(),
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
            input.fees,
            input.type,
            input.is_split,
            {
                totalPrice: input.split_total_price,
                units: input.split_units,
                type: input.split_type,
                note: input.split_note
            },
        );
        res.json(`Transaction successfully created!`);
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

const getFilteredTrxByPageSchema = joi.object({
    page_size: joi.number().default(MYFIN.DEFAULT_TRANSACTIONS_FETCH_LIMIT).min(1).max(300),
    query: joi.string().empty('').default(''),
}).unknown(true)

const getFilteredTrxByPage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionData = await CommonsController.checkAuthSessionValidity(req);
        const input = await getFilteredTrxByPageSchema.validateAsync(req.query);
        const data = await InvestTransactionsService.getFilteredTrxByPage(
            sessionData.userId,
            parseInt(req.params.page),
            input.page_size,
            input.query,
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
    fees: joi.number().required(),
    asset_id: joi.number().required(),
    type: joi.string().allow(MYFIN.INVEST.TRX_TYPE.BUY, MYFIN.INVEST.TRX_TYPE.SELL).required(),
});
const updateTransaction = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionData = await CommonsController.checkAuthSessionValidity(req);
        const input = await updateTransactionSchema.validateAsync(req.body);
        const trxId = req.params.id;
        await InvestTransactionsService.updateTransaction(
            sessionData.userId,
            BigInt(trxId),
            input.asset_id,
            input.date_timestamp,
            input.note,
            input.total_price,
            input.units,
            input.fees,
            input.type
        );
        res.json(`Transaction successfully updated!`);
    } catch (err) {
        Logger.addLog(err);
        next(err || APIError.internalServerError());
    }
};

// DELETE
const deleteTransaction = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionData = await CommonsController.checkAuthSessionValidity(req);
        const trxId = req.params.id;
        await InvestTransactionsService.deleteTransaction(sessionData.userId, BigInt(trxId));
        res.json(`Transaction successfully deleted!`);
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
