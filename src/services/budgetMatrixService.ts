import { performDatabaseRequest, prisma } from '../config/prisma.js';
import { MYFIN } from '../consts.js';
import APIError from '../errorHandling/apiError.js';
import { Prisma } from '../generated/prisma/client.js';
import DateTimeUtils from '../utils/DateTimeUtils.js';
import ConvertUtils from '../utils/convertUtils.js';

type BudgetMatrixBudget = {
  budget_id: bigint;
  month: number;
  year: number;
  observations: string;
  is_open: boolean;
  initial_balance: number;
  categories: Array<{
    category_id: bigint;
    planned_amount_credit: number;
    planned_amount_debit: number;
    current_amount_credit: number;
    current_amount_debit: number;
    tooltip: {
      avg_previous_month_credit: number;
      avg_previous_month_debit: number;
      avg_same_month_previous_year_credit: number;
      avg_same_month_previous_year_debit: number;
    };
  }>;
  totals: {
    planned_amount_credit: number;
    planned_amount_debit: number;
    current_amount_credit: number;
    current_amount_debit: number;
  };
};

type RawAmountRow = {
  budget_id: bigint;
  categories_category_id: bigint | null;
  category_balance_credit: bigint | number | string | null;
  category_balance_debit: bigint | number | string | null;
};

type RawTooltipRow = {
  categories_category_id: bigint;
  last_12_months_credit: bigint | number | string | null;
  last_12_months_debit: bigint | number | string | null;
  lifetime_credit: bigint | number | string | null;
  lifetime_debit: bigint | number | string | null;
};

type RawBudgetTooltipRow = {
  budget_id: bigint;
  categories_category_id: bigint;
  previous_month_credit: bigint | number | string | null;
  previous_month_debit: bigint | number | string | null;
  same_month_previous_year_credit: bigint | number | string | null;
  same_month_previous_year_debit: bigint | number | string | null;
};

type FirstTransactionRow = {
  first_transaction_timestamp: bigint | number | string | null;
};

type SnapshotRow = {
  accounts_account_id: bigint;
  month: number;
  year: number;
  balance: bigint | number | string;
};

const toBigInt = (value: bigint | number | string | null | undefined): bigint => BigInt(value ?? 0);

const amountInEuros = (value: bigint | number | string | null | undefined): number =>
  ConvertUtils.convertBigIntegerToFloat(toBigInt(value));

const getBudgetDateRange = (month: number, year: number) => {
  const nextMonth = month < 12 ? month + 1 : 1;
  const nextYear = month < 12 ? year : year + 1;
  return {
    from: DateTimeUtils.getUnixTimestampFromDate(new Date(year, month - 1, 1)),
    to: DateTimeUtils.getUnixTimestampFromDate(new Date(nextYear, nextMonth - 1, 1)),
  };
};

const getPreviousMonth = (month: number, year: number) =>
  month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };

const amountKey = (budgetId: bigint, categoryId: bigint) =>
  budgetId.toString().concat(':', categoryId.toString());

