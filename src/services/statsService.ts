import { performDatabaseRequest, prisma } from '../config/prisma.js';
import APIError from '../errorHandling/apiError.js';
import { Prisma } from '@prisma/client';
import CategoryService, { CalculatedCategoryAmounts } from './categoryService.js';
import ConvertUtils from '../utils/convertUtils.js';
import TransactionService from './transactionService.js';
import EntityService, { CalculatedEntityAmounts } from './entityService.js';
import AccountService from './accountService.js';
import BudgetService, { BudgetListOrder } from './budgetService.js';
import RuleService from './ruleService.js';
import DateTimeUtils from '../utils/DateTimeUtils.js';
import TagService, { CalculatedTagAmounts } from "./tagService.js";
import Logger from '../utils/Logger.js';

const getExpensesIncomeDistributionForMonth = async (
  userId: bigint,
  month: number,
  year: number,
  dbClient = prisma
) => {
  interface CategoryDataForStats extends Prisma.categoriesUpdateInput {
    current_amount_credit?: number;
    current_amount_debit?: number;
  }

  const data: {
    categories?: Array<CategoryDataForStats>;
    last_update_timestamp?: bigint;
  } = {};
  // Get budget
  const budget: Prisma.budgetsWhereInput = await dbClient.budgets
    .findFirstOrThrow({
      where: {
        users_user_id: userId,
        month: month,
        year: year,
      },
    })
    .catch(() => {
      return {};
    });

  const budgetId = budget.budget_id as bigint;
  const userData: any = await dbClient.users.findUnique({
    where: {
      user_id: userId,
    },
    select: {
      last_update_timestamp: true,
    },
  });
  data.last_update_timestamp = userData.last_update_timestamp as bigint;

  const budgetCategories = await CategoryService.getAllCategoriesForBudget(
    userId,
    budgetId,
    dbClient
  );
  data.categories = [];
  for (const category of budgetCategories) {
    const currentAmounts = await CategoryService.getAmountForCategoryInMonth(
      category.category_id as bigint,
      month,
      year,
      true,
      dbClient
    );
    /* Logger.addStringifiedLog(currentAmounts); */
    /* Logger.addLog(`credit: ${currentAmounts.category_balance_credit} | converted: ${ConvertUtils.convertBigIntegerToFloat(BigInt(currentAmounts.category_balance_credit ?? 0))}`); */
    data.categories.push({
      ...category,
      current_amount_credit: ConvertUtils.convertBigIntegerToFloat(
        BigInt(currentAmounts.category_balance_credit ?? 0)
      ),
      current_amount_debit: ConvertUtils.convertBigIntegerToFloat(
        BigInt(currentAmounts.category_balance_debit ?? 0)
      ),
    });
  }

  return data;
};

export interface UserCounterStats {
  nr_of_trx: number;
  nr_of_entities: number;
  nr_of_categories: number;
  nr_of_accounts: number;
  nr_of_budgets: number;
  nr_of_rules: number;
  nr_of_tags: number;
}

const getUserCounterStats = async (
  userId: bigint,
  dbClient = prisma
): Promise<UserCounterStats> => {
  const [trxCount, entityCount, categoryCount, accountCount, budgetCount, ruleCount, tagCount] =
    await Promise.all([
      TransactionService.getCountOfUserTransactions(userId),
      CategoryService.getCountOfUserCategories(userId, dbClient),
      EntityService.getCountOfUserEntities(userId, dbClient),
      AccountService.getCountOfUserAccounts(userId, dbClient),
      BudgetService.getCountOfUserBudgets(userId, dbClient),
      RuleService.getCountOfUserRules(userId, dbClient),
      TagService.getCountOfUserTags(userId, dbClient),
    ]);

  return {
    nr_of_trx: trxCount as number,
    nr_of_entities: entityCount as number,
    nr_of_categories: categoryCount as number,
    nr_of_accounts: accountCount as number,
    nr_of_budgets: budgetCount as number,
    nr_of_rules: ruleCount as number,
    nr_of_tags: tagCount as number,
  };
};

interface MonthlyPatrimonyProjections {
  budgets?: Array<any>;
  accountsFromPreviousMonth?: Array<any>;
}

