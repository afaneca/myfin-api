import type { NextFunction, Request, Response } from 'express';
import joi from 'joi';
import { MYFIN } from '../consts.js';
import APIError from '../errorHandling/apiError.js';
import BudgetMatrixService from '../services/budgetMatrixService.js';
import BudgetService from '../services/budgetService.js';
import Logger from '../utils/Logger.js';
import CommonsController from './commonsController.js';

// READ
const getAllBudgetsForUserSchema = joi
  .object({
    status: joi.string().allow('C', 'O').empty('').optional(),
  })
  .unknown(true);

const getAllBudgetsForUser = async (req, res, next) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await getAllBudgetsForUserSchema.validateAsync(req.query);
    const data = await BudgetService.getAllBudgetsForUser(sessionData.userId, input.status);
    res.json(data);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const getFilteredBudgetsForUserByPageSchema = joi
  .object({
    page_size: joi
      .number()
      .default(MYFIN.DEFAULT_TRANSACTIONS_FETCH_LIMIT)
      .min(1)
      .max(MYFIN.DEFAULT_TRANSACTIONS_FETCH_LIMIT)
      .optional(),
    query: joi.string().empty('').default('').optional(),
    status: joi.string().allow('C', 'O').empty('').optional(),
  })
  .unknown(true);

const getFilteredBudgetsForUserByPage = async (req, res, next) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await getFilteredBudgetsForUserByPageSchema.validateAsync(req.query);
    const data = await BudgetService.getFilteredBudgetsForUserByPage(
      sessionData.userId,
      req.params.page || 0,
      input.page_size,
      input.query,
      input.status
    );
    res.json(data);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const getBudgetSchema = joi.object({
  id: joi.number().required(),
});
const getBudget = async (req, res, next) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await getBudgetSchema.validateAsync(req.params);
    const data = await BudgetService.getBudget(sessionData.userId, input.id);
    res.json(data);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const getBudgetMatrixSchema = joi.object({
  budget_ids: joi
    .string()
    .pattern(/^[1-9]\d*(,[1-9]\d*){0,4}$/)
    .required(),
}).unknown(true);

const getBudgetMatrix = async (req, res, next) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await getBudgetMatrixSchema.validateAsync(req.query);
    const budgetIds = input.budget_ids
      .split(',')
      .map((budgetId) => BigInt(budgetId));
    const data = await BudgetMatrixService.getBudgetMatrix(sessionData.userId, budgetIds);
    res.json(data);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const currencyAmountSchema = joi.alternatives().try(
  joi.number().strict().min(0),
  joi.string().pattern(/^\d+(?:\.\d{1,2})?$/)
);

const breakdownItemSchema = joi.object({
  label: joi.string().trim().min(1).max(255).required(),
  amount: currencyAmountSchema.required(),
  sort_order: joi.number().strict().integer().min(0).max(2147483647).optional(),
});

// CREATE
/**
 * Preliminary step for the add budget flow
 * Gives frontend the data it needs to display in the UI
 * (categories list)
 */
const addBudgetStep0 = async (req, res, next) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const data = await BudgetService.getCategoryDataForNewBudget(sessionData.userId);
    res.json(data);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const createBudgetSchema = joi
  .object({
    month: joi.number().min(1).max(12).required(),
    year: joi.number().min(1970).required(),
    observations: joi.string().empty(''),
    cat_values_arr: joi
      .string()
      .description(
        'JSON array of category_id, optional planned_value_debit/planned_value_credit and optional expense_items/income_items. Items contain label, decimal currency amount and optional sort_order.'
      )
      .required(),
  })
  .unknown(true);

const createBudget = async (req, res, next) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await createBudgetSchema.validateAsync(req.body);
    const budgetId = await BudgetService.createBudget(
      sessionData.userId,
      input.month,
      input.year,
      JSON.parse(req.body.cat_values_arr),
      input.observations ?? ''
    );
    res.json({
      budget_id: budgetId,
    });
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

