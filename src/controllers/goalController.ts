import type { NextFunction, Request, Response } from 'express';
import joi from 'joi';
import APIError from '../errorHandling/apiError.js';
import GoalService from '../services/goalService.js';
import Logger from '../utils/Logger.js';
import CommonsController from './commonsController.js';

// Validation helper for funding accounts
const validateFundingAccounts = (
  fundingAccounts: Array<{ account_id: number; funding_type: string; funding_amount: number }>,
  goalAmount: number
) => {
  // Check for duplicate accounts
  const accountIds = fundingAccounts.map((fa) => fa.account_id);
  const uniqueAccountIds = new Set(accountIds);
  if (accountIds.length !== uniqueAccountIds.size) {
    throw APIError.badRequest('Duplicate accounts are not allowed in funding accounts list');
  }

  // Validate each funding account
  for (const fa of fundingAccounts) {
    if (fa.funding_type === 'relative' && fa.funding_amount > 100) {
      throw APIError.badRequest('Percentage funding amount cannot exceed 100%');
    }
    if (fa.funding_type === 'absolute' && fa.funding_amount > goalAmount) {
      throw APIError.badRequest('Absolute funding amount cannot exceed the goal target amount');
    }
  }
};

// CREATE
const fundingAccountSchema = joi.object({
  account_id: joi.number().required(),
  funding_type: joi.string().valid('absolute', 'relative').required(),
  funding_amount: joi.number().min(0).required(),
});

const createGoalSchema = joi.object({
  name: joi.string().trim().required(),
  description: joi.string().allow('').optional(),
  priority: joi.number().integer().min(1).required(),
  amount: joi.number().positive().required(),
  due_date: joi.number().integer().allow(null).optional(),
  funding_accounts: joi.array().items(fundingAccountSchema).required(),
});

const createGoal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const goal = await createGoalSchema.validateAsync(req.body);
    validateFundingAccounts(goal.funding_accounts, goal.amount);
    await GoalService.createGoal(goal, sessionData.userId);
    res.json('Goal successfully created');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

// READ
const getGoalsQuerySchema = joi
  .object({
    only_active: joi.boolean().default(false),
  })
  .unknown(true);

const getAllGoalsForUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const { only_active: onlyActive } = await getGoalsQuerySchema.validateAsync(req.query);
    const goals = await GoalService.getGoalsForUser(sessionData.userId, onlyActive);
    res.send(goals);
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

// UPDATE
const updateGoalParamsSchema = joi.object({
  id: joi.number().required(),
});

const updateGoalBodySchema = joi.object({
  name: joi.string().trim().required(),
  description: joi.string().allow('').optional(),
  priority: joi.number().integer().min(1).required(),
  amount: joi.number().positive().required(),
  due_date: joi.number().integer().allow(null).optional(),
  is_archived: joi.boolean().optional(),
  funding_accounts: joi.array().items(fundingAccountSchema).required(),
});

const updateGoal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const { id } = await updateGoalParamsSchema.validateAsync(req.params);
    const goalData = await updateGoalBodySchema.validateAsync(req.body);

    if (!(await GoalService.doesGoalBelongToUser(sessionData.userId, BigInt(id)))) {
      throw APIError.notAuthorized();
    }

    validateFundingAccounts(goalData.funding_accounts, goalData.amount);

    await GoalService.updateGoal(
      {
        ...goalData,
        goal_id: BigInt(id),
      },
      sessionData.userId
    );
    res.json('Goal successfully updated');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

// DELETE
const deleteGoalSchema = joi.object({
  id: joi.number().required(),
});

const deleteGoal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionData = await CommonsController.checkAuthSessionValidity(req);
    const { id } = await deleteGoalSchema.validateAsync(req.params);

    if (!(await GoalService.doesGoalBelongToUser(sessionData.userId, BigInt(id)))) {
      throw APIError.notAuthorized();
    }

    await GoalService.deleteGoal(BigInt(id));
    res.json('Goal successfully deleted');
  } catch (err) {
    Logger.addLog(err);
    next(err || APIError.internalServerError());
  }
};

export default {
  createGoal,
  getAllGoalsForUser,
  updateGoal,
  deleteGoal,
};