const getMonthlyPatrimonyProjections = async (userId: bigint, dbClient = undefined) => {
  const currentMonth = DateTimeUtils.getMonthNumberFromTimestamp(
    DateTimeUtils.getCurrentUnixTimestamp()
  );
  const currentYear = DateTimeUtils.getYearFromTimestamp(DateTimeUtils.getCurrentUnixTimestamp());
  const previousMonth = currentMonth > 1 ? currentMonth - 1 : 12;
  const previousMonthYear = currentMonth > 1 ? currentYear : currentYear - 1;

  /**
   * Skeleton:
   *  [
   *    {category_name, category_expenses },
   *    ...
   * ]
   */
  return performDatabaseRequest(async (dbTx) => {
    interface ExtendedBudget extends Prisma.budgetsUpdateInput {
      planned_balance?: number;
      planned_initial_balance?: number;
      planned_final_balance?: number;
    }

    const output: MonthlyPatrimonyProjections = {};

    const budgets: Array<ExtendedBudget> = await BudgetService.getBudgetAfterCertainMonth(
      userId,
      previousMonth,
      previousMonthYear,
      dbTx
    );
    let lastPlannedFinalBalance = null;

    for (const budget of budgets) {
      budget.planned_balance = await BudgetService.calculateBudgetBalance(userId, budget, dbTx);
      const month = budget.month as number;
      const year = budget.year as number;
      if (!lastPlannedFinalBalance) {
        budget.planned_initial_balance = await AccountService.getBalancesSnapshotForMonthForUser(
          userId,
          month > 1 ? month - 1 : 12,
          month > 1 ? year : year - 1,
          true,
          dbTx
        );
      } else {
        budget.planned_initial_balance = lastPlannedFinalBalance;
      }
      budget.planned_final_balance = budget.planned_initial_balance + budget.planned_balance;
      lastPlannedFinalBalance = budget.planned_final_balance;
    }

    const accountsFromPreviousMonth: Array<{
      account_id: bigint;
      type: string;
      balance?: number;
    }> = await dbTx.accounts.findMany({
      where: {
        users_user_id: userId,
      },
      select: {
        account_id: true,
        type: true,
      },
    });

    for (const account of accountsFromPreviousMonth) {
      const balanceSnapshot = (await AccountService.getBalanceSnapshotAtMonth(
        account.account_id,
        previousMonth,
        previousMonthYear,
        dbTx
      )) ?? { balance: 0 };
      account.balance = balanceSnapshot.balance ?? 0;
    }

    output.budgets = budgets;
    output.accountsFromPreviousMonth = accountsFromPreviousMonth;

    return output;
  }, dbClient);
};

const getCategoryExpensesEvolution = async (
  userId: bigint,
  categoryId: bigint,
  dbClient = undefined
) =>
  performDatabaseRequest(async (prismaTx) => {
    const currentMonth = DateTimeUtils.getMonthNumberFromTimestamp();
    const currentYear = DateTimeUtils.getYearFromTimestamp();
    const budgetsList = await BudgetService.getBudgetsUntilCertainMonth(
      userId,
      currentMonth,
      currentYear,
      BudgetListOrder.DESCENDING,
      prismaTx
    );

    const calculatedAmountPromises = [];
    for (const budget of budgetsList) {
      calculatedAmountPromises.push(
        CategoryService.getAmountForCategoryInMonth(categoryId, budget.month, budget.year)
      );
    }
    const calculatedAmounts: Array<CalculatedCategoryAmounts> = await Promise.all(
      calculatedAmountPromises
    );
    return calculatedAmounts.map((calculatedAmount, index) => ({
      value: ConvertUtils.convertBigIntegerToFloat(
        BigInt(calculatedAmount.category_balance_debit ?? 0)
      ),
      month: budgetsList[index].month,
      year: budgetsList[index].year,
    }));
  }, dbClient);

