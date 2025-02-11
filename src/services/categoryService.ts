import {performDatabaseRequest, prisma} from '../config/prisma.js';
import {MYFIN} from '../consts.js';
import {Prisma} from '@prisma/client';
import DateTimeUtils from '../utils/DateTimeUtils.js';
import TransactionService from "./transactionService.js";
import Logger from "../utils/Logger.js";
import ConvertUtils from "../utils/convertUtils.js";

const BudgetHasCategories = prisma.budgets_has_categories;

interface Category {
    category_id?: bigint;
    name?: string;
    description?: string;
    color_gradient?: string;
    status?: string;
    type?: string;
    exclude_from_budgets?: number;
    users_user_id?: bigint;
}

export interface CalculatedCategoryAmounts {
  category_balance_credit: number;
  category_balance_debit: number;
}

class CategoryService {
  /**
   * Fetches all categories associated with ***userId***.
   * @param userId - user id
   * @param selectAttributes - category attributes to be returned. *Undefined* will return them all.
   * @param dbClient - the db client
   */
  static async getAllCategoriesForUser (
    userId: bigint,
    selectAttributes = undefined,
    dbClient = prisma
  ): Promise<Array<Prisma.categoriesWhereInput>> {
    return dbClient.categories.findMany({
      where: {users_user_id: userId},
      select: selectAttributes,
    });
  }

  static async createCategory(category: Category, dbClient = prisma){
    return dbClient.categories.create({
      data: {
        name: category.name,
        description: category.description,
        color_gradient: category.color_gradient,
        status: category.status,
        exclude_from_budgets: category.exclude_from_budgets,
        type: category.type,
        users_user_id: category.users_user_id,
      }
    });
  };

  static async deleteCategory (userId: bigint, categoryId: number, dbClient = prisma){
    const deleteBudgetHasCategoriesRefs = BudgetHasCategories.deleteMany({
      where: {
        categories_category_id: categoryId,
        budgets_users_user_id: userId,
      },
    });
    const deleteCat = dbClient.categories.delete({
      where: {
        users_user_id: userId,
        category_id: categoryId,
      },
    });

    return prisma.$transaction([deleteBudgetHasCategoriesRefs, deleteCat]);
  };


  static async updateCategory(userId: bigint, categoryId, category: Prisma.categoriesUpdateInput, dbClient = prisma){
    return dbClient.categories.update({
      where: {
        users_user_id: userId,
        category_id: categoryId,
      },
      data: category,
    });
  }

  private static buildSqlForExcludedAccountsList (excludedAccs){
    if (!excludedAccs || excludedAccs.length === 0) {
      return ' -1 ';
    }
    let sql = '';
    for (let cnt = 0; cnt < excludedAccs.length; cnt++) {
      const acc = excludedAccs[cnt].account_id;
      sql += ` '${acc}' `;

      if (cnt !== excludedAccs.length - 1) {
        sql += ', ';
      }
    }
    sql += '';
    return sql;
  };

  static async getAverageAmountForCategoryInLast12Months(
    userId: number | bigint,
    categoryId: number | bigint,
    dbClient = prisma
  ){
    const firstTimestamp = await TransactionService.getDateTimestampOfFirstTransactionForUser(userId as bigint, dbClient);
    const nrOfTotalMonthsFromFirstTrx = DateTimeUtils.getFullMonthsBetweenDates(new Date(Number(firstTimestamp) * 1000), new Date())
    const monthYearFrom12MonthsAgo = DateTimeUtils.decrementMonthByX(DateTimeUtils.getMonthNumberFromTimestamp(), DateTimeUtils.getYearFromTimestamp(), 12)
    const beginDate = new Date(monthYearFrom12MonthsAgo.year, monthYearFrom12MonthsAgo.month - 1, 1)
    const sumAmounts = (await this.getAmountForCategoryInPeriod(categoryId, beginDate.getTime() / 1000, DateTimeUtils.getCurrentUnixTimestamp(), true, dbClient))[0];

    const divisor = (nrOfTotalMonthsFromFirstTrx > 12) ? 12 : nrOfTotalMonthsFromFirstTrx;
    return {
      category_balance_credit: ConvertUtils.convertBigIntegerToFloat(BigInt(sumAmounts.category_balance_credit ?? 0)) / divisor,
      category_balance_debit: ConvertUtils.convertBigIntegerToFloat(BigInt(sumAmounts.category_balance_debit ?? 0)) / divisor
    }
  };