class BudgetMatrixService {
  static async getBudgetMatrix(
    userId: bigint,
    requestedBudgetIds: Array<number | bigint>,
    dbClient = prisma
  ) {
    if (!requestedBudgetIds || requestedBudgetIds.length === 0 || requestedBudgetIds.length > 5) {
      throw APIError.badRequest('Select between one and five budgets.');
    }

    let budgetIds: bigint[];
    try {
      budgetIds = Array.from(
        new Set(
          requestedBudgetIds.map((budgetId) => {
            const normalizedId = BigInt(budgetId);
            if (normalizedId < 1n) throw new Error('Invalid budget id');
            return normalizedId.toString();
          })
        )
      ).map((budgetId) => BigInt(budgetId));
    } catch {
      throw APIError.badRequest('Budget ids must be positive integers.');
    }

    if (budgetIds.length > 5) {
      throw APIError.badRequest('Select between one and five budgets.');
    }

    const budgets = await dbClient.budgets.findMany({
      where: {
        users_user_id: userId,
        budget_id: { in: budgetIds },
      },
      select: {
        budget_id: true,
        month: true,
        year: true,
        observations: true,
        is_open: true,
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    if (budgets.length !== budgetIds.length) {
      throw APIError.notFound('One or more requested budgets could not be found.');
    }

    const budgetDateConditions = budgets.map((budget) => {
      const dateRange = getBudgetDateRange(budget.month, budget.year);
      return Prisma.sql`(budgets.budget_id = ${budget.budget_id}
        AND transactions.date_timestamp >= ${dateRange.from}
        AND transactions.date_timestamp < ${dateRange.to})`;
    });
    const referenceBudget = budgets[budgets.length - 1];
    const currentTimestamp = DateTimeUtils.getCurrentUnixTimestamp();
    const currentMonth = DateTimeUtils.getMonthNumberFromTimestamp(currentTimestamp);
    const currentYear = DateTimeUtils.getYearFromTimestamp(currentTimestamp);
    const last12MonthsPeriod = DateTimeUtils.decrementMonthByX(currentMonth, currentYear, 12);
    const last12MonthsFrom = DateTimeUtils.getUnixTimestampFromDate(
      new Date(last12MonthsPeriod.year, last12MonthsPeriod.month - 1, 1)
    );
    const budgetTooltipQueries = budgets.map((budget) => {
      const previousPeriod = getPreviousMonth(budget.month, budget.year);
      const previousMonthRange = getBudgetDateRange(previousPeriod.month, previousPeriod.year);
      const sameMonthPreviousYearRange = getBudgetDateRange(
        budget.month,
        budget.year - 1
      );
      const from = Math.min(
        previousMonthRange.from,
        sameMonthPreviousYearRange.from
      );
      const to = Math.max(previousMonthRange.to, sameMonthPreviousYearRange.to);
      return Prisma.sql`
        SELECT
          ${budget.budget_id} AS budget_id,
          transactions.categories_category_id,
          SUM(
            IF(
              transactions.date_timestamp >= ${previousMonthRange.from}
              AND transactions.date_timestamp < ${previousMonthRange.to}
              AND transactions.type = ${MYFIN.TRX_TYPES.INCOME},
              transactions.amount,
              0
            )
          ) AS previous_month_credit,
          SUM(
            IF(
              transactions.date_timestamp >= ${previousMonthRange.from}
              AND transactions.date_timestamp < ${previousMonthRange.to}
              AND (
                transactions.type = ${MYFIN.TRX_TYPES.EXPENSE}
                OR (
                  transactions.type = ${MYFIN.TRX_TYPES.TRANSFER}
                  AND EXISTS (
                    SELECT 1
                    FROM accounts excluded_accounts
                    WHERE excluded_accounts.account_id = transactions.accounts_account_to_id
                      AND excluded_accounts.users_user_id = ${userId}
                      AND excluded_accounts.exclude_from_budgets = TRUE
                  )
                )
              ),
              transactions.amount,
              0
            )
          ) AS previous_month_debit,
          SUM(
            IF(
              transactions.date_timestamp >= ${sameMonthPreviousYearRange.from}
              AND transactions.date_timestamp < ${sameMonthPreviousYearRange.to}
              AND transactions.type = ${MYFIN.TRX_TYPES.INCOME},
              transactions.amount,
              0
            )
          ) AS same_month_previous_year_credit,
          SUM(
            IF(
              transactions.date_timestamp >= ${sameMonthPreviousYearRange.from}
              AND transactions.date_timestamp < ${sameMonthPreviousYearRange.to}
              AND (
                transactions.type = ${MYFIN.TRX_TYPES.EXPENSE}
                OR (
                  transactions.type = ${MYFIN.TRX_TYPES.TRANSFER}
                  AND EXISTS (
                    SELECT 1
                    FROM accounts excluded_accounts
                    WHERE excluded_accounts.account_id = transactions.accounts_account_to_id
                      AND excluded_accounts.users_user_id = ${userId}
                      AND excluded_accounts.exclude_from_budgets = TRUE
                  )
                )
              ),
              transactions.amount,
              0
            )
          ) AS same_month_previous_year_debit
        FROM transactions
        INNER JOIN categories
          ON categories.category_id = transactions.categories_category_id
          AND categories.users_user_id = ${userId}
          AND categories.status = ${MYFIN.CATEGORY_STATUS.ACTIVE}
        WHERE transactions.date_timestamp >= ${from}
          AND transactions.date_timestamp < ${to}
          AND (
            EXISTS (
              SELECT 1
              FROM accounts scoped_account_from
              WHERE scoped_account_from.account_id = transactions.accounts_account_from_id
                AND scoped_account_from.users_user_id = ${userId}
            )
            OR EXISTS (
              SELECT 1
              FROM accounts scoped_account_to
              WHERE scoped_account_to.account_id = transactions.accounts_account_to_id
                AND scoped_account_to.users_user_id = ${userId}
            )
          )
        GROUP BY transactions.categories_category_id`;
    });

    const [
      categories,
      plannedRows,
      actualRows,
      investmentRows,
      userAccounts,
      tooltipRows,
      budgetTooltipRows,
      firstTransactionRows,
    ] = await Promise.all([
      dbClient.categories.findMany({
        where: {
          users_user_id: userId,
          status: MYFIN.CATEGORY_STATUS.ACTIVE,
        },
        select: {
          category_id: true,
          name: true,
          status: true,
          type: true,
          description: true,
          color_gradient: true,
          icon_key: true,
          exclude_from_budgets: true,
        },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),
      dbClient.budgets_has_categories.findMany({
        where: {
          budgets_users_user_id: userId,
          budgets_budget_id: { in: budgetIds },
        },
        select: {
          budgets_budget_id: true,
          categories_category_id: true,
          planned_amount_credit: true,
          planned_amount_debit: true,
        },
      }),
      dbClient.$queryRaw<RawAmountRow[]>`
          SELECT
            budgets.budget_id,
            transactions.categories_category_id,
            SUM(IF(transactions.type = ${MYFIN.TRX_TYPES.INCOME}, transactions.amount, 0))
              AS category_balance_credit,
            SUM(
              IF(
                transactions.type = ${MYFIN.TRX_TYPES.EXPENSE}
                  OR (
                    transactions.type = ${MYFIN.TRX_TYPES.TRANSFER}
                    AND EXISTS (
                      SELECT 1
                      FROM accounts excluded_accounts
                      WHERE excluded_accounts.account_id = transactions.accounts_account_to_id
                        AND excluded_accounts.users_user_id = ${userId}
                        AND excluded_accounts.exclude_from_budgets = TRUE
                    )
                  ),
                transactions.amount,
                0
              )
            ) AS category_balance_debit
          FROM budgets
          INNER JOIN transactions ON (${Prisma.join(budgetDateConditions, ' OR ')})
          WHERE budgets.users_user_id = ${userId}
            AND transactions.categories_category_id IS NOT NULL
            AND (
              EXISTS (
                SELECT 1
                FROM accounts scoped_account_from
                WHERE scoped_account_from.account_id = transactions.accounts_account_from_id
                  AND scoped_account_from.users_user_id = ${userId}
              )
              OR EXISTS (
                SELECT 1
                FROM accounts scoped_account_to
                WHERE scoped_account_to.account_id = transactions.accounts_account_to_id
                  AND scoped_account_to.users_user_id = ${userId}
              )
            )
          GROUP BY budgets.budget_id, transactions.categories_category_id`,
      dbClient.$queryRaw<RawAmountRow[]>`
          SELECT
            budgets.budget_id,
            transactions.categories_category_id,
            SUM(IF(transactions.type = ${MYFIN.TRX_TYPES.INCOME}, transactions.amount, 0))
              AS category_balance_credit,
            SUM(
              IF(
                transactions.type = ${MYFIN.TRX_TYPES.EXPENSE}
                  OR transactions.type = ${MYFIN.TRX_TYPES.TRANSFER},
                transactions.amount,
                0
              )
            ) AS category_balance_debit
          FROM budgets
          INNER JOIN transactions ON (${Prisma.join(budgetDateConditions, ' OR ')})
          INNER JOIN accounts
            ON accounts.account_id = transactions.accounts_account_from_id
            OR accounts.account_id = transactions.accounts_account_to_id
          WHERE budgets.users_user_id = ${userId}
            AND accounts.users_user_id = ${userId}
            AND accounts.type = ${MYFIN.ACCOUNT_TYPES.INVESTING}
            AND transactions.type != ${MYFIN.TRX_TYPES.TRANSFER}
            AND transactions.categories_category_id IS NOT NULL
          GROUP BY budgets.budget_id, transactions.categories_category_id`,
      dbClient.accounts.findMany({
        where: { users_user_id: userId },
        select: { account_id: true },
      }),
      dbClient.$queryRaw<RawTooltipRow[]>`
        SELECT
          transactions.categories_category_id,
          SUM(
            IF(
                transactions.date_timestamp >= ${last12MonthsFrom}
                AND transactions.date_timestamp <= ${currentTimestamp}
                AND transactions.type = ${MYFIN.TRX_TYPES.INCOME},
              transactions.amount,
              0
            )
          ) AS last_12_months_credit,
          SUM(
            IF(
                transactions.date_timestamp >= ${last12MonthsFrom}
                AND transactions.date_timestamp <= ${currentTimestamp}
                AND (
                  transactions.type = ${MYFIN.TRX_TYPES.EXPENSE}
                  OR (
                    transactions.type = ${MYFIN.TRX_TYPES.TRANSFER}
                    AND EXISTS (
                      SELECT 1
                      FROM accounts excluded_accounts
                      WHERE excluded_accounts.account_id = transactions.accounts_account_to_id
                        AND excluded_accounts.users_user_id = ${userId}
                        AND excluded_accounts.exclude_from_budgets = TRUE
                    )
                  )
                ),
              transactions.amount,
              0
            )
          ) AS last_12_months_debit,
          SUM(IF(transactions.type = ${MYFIN.TRX_TYPES.INCOME}, transactions.amount, 0))
            AS lifetime_credit,
          SUM(
            IF(
              transactions.type = ${MYFIN.TRX_TYPES.EXPENSE}
                OR (
                  transactions.type = ${MYFIN.TRX_TYPES.TRANSFER}
                  AND EXISTS (
                    SELECT 1
                  FROM accounts excluded_accounts
                  WHERE excluded_accounts.account_id = transactions.accounts_account_to_id
                    AND excluded_accounts.users_user_id = ${userId}
                    AND excluded_accounts.exclude_from_budgets = TRUE
                  )
                ),
              transactions.amount,
              0
            )
          ) AS lifetime_debit
        FROM transactions
        INNER JOIN categories
          ON categories.category_id = transactions.categories_category_id
          AND categories.users_user_id = ${userId}
          AND categories.status = ${MYFIN.CATEGORY_STATUS.ACTIVE}
        WHERE transactions.date_timestamp <= ${currentTimestamp}
          AND (
            EXISTS (
              SELECT 1
              FROM accounts scoped_account_from
              WHERE scoped_account_from.account_id = transactions.accounts_account_from_id
                AND scoped_account_from.users_user_id = ${userId}
            )
            OR EXISTS (
              SELECT 1
              FROM accounts scoped_account_to
              WHERE scoped_account_to.account_id = transactions.accounts_account_to_id
                AND scoped_account_to.users_user_id = ${userId}
            )
          )
        GROUP BY transactions.categories_category_id`,
      dbClient.$queryRaw<RawBudgetTooltipRow[]>(Prisma.join(budgetTooltipQueries, ' UNION ALL ')),
      dbClient.$queryRaw<FirstTransactionRow[]>`
        SELECT MIN(transactions.date_timestamp) AS first_transaction_timestamp
        FROM transactions
        LEFT JOIN accounts account_from
          ON account_from.account_id = transactions.accounts_account_from_id
        LEFT JOIN accounts account_to
          ON account_to.account_id = transactions.accounts_account_to_id
        WHERE account_from.users_user_id = ${userId}
           OR account_to.users_user_id = ${userId}`,
    ]);
    const previousPeriods = budgets.map((budget) => getPreviousMonth(budget.month, budget.year));
    const latestPeriod = previousPeriods.at(-1);
    const snapshotRows =
      userAccounts.length === 0
        ? []
        : await dbClient.$queryRaw<SnapshotRow[]>`
            SELECT accounts_account_id, month, year, balance
            FROM balances_snapshot
            WHERE accounts_account_id IN (${Prisma.join(
              userAccounts.map((account) => account.account_id)
            )})
              AND (
                year < ${latestPeriod.year}
                OR (year = ${latestPeriod.year} AND month <= ${latestPeriod.month})
              )`;

    const snapshotsByAccount = new Map<string, SnapshotRow[]>();
    for (const snapshot of snapshotRows) {
      const key = snapshot.accounts_account_id.toString();
      const accountSnapshots = snapshotsByAccount.get(key) ?? [];
      accountSnapshots.push(snapshot);
      snapshotsByAccount.set(key, accountSnapshots);
    }
    for (const accountSnapshots of snapshotsByAccount.values()) {
      accountSnapshots.sort((left, right) =>
        left.year === right.year ? left.month - right.month : left.year - right.year
      );
    }

    const initialBalances = new Map<string, number>();
    const snapshotIndexes = new Map<string, number>();
    for (const budget of budgets) {
      const period = getPreviousMonth(budget.month, budget.year);
      let balance = 0n;
      for (const account of userAccounts) {
        const accountKey = account.account_id.toString();
        const accountSnapshots = snapshotsByAccount.get(accountKey) ?? [];
        let snapshotIndex = snapshotIndexes.get(accountKey) ?? -1;
        while (snapshotIndex + 1 < accountSnapshots.length) {
          const nextSnapshot = accountSnapshots[snapshotIndex + 1];
          if (
            nextSnapshot.year > period.year ||
            (nextSnapshot.year === period.year && nextSnapshot.month > period.month)
          ) {
            break;
          }
          snapshotIndex += 1;
        }
        snapshotIndexes.set(accountKey, snapshotIndex);
        if (snapshotIndex >= 0) {
          balance += toBigInt(accountSnapshots[snapshotIndex].balance);
        }
      }
      initialBalances.set(budget.budget_id.toString(), amountInEuros(balance));
    }

    const plannedByKey = new Map<string, (typeof plannedRows)[number]>();
    for (const row of plannedRows) {
      plannedByKey.set(amountKey(row.budgets_budget_id, row.categories_category_id), row);
    }
    const actualByKey = new Map<string, RawAmountRow>();
    for (const row of actualRows) {
      if (row.categories_category_id != null) {
        actualByKey.set(amountKey(row.budget_id, row.categories_category_id), row);
      }
    }
    const investmentByKey = new Map<string, RawAmountRow>();
    for (const row of investmentRows) {
      if (row.categories_category_id != null) {
        investmentByKey.set(amountKey(row.budget_id, row.categories_category_id), row);
      }
    }

    const firstTransactionTimestamp = Number(
      firstTransactionRows[0]?.first_transaction_timestamp ?? 0
    );
    const totalMonthsSinceFirstTransaction = Math.max(
      1,
      DateTimeUtils.getFullMonthsBetweenDates(
        new Date(firstTransactionTimestamp * 1000),
        new Date(currentTimestamp * 1000)
      )
    );
    const last12MonthsDivisor = Math.min(12, totalMonthsSinceFirstTransaction);
    const tooltipByCategory = new Map<string, RawTooltipRow>();
    for (const row of tooltipRows) {
      tooltipByCategory.set(row.categories_category_id.toString(), row);
    }
    const tooltipByBudgetAndCategory = new Map<string, RawBudgetTooltipRow>();
    for (const row of budgetTooltipRows) {
      tooltipByBudgetAndCategory.set(
        amountKey(row.budget_id, row.categories_category_id),
        row
      );
    }
    const referenceTooltipByCategory = new Map(
      categories.map((category) => [
        category.category_id.toString(),
        tooltipByBudgetAndCategory.get(
          amountKey(referenceBudget.budget_id, category.category_id)
        ),
      ])
    );
    const categoryMetadata = categories.map((category) => {
      const tooltip = referenceTooltipByCategory.get(category.category_id.toString());
      const globalTooltip = tooltipByCategory.get(category.category_id.toString());
      return {
        category_id: category.category_id,
        name: category.name,
        status: category.status,
        type: category.type,
        description: category.description,
        color_gradient: category.color_gradient,
        icon_key: category.icon_key,
        exclude_from_budgets: category.exclude_from_budgets,
        avg_previous_month_credit: Math.abs(
          amountInEuros(tooltip?.previous_month_credit)
        ),
        avg_previous_month_debit: Math.abs(
          amountInEuros(tooltip?.previous_month_debit)
        ),
        avg_same_month_previous_year_credit: Math.abs(
          amountInEuros(tooltip?.same_month_previous_year_credit)
        ),
        avg_same_month_previous_year_debit: Math.abs(
          amountInEuros(tooltip?.same_month_previous_year_debit)
        ),
        avg_12_months_credit: Math.abs(
          amountInEuros(globalTooltip?.last_12_months_credit) / last12MonthsDivisor
        ),
        avg_12_months_debit: Math.abs(
          amountInEuros(globalTooltip?.last_12_months_debit) / last12MonthsDivisor
        ),
        avg_lifetime_credit: Math.abs(
          amountInEuros(globalTooltip?.lifetime_credit) /
            totalMonthsSinceFirstTransaction
        ),
        avg_lifetime_debit: Math.abs(
          amountInEuros(globalTooltip?.lifetime_debit) /
            totalMonthsSinceFirstTransaction
        ),
      };
    });
    const excludedByCategory = new Map(
      categories.map((category) => [
        category.category_id.toString(),
        Boolean(category.exclude_from_budgets),
      ])
    );

    const matrixBudgets: BudgetMatrixBudget[] = budgets.map((budget) => {
      const values = categories.map((category) => {
        const key = amountKey(budget.budget_id, category.category_id);
        const planned = plannedByKey.get(key);
        const actual = actualByKey.get(key);
        const investment = investmentByKey.get(key);
        const currentCredit =
          toBigInt(actual?.category_balance_credit) - toBigInt(investment?.category_balance_credit);
        const currentDebit =
          toBigInt(actual?.category_balance_debit) - toBigInt(investment?.category_balance_debit);
        return {
          category_id: category.category_id,
          planned_amount_credit: amountInEuros(planned?.planned_amount_credit),
          planned_amount_debit: amountInEuros(planned?.planned_amount_debit),
          current_amount_credit: Math.abs(amountInEuros(currentCredit)),
          current_amount_debit: Math.abs(amountInEuros(currentDebit)),
          tooltip: {
            avg_previous_month_credit: Math.abs(
              amountInEuros(
                tooltipByBudgetAndCategory.get(key)?.previous_month_credit
              )
            ),
            avg_previous_month_debit: Math.abs(
              amountInEuros(
                tooltipByBudgetAndCategory.get(key)?.previous_month_debit
              )
            ),
            avg_same_month_previous_year_credit: Math.abs(
              amountInEuros(
                tooltipByBudgetAndCategory.get(key)
                  ?.same_month_previous_year_credit
              )
            ),
            avg_same_month_previous_year_debit: Math.abs(
              amountInEuros(
                tooltipByBudgetAndCategory.get(key)
                  ?.same_month_previous_year_debit
              )
            ),
          },
        };
      });
      const totals = values.reduce(
        (result, value) => {
          if (excludedByCategory.get(value.category_id.toString())) return result;
          result.planned_amount_credit += value.planned_amount_credit;
          result.planned_amount_debit += value.planned_amount_debit;
          result.current_amount_credit += value.current_amount_credit;
          result.current_amount_debit += value.current_amount_debit;
          return result;
        },
        {
          planned_amount_credit: 0,
          planned_amount_debit: 0,
          current_amount_credit: 0,
          current_amount_debit: 0,
        }
      );
      for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
        totals[key] = Number(totals[key].toFixed(2));
      }
      return {
        budget_id: budget.budget_id,
        month: budget.month,
        year: budget.year,
        observations: budget.observations ?? '',
        is_open: budget.is_open,
        initial_balance: initialBalances.get(budget.budget_id.toString()) ?? 0,
        categories: values,
        totals,
      };
    });

    return {
      categories: categoryMetadata,
      budgets: matrixBudgets,
    };
  }

  static async updateBudgetDescription(
    userId: bigint,
    budgetId: number | bigint,
    observations: string,
    dbClient = undefined
  ) {
    return performDatabaseRequest(async (prismaTx) => {
      const normalizedBudgetId = BigInt(budgetId);
      const existingBudget = await prismaTx.budgets.findUnique({
        where: {
          users_user_id: userId,
          budget_id: normalizedBudgetId,
        },
        select: { budget_id: true },
      });
      if (!existingBudget) {
        throw APIError.notFound('The requested budget could not be found.');
      }
      return prismaTx.budgets.update({
        where: {
          users_user_id: userId,
          budget_id: normalizedBudgetId,
        },
        data: { observations },
      });
    }, dbClient);
  }
}

export default BudgetMatrixService;