const getEntityExpensesEvolution = async (userId: bigint, entityId: bigint, dbClient = undefined) =>
  performDatabaseRequest(async (prismaTx) => {
    const currentMonth = DateTimeUtils.getMonthNumberFromTimestamp();
    const currentYear = DateTimeUtils.getYearFromTimestamp();
    const budgetsList = await BudgetService.getBudgetsUntilCertainMonth(
      userId,
      currentMonth,
      currentYear,
      BudgetListOrder.DESCENDING,
      prismaTx
    );

    const calculatedAmountPromises = [];
    for (const budget of budgetsList) {
      calculatedAmountPromises.push(
        EntityService.getAmountForEntityInMonth(entityId, budget.month, budget.year, true, prismaTx)
      );
    }
    const calculatedAmounts: Array<CalculatedEntityAmounts> = await Promise.all(
      calculatedAmountPromises
    );
    return calculatedAmounts.map((calculatedAmount, index) => ({
      value: ConvertUtils.convertBigIntegerToFloat(
        BigInt(calculatedAmount.entity_balance_debit ?? 0)
      ),
      month: budgetsList[index].month,
      year: budgetsList[index].year,
    }));
  }, dbClient);

const getTagExpensesEvolution = async (userId: bigint, tagId: bigint, dbClient = undefined) =>
  performDatabaseRequest(async (prismaTx) => {
    const currentMonth = DateTimeUtils.getMonthNumberFromTimestamp();
    const currentYear = DateTimeUtils.getYearFromTimestamp();
    const budgetsList = await BudgetService.getBudgetsUntilCertainMonth(
      userId,
      currentMonth,
      currentYear,
      BudgetListOrder.DESCENDING,
      prismaTx
    );

    const calculatedAmountPromises = [];
    for (const budget of budgetsList) {
      calculatedAmountPromises.push(
        TagService.getAmountForTagInMonth(tagId, budget.month, budget.year, true, prismaTx)
      );
    }
    const calculatedAmounts: Array<CalculatedTagAmounts> = await Promise.all(
      calculatedAmountPromises
    );
    return calculatedAmounts.map((calculatedAmount, index) => ({
      value: ConvertUtils.convertBigIntegerToFloat(
        BigInt(calculatedAmount.tag_balance_debit ?? 0)
      ),
      month: budgetsList[index].month,
      year: budgetsList[index].year,
    }));
  }, dbClient);

const getTagIncomeEvolution = async (userId: bigint, tagId: bigint, dbClient = undefined) =>
  performDatabaseRequest(async (prismaTx) => {
    const currentMonth = DateTimeUtils.getMonthNumberFromTimestamp();
    const currentYear = DateTimeUtils.getYearFromTimestamp();
    const budgetsList = await BudgetService.getBudgetsUntilCertainMonth(
      userId,
      currentMonth,
      currentYear,
      BudgetListOrder.DESCENDING,
      prismaTx
    );

    const calculatedAmountPromises = [];
    for (const budget of budgetsList) {
      calculatedAmountPromises.push(
        TagService.getAmountForTagInMonth(tagId, budget.month, budget.year, true, prismaTx)
      );
    }
    const calculatedAmounts: Array<CalculatedTagAmounts> = await Promise.all(
      calculatedAmountPromises
    );
    return calculatedAmounts.map((calculatedAmount, index) => ({
      value: ConvertUtils.convertBigIntegerToFloat(
        BigInt(calculatedAmount.tag_balance_credit ?? 0)
      ),
      month: budgetsList[index].month,
      year: budgetsList[index].year,
    }));
  }, dbClient);

const getCategoryIncomeEvolution = async (
  userId: bigint,
  categoryId: bigint,
  dbClient = undefined
) =>
  performDatabaseRequest(async (prismaTx) => {
    const currentMonth = DateTimeUtils.getMonthNumberFromTimestamp();
    const currentYear = DateTimeUtils.getYearFromTimestamp();
    const budgetsList = await BudgetService.getBudgetsUntilCertainMonth(
      userId,
      currentMonth,
      currentYear,
      BudgetListOrder.DESCENDING,
      prismaTx
    );

    const calculatedAmountPromises = [];
    for (const budget of budgetsList) {
      calculatedAmountPromises.push(
        CategoryService.getAmountForCategoryInMonth(categoryId, budget.month, budget.year)
      );
    }
    const calculatedAmounts: Array<CalculatedCategoryAmounts> = await Promise.all(
      calculatedAmountPromises
    );
    return calculatedAmounts.map((calculatedAmount, index) => ({
      value: ConvertUtils.convertBigIntegerToFloat(
        BigInt(calculatedAmount.category_balance_credit ?? 0)
      ),
      month: budgetsList[index].month,
      year: budgetsList[index].year,
    }));
  }, dbClient);