  static async getAmountForCategoryInPeriod(
    categoryId: number | bigint,
    fromDate: number,
    toDate: number,
    includeTransfers = true,
    dbClient = prisma
  ): Promise<{
    category_balance_credit: number;
    category_balance_debit: number;
  }> {
    return performDatabaseRequest(async (prismaTx) => {
      const listOfAccountsToExclude = await prismaTx.accounts.findMany({
        where: { exclude_from_budgets: true },
      });

      let sqlQuery;

      if (includeTransfers && listOfAccountsToExclude.length > 0) {
        sqlQuery = prismaTx.$queryRaw`
        SELECT sum(if(type = 'I', amount, 0)) as 'category_balance_credit',
               sum(if(type = 'E' OR
                      (type = 'T' AND accounts_account_to_id IN (${Prisma.join(
          listOfAccountsToExclude.map((a) => a.account_id)
        )}))),
                   amount,
                   0)) as 'category_balance_debit'
        FROM transactions
        WHERE date_timestamp BETWEEN ${fromDate} AND ${toDate}
          AND categories_category_id = ${categoryId}`;
      } else {
        // Exclude the IN (...) condition when the list is empty
        sqlQuery = prismaTx.$queryRaw`
        SELECT sum(if(type = 'I', amount, 0)) as 'category_balance_credit',
               sum(if(type = 'E', amount, 0)) as 'category_balance_debit'
        FROM transactions
        WHERE date_timestamp BETWEEN ${fromDate} AND ${toDate}
          AND categories_category_id = ${categoryId}`;
      }

      return sqlQuery;
    }, dbClient);
  }


  static async getAmountForCategoryInMonth(
    categoryId: bigint,
    month: number,
    year: number,
    includeTransfers = true,
    dbClient = prisma
  ): Promise<CalculatedCategoryAmounts>{
    return performDatabaseRequest(async (prismaTx) => {
      const nextMonth = month < 12 ? month + 1 : 1;
      const nextMonthsYear = month < 12 ? year : year + 1;
      const maxDate = DateTimeUtils.getUnixTimestampFromDate(
        new Date(nextMonthsYear, nextMonth - 1, 1)
      );
      const minDate = DateTimeUtils.getUnixTimestampFromDate(new Date(year, month - 1, 1));
      /* Logger.addLog(`cat id: ${categoryId} | month: ${month} | year: ${year} | minDate: ${minDate} | maxDate: ${maxDate}`); */
      const amounts = await this.getAmountForCategoryInPeriod(
        categoryId,
        minDate,
        maxDate,
        includeTransfers,
        prismaTx
      );

      return amounts[0]
    }, dbClient);
  }

  static async getAmountForCategoryInYear(
    categoryId: bigint,
    year: number,
    includeTransfers = true,
    dbClient = prisma
  ): Promise<CalculatedCategoryAmounts> {
    const maxDate = DateTimeUtils.getUnixTimestampFromDate(new Date(year, 11, 31));
    const minDate = DateTimeUtils.getUnixTimestampFromDate(new Date(year, 0, 1));
    /* Logger.addLog(`cat id: ${categoryId} | month: ${month} | year: ${year} | minDate: ${minDate} | maxDate: ${maxDate}`); */
    const amounts = await this.getAmountForCategoryInPeriod(
      categoryId,
      minDate,
      maxDate,
      includeTransfers,
      dbClient
    );

    return amounts[0];
  };

  static async getAverageAmountForCategoryInLifetime (
    userId: number | bigint,
    categoryId: number | bigint,
    dbClient = prisma
  ){
    const firstTimestamp = await TransactionService.getDateTimestampOfFirstTransactionForUser(userId as bigint, dbClient);
    const nrOfTotalMonthsFromFirstTrx = DateTimeUtils.getFullMonthsBetweenDates(new Date(Number(firstTimestamp) * 1000), new Date())
    const sumAmounts = (await this.getAmountForCategoryInPeriod(categoryId, 0, DateTimeUtils.getCurrentUnixTimestamp(), true, dbClient))[0];

    return {
      category_balance_credit: ConvertUtils.convertBigIntegerToFloat(BigInt(sumAmounts.category_balance_credit ?? 0)) / nrOfTotalMonthsFromFirstTrx,
      category_balance_debit: ConvertUtils.convertBigIntegerToFloat(BigInt(sumAmounts.category_balance_debit ?? 0)) / nrOfTotalMonthsFromFirstTrx
    }
  };

  /**
   * Gets all (active) categories for the user, with planned & current amounts
   * related to a specific budget
   */
  static async getAllCategoriesForBudget(
    userId: number | bigint,
    budgetId: number | bigint,
    dbClient = prisma
  ): Promise<Array<Prisma.categoriesUpdateInput>> {
    return dbClient.$queryRaw`SELECT users_user_id,
                                     category_id,
                                     name,
                                     status,
                                     type,
                                     description,
                                     color_gradient,
                                     budgets_budget_id,
                                     exclude_from_budgets,
                                     truncate((coalesce(planned_amount_credit, 0) / 100), 2) as planned_amount_credit,
                                     truncate((coalesce(planned_amount_debit, 0) / 100), 2)  as planned_amount_debit,
                                     truncate((coalesce(current_amount, 0) / 100), 2)        as current_amount
                              FROM (SELECT *
                                    FROM budgets_has_categories
                                    WHERE budgets_users_user_id = ${userId}
                                      AND (budgets_budget_id = ${budgetId})) b
                                     RIGHT JOIN categories ON categories.category_id = b.categories_category_id
                              WHERE users_user_id = ${userId}
                                AND status = ${MYFIN.CATEGORY_STATUS.ACTIVE}`;
  }

  static async getCountOfUserCategories(userId: bigint, dbClient = prisma){
    return dbClient.categories.count({
      where: {users_user_id: userId},
    });
  }
}

export default CategoryService;