// UPDATE
const updateBudgetSchema = joi
  .object({
    budget_id: joi.number().min(1).required(),
    month: joi.number().min(1).max(12).required(),
    year: joi.number().min(1970).required(),
    observations: joi.string().empty(''),
    cat_values_arr: joi
      .string()
      .description(
        'JSON array of category_id, optional planned_value_debit/planned_value_credit and optional expense_items/income_items. Items contain label, decimal currency amount and optional sort_order.'
      )
      .required(),
  })
  .unknown(true);

const updateBudget = async (req, res, next) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await updateBudgetSchema.validateAsync(req.body);
    await BudgetService.updateBudget(
      sessionData.userId,
      input.budget_id,
      input.month,
      input.year,
      JSON.parse(req.body.cat_values_arr),
      input.observations ?? ''
    );
    res.json('Budget was successfully updated.');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const positiveIntegerId = joi
  .alternatives()
  .try(joi.string().pattern(/^[1-9]\d*$/), joi.number().integer().min(1))
  .required();

const updateBudgetCategoryPlannedValuesParamsSchema = joi.object({
  id: positiveIntegerId,
});

const updateBudgetCategoryPlannedValuesSchema = joi
  .object({
    category_id: positiveIntegerId,
    planned_expense: currencyAmountSchema.optional(),
    planned_income: currencyAmountSchema.optional(),
    expense_items: joi.array().items(breakdownItemSchema).optional(),
    income_items: joi.array().items(breakdownItemSchema).optional(),
  })
  .or('planned_expense', 'planned_income', 'expense_items', 'income_items')
  .error(() =>
    APIError.badRequest('Invalid planned amount or budget breakdown.', 'BUDGET_BREAKDOWN_INVALID')
  );

const updateBudgetCategoryPlannedValues = async (req, res, next) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const params = await updateBudgetCategoryPlannedValuesParamsSchema.validateAsync(
      req.params
    );
    const input = await updateBudgetCategoryPlannedValuesSchema.validateAsync(req.body);
    const budgetId = BigInt(params.id);
    await BudgetService.updateBudgetCategoryPlannedValues(
      sessionData.userId,
      budgetId,
      BigInt(input.category_id),
      input.planned_expense,
      input.planned_income,
      undefined,
      input
    );
    res.json('Budget was successfully updated.');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const updateBudgetDescriptionParamsSchema = joi.object({
  id: positiveIntegerId,
});

const updateBudgetDescriptionBodySchema = joi.object({
  observations: joi.string().allow('').required(),
});

const updateBudgetDescription = async (req, res, next) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const params = await updateBudgetDescriptionParamsSchema.validateAsync(req.params);
    const input = await updateBudgetDescriptionBodySchema.validateAsync(req.body);
    await BudgetMatrixService.updateBudgetDescription(
      sessionData.userId,
      BigInt(params.id),
      input.observations
    );
    res.json('Budget description was successfully updated.');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const changeBudgetStatusSchema = joi.object({
  budget_id: joi.number().min(1).required(),
  is_open: joi.boolean().required(),
});
const changeBudgetStatus = async (req, res, next) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await changeBudgetStatusSchema.validateAsync(req.body);
    await BudgetService.changeBudgetStatus(sessionData.userId, input.budget_id, input.is_open);
    res.json('Budget was successfully updated.');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

// REMOVE
const removeBudgetSchema = joi.object({
  budget_id: joi.number().min(1).required(),
});
const removeBudget = async (req, res, next) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const input = await removeBudgetSchema.validateAsync(req.body);
    await BudgetService.removeBudget(sessionData.userId, input.budget_id);
    res.json('Budget was successfully removed.');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

const getBudgetsListForUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const data = await BudgetService.getBudgetsListForUser(sessionData.userId);
    res.json(data);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

export default {
  getAllBudgetsForUser,
  getFilteredBudgetsForUserByPage,
  addBudgetStep0,
  createBudget,
  getBudgetMatrix,
  getBudget,
  updateBudget,
  changeBudgetStatus,
  removeBudget,
  getBudgetsListForUser,
  updateBudgetCategoryPlannedValues,
  updateBudgetDescription,
};