const getEntityIncomeEvolution = async (userId: bigint, entityId: bigint, dbClient = undefined) =>
  performDatabaseRequest(async (prismaTx) => {
    const currentMonth = DateTimeUtils.getMonthNumberFromTimestamp();
    const currentYear = DateTimeUtils.getYearFromTimestamp();
    const budgetsList = await BudgetService.getBudgetsUntilCertainMonth(
      userId,
      currentMonth,
      currentYear,
      BudgetListOrder.DESCENDING,
      prismaTx
    );

    const calculatedAmountPromises = [];
    for (const budget of budgetsList) {
      calculatedAmountPromises.push(
        EntityService.getAmountForEntityInMonth(entityId, budget.month, budget.year, true, prismaTx)
      );
    }
    const calculatedAmounts: Array<CalculatedEntityAmounts> = await Promise.all(
      calculatedAmountPromises
    );
    return calculatedAmounts.map((calculatedAmount, index) => ({
      value: ConvertUtils.convertBigIntegerToFloat(
        BigInt(calculatedAmount.entity_balance_credit ?? 0)
      ),
      month: budgetsList[index].month,
      year: budgetsList[index].year,
    }));
  }, dbClient);

interface ExpandedCategoryWithYearlyAmounts {
  category_id: bigint;
  name: string;
  type: string;
  category_yearly_income: number;
  category_yearly_expense: number;
}
interface ExpandedEntityWithYearlyAmounts {
  entity_id: bigint;
  name: string;
  entity_yearly_income: number;
  entity_yearly_expense: number;
}
interface ExpandedTagWithYearlyAmounts {
  tag_id: bigint;
  name: string;
  description?: string;
  tag_yearly_income: number;
  tag_yearly_expense: number;
}

export interface YearByYearIncomeDistributionOutput {
  year_of_first_trx?: number;
  categories?: Array<ExpandedCategoryWithYearlyAmounts>;
  entities?: Array<ExpandedEntityWithYearlyAmounts>;
  tags?: Array<ExpandedTagWithYearlyAmounts>;
}

const getYearByYearIncomeExpenseDistribution = async (
  userId: bigint,
  year: number,
  dbClient = undefined
): Promise<YearByYearIncomeDistributionOutput> =>
  performDatabaseRequest(async (prismaTx) => {
    const output: YearByYearIncomeDistributionOutput = {};
    output.year_of_first_trx = await TransactionService.getYearOfFirstTransactionForUser(
      userId,
      prismaTx
    );

    // Categories
    const categories = await CategoryService.getAllCategoriesForUser(
      userId,
      {
        category_id: true,
        name: true,
        type: true,
      },
      prismaTx
    );

    const calculatedCategoryAmountPromises = [];
    for (const category of categories) {
      calculatedCategoryAmountPromises.push(
        CategoryService.getAmountForCategoryInYear(
          category.category_id as bigint,
          year,
          true,
          prismaTx
        )
      );
    }

    const calculatedCategoryAmounts = await Promise.all(calculatedCategoryAmountPromises);

    output.categories = categories.map((category, index) => {
      return {
        category_id: category.category_id as bigint,
        name: category.name as string,
        type: category.type as string,
        category_yearly_income: ConvertUtils.convertBigIntegerToFloat(
          calculatedCategoryAmounts[index].category_balance_credit
        ) as number,
        category_yearly_expense: ConvertUtils.convertBigIntegerToFloat(
          calculatedCategoryAmounts[index].category_balance_debit
        ) as number,
      };
    });

    // Entities
    const entities = await EntityService.getAllEntitiesForUser(
      userId,
      {
        entity_id: true,
        name: true,
      },
      prismaTx
    );

    const calculatedEntityAmountPromises = [];
    for (const entity of entities) {
      calculatedEntityAmountPromises.push(
        EntityService.getAmountForEntityInYear(
          entity.entity_id as bigint,
          year,
          true,
          prismaTx
        )
      );
    }

    const calculatedEntityAmounts = await Promise.all(calculatedEntityAmountPromises);

    output.entities = entities.map((entity, index) => {
      return {
        entity_id: entity.entity_id as bigint,
        name: entity.name as string,
        entity_yearly_income: ConvertUtils.convertBigIntegerToFloat(
          calculatedEntityAmounts[index].entity_balance_credit
        ) as number,
        entity_yearly_expense: ConvertUtils.convertBigIntegerToFloat(
          calculatedEntityAmounts[index].entity_balance_debit
        ) as number,
      };
    });

    // Tags
    const tags = await TagService.getAllTagsForUser(
      userId,
      {
        tag_id: true,
        name: true,
        description: true,
      },
      prismaTx
    );

    const calculatedTagAmountPromises = [];
    for (const tag of tags) {
      calculatedTagAmountPromises.push(
        TagService.getAmountForTagInYear(
          tag.tag_id as bigint,
          year,
          true,
          prismaTx
        )
      );
    }

    const calculatedTagAmounts = await Promise.all(calculatedTagAmountPromises);

    output.tags = tags.map((tag, index) => {
      return {
        tag_id: tag.tag_id as bigint,
        name: tag.name as string,
        description: tag.description as string,
        tag_yearly_income: ConvertUtils.convertBigIntegerToFloat(
          calculatedTagAmounts[index].tag_balance_credit
        ) as number,
        tag_yearly_expense: ConvertUtils.convertBigIntegerToFloat(
          calculatedTagAmounts[index].tag_balance_debit
        ) as number,
      };
    });

    return output;
  }, dbClient);

