import joi from "joi";
import APIError from "../errorHandling/apiError.js";
import Logger from "../utils/Logger.js";
import CommonsController from "./commonsController.js";
import UserService from "../services/userService.js";
import { NextFunction, Request, Response } from "express";
import { MYFIN } from "../consts.js";
import { BackupData } from "../utils/backupManager.js";

// CREATE
const createUserSchema = joi.object({
  username: joi.string().trim().required(),
  password: joi.string().trim().required(),
  email: joi.string().email().required()
});
const createOne = async (req, res, next) => {
  try {
    if (process.env.ENABLE_USER_SIGNUP !== "true") {
      throw APIError.notAuthorized("Sign ups are disabled!");
    }
    const user = await createUserSchema.validateAsync(req.body);
    await UserService.createUser(user).then((data) => {
      res.json(`User successfully created`);
    });
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

// AUTH
const attemptLoginSchema = joi.object({
  username: joi.string().trim().required(),
  password: joi.string().trim().required()
});
const attemptLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mobile = req.get("mobile") === "true";
    const userData = await attemptLoginSchema.validateAsync(req.body);
    await UserService.attemptLogin(userData.username, userData.password, mobile)
      .then((sessionData) => {
        Logger.addLog("-----------------");
        Logger.addStringifiedLog(sessionData);
        res.json(sessionData);
      })
      .catch((err) => {
        throw err;
      });
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const checkSessionValidity = async (req, res, next) => {
  try {
    await CommonsController.checkAuthSessionValidity(req);
    res.send("1");
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const changeUserPasswordSchema = joi
  .object({
    current_password: joi.string().required(),
    new_password: joi.string().required()
  })
  .unknown(true);
const changeUserPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await changeUserPasswordSchema.validateAsync(req.body);
    await UserService.changeUserPassword(
      sessionData.userId,
      input.current_password,
      input.new_password,
      sessionData.mobile
    );

    res.json("User password changed with success.");
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const getUserCategoriesEntitiesTags = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const data = await UserService.getUserCategoriesEntitiesTags(sessionData.userId);
    res.json(data);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const autoPopulateDemoData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    await UserService.autoPopulateDemoData(sessionData.userId);
    res.json(`Demo data successfully populated.`);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const sendOtpForRecoverySchema = joi.object({
  username: joi.string().trim().required(),
});
const sendOtpForRecovery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userData = await sendOtpForRecoverySchema.validateAsync(req.body);
    await UserService.sendOtpForRecovery(userData.username, req.i18n.t);
    res.json(`Check your email.`);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const setNewPasswordSchema = joi.object({
  username: joi.string().trim().required(),
  otp: joi.string().required(),
  new_password1: joi.string().required(),
  new_password2: joi.string().required()
});
const setNewPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userData = await setNewPasswordSchema.validateAsync(req.body);
    if (userData.new_password1 !== userData.new_password2) {
      throw APIError.notAcceptable("Passwords do NOT match!");
    }
    await UserService.setNewPassword(userData.username, userData.otp, userData.new_password1);
    res.json(`Password was successfully updated`);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const changeCurrencySchema = joi.object({
  currency: joi.string().trim().valid(...Object.values(MYFIN.CURRENCIES).map(currency => currency.code)).required(),
});
const changeCurrency = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const userData = await changeCurrencySchema.validateAsync(req.body);

    await UserService.changeCurrency(sessionData.userId, userData.currency);
    res.json(`Currency was successfully updated`);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const backupUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const backupData = await UserService.backupUser(sessionData.userId);
    res.json(backupData);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const restoreUserSchema = joi.object({
    apiVersion: joi.string().required(),
    accounts: joi.array().items(joi.object().pattern(joi.string(), joi.any())).required(),
    balances_snapshot: joi.array().items(joi.object().pattern(joi.string(), joi.any())).required(),
    budgets: joi.array().items(joi.object().pattern(joi.string(), joi.any())).required(),
    budgets_has_categories: joi.array().items(joi.object().pattern(joi.string(), joi.any())).optional(),
    categories: joi.array().items(joi.object().pattern(joi.string(), joi.any())).required(),
    entities: joi.array().items(joi.object().pattern(joi.string(), joi.any())).required(),
    tags: joi.array().items(joi.object().pattern(joi.string(), joi.any())).required(),
    invest_asset_evo_snapshot: joi.array().items(joi.object().pattern(joi.string(), joi.any())).required(),
    invest_assets: joi.array().items(joi.object().pattern(joi.string(), joi.any())).required(),
    invest_desired_allocations: joi.array().items(joi.object().pattern(joi.string(), joi.any())).required(),
    invest_transactions: joi.array().items(joi.object().pattern(joi.string(), joi.any())).required(),
    rules: joi.array().items(joi.object().pattern(joi.string(), joi.any())).required(),
    transactions: joi.array().items(joi.object().pattern(joi.string(), joi.any())).required(),
});

export enum RestoreUserErrorCodes {
  IncompatibleVersions = "INCOMPATIBLE_VERSIONS",
  MalformedBackup = "MALFORMED_BACKUP"
}

const restoreUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const data = await restoreUserSchema.validateAsync(req.body);

    await UserService.restoreUser(sessionData.userId, data);
    res.json(`Restoration was successful!`);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

export default {
  createOne,
  attemptLogin,
  checkSessionValidity,
  changeUserPassword,
  getUserCategoriesAndEntities: getUserCategoriesEntitiesTags,
  autoPopulateDemoData,
  sendOtpForRecovery,
  setNewPassword,
  changeCurrency,
  backupUser,
  restoreUser,
};