export interface MonthByMonthDataItem {
  month: number;
  year: number;
  balance_value: number;
}


const getCalculatedAmountsForUserInMonth = async (
  userId: bigint,
  month: number,
  year: number,
  userCategories: { category_id: bigint, name: string }[] | null = null,
  dbClient = prisma
): Promise<MonthByMonthDataItem> => {
  const categories = userCategories ?? await CategoryService.getAllCategoriesForUser(userId, {
    category_id: true,
    name: true,
  }, dbClient);

  const promises = [];
  for (const category of categories) {
    promises.push(
      CategoryService.getAmountForCategoryInMonth(category.category_id as bigint, month, year, true, dbClient)
    )
  }

  const calculatedCategories = await Promise.all(promises);

  const balance = calculatedCategories.reduce(
    (accumulator, currentValue) => accumulator + Number(currentValue.category_balance_credit) - Number(currentValue.category_balance_debit),
    0)

  return { month, year, balance_value: ConvertUtils.convertBigIntegerToFloat(balance) };
}

const getMonthByMonthData = async (
  userId: bigint,
  limit: number,
  dbClient = undefined
): Promise<MonthByMonthDataItem[]> => performDatabaseRequest(async (prismaTx) => {

  // Get balance for current month & [limit - 1] previous ones
  const currentMonth = DateTimeUtils.getMonthNumberFromTimestamp();
  const currentYear = DateTimeUtils.getYearFromTimestamp();

  const categories = (await CategoryService.getAllCategoriesForUser(userId, {
    category_id: true,
    name: true,
    exclude_from_budgets: true,
  }, dbClient)).filter((cat) => cat.exclude_from_budgets == 0);

  const promises = []
  for (let i = 0; i < limit; i++) {
    const { month, year } = DateTimeUtils.decrementMonthByX(currentMonth, currentYear, i)
    promises.push(getCalculatedAmountsForUserInMonth(userId, month, year, categories as { category_id: bigint, name: string }[], prismaTx));
  }

  return Promise.all(promises);

}, dbClient);

export default {
  getExpensesIncomeDistributionForMonth,
  getUserCounterStats,
  getMonthlyPatrimonyProjections,
  getCategoryExpensesEvolution,
  getEntityExpensesEvolution,
  getCategoryIncomeEvolution,
  getEntityIncomeEvolution,
  getYearByYearIncomeExpenseDistribution,
  getTagIncomeEvolution,
  getTagExpensesEvolution,
  getMonthByMonthData,
};
