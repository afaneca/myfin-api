import { beforeEach, describe, expect, test } from 'vitest';
import { prisma } from '../../src/config/prisma.js';
import { MYFIN } from '../../src/consts.js';
import BudgetService from '../../src/services/budgetService.js';
import UserService from '../../src/services/userService.js';

describe('Budget list tests', () => {
  let userId: bigint;
  let zeroCreditBudgetId: bigint;
  let openBudgetId: bigint;
  let closedBudgetId: bigint;

  beforeEach(async () => {
    const user = await UserService.createUser({
      username: 'budget-user',
      password: '123',
      email: 'budget-user@myfinbudget.com',
    });
    userId = user.user_id;

    const regularAccount = await prisma.accounts.create({
      data: {
        name: 'Checking',
        type: MYFIN.ACCOUNT_TYPES.CHECKING,
        description: '',
        exclude_from_budgets: false,
        status: MYFIN.ACCOUNT_STATUS.ACTIVE,
        users_user_id: userId,
        current_balance: 0n,
      },
    });
    const excludedAccount = await prisma.accounts.create({
      data: {
        name: 'Excluded',
        type: MYFIN.ACCOUNT_TYPES.SAVINGS,
        description: '',
        exclude_from_budgets: true,
        status: MYFIN.ACCOUNT_STATUS.ACTIVE,
        users_user_id: userId,
        current_balance: 0n,
      },
    });
    const investmentAccount = await prisma.accounts.create({
      data: {
        name: 'Investments',
        type: MYFIN.ACCOUNT_TYPES.INVESTING,
        description: '',
        exclude_from_budgets: false,
        status: MYFIN.ACCOUNT_STATUS.ACTIVE,
        users_user_id: userId,
        current_balance: 0n,
      },
    });

    const incomeCategory = await prisma.categories.create({
      data: {
        name: 'Income',
        type: MYFIN.TRX_TYPES.INCOME,
        users_user_id: userId,
        status: MYFIN.CATEGORY_STATUS.ACTIVE,
        exclude_from_budgets: 0,
      },
    });
    const expenseCategory = await prisma.categories.create({
      data: {
        name: 'Expense',
        type: MYFIN.TRX_TYPES.EXPENSE,
        users_user_id: userId,
        status: MYFIN.CATEGORY_STATUS.ACTIVE,
        exclude_from_budgets: 0,
      },
    });
    const excludedCategory = await prisma.categories.create({
      data: {
        name: 'Ignored',
        type: MYFIN.TRX_TYPES.EXPENSE,
        users_user_id: userId,
        status: MYFIN.CATEGORY_STATUS.ACTIVE,
        exclude_from_budgets: 1,
      },
    });
    const inactiveCategory = await prisma.categories.create({
      data: {
        name: 'Inactive',
        type: MYFIN.TRX_TYPES.EXPENSE,
        users_user_id: userId,
        status: MYFIN.CATEGORY_STATUS.INACTIVE,
        exclude_from_budgets: 0,
      },
    });

    const zeroCreditBudget = await prisma.budgets.create({
      data: {
        month: 3,
        year: 2026,
        observations: 'Zero credit plan',
        is_open: true,
        users_user_id: userId,
      },
    });
    zeroCreditBudgetId = zeroCreditBudget.budget_id;
    const openBudget = await prisma.budgets.create({
      data: {
        month: 2,
        year: 2026,
        observations: 'Open plan',
        is_open: true,
        users_user_id: userId,
      },
    });
    openBudgetId = openBudget.budget_id;
    const closedBudget = await prisma.budgets.create({
      data: {
        month: 1,
        year: 2026,
        observations: 'Closed actual',
        is_open: false,
        users_user_id: userId,
      },
    });
    closedBudgetId = closedBudget.budget_id;

    await prisma.budgets_has_categories.createMany({
      data: [
        {
          budgets_budget_id: zeroCreditBudgetId,
          budgets_users_user_id: userId,
          categories_category_id: expenseCategory.category_id,
          planned_amount_credit: 0n,
          planned_amount_debit: 100_00n,
        },
        {
          budgets_budget_id: openBudgetId,
          budgets_users_user_id: userId,
          categories_category_id: incomeCategory.category_id,
          planned_amount_credit: 1000_00n,
          planned_amount_debit: 0n,
        },
        {
          budgets_budget_id: openBudgetId,
          budgets_users_user_id: userId,
          categories_category_id: expenseCategory.category_id,
          planned_amount_credit: 0n,
          planned_amount_debit: 400_00n,
        },
        {
          budgets_budget_id: openBudgetId,
          budgets_users_user_id: userId,
          categories_category_id: excludedCategory.category_id,
          planned_amount_credit: 9999_00n,
          planned_amount_debit: 9999_00n,
        },
      ],
    });

    await prisma.balances_snapshot.createMany({
      data: [
        {
          accounts_account_id: regularAccount.account_id,
          month: 12,
          year: 2025,
          balance: 500_00n,
          created_timestamp: 1n,
        },
        {
          accounts_account_id: excludedAccount.account_id,
          month: 12,
          year: 2025,
          balance: 100_00n,
          created_timestamp: 1n,
        },
        {
          accounts_account_id: investmentAccount.account_id,
          month: 12,
          year: 2025,
          balance: 200_00n,
          created_timestamp: 1n,
        },
      ],
    });

    const januaryTimestamp = BigInt(new Date(2026, 0, 15).getTime() / 1000);
    await prisma.transactions.createMany({
      data: [
        {
          date_timestamp: januaryTimestamp,
          amount: 1000_00n,
          type: MYFIN.TRX_TYPES.INCOME,
          description: 'Regular income',
          accounts_account_to_id: regularAccount.account_id,
          categories_category_id: incomeCategory.category_id,
        },
        {
          date_timestamp: januaryTimestamp,
          amount: 250_00n,
          type: MYFIN.TRX_TYPES.EXPENSE,
          description: 'Regular expense',
          accounts_account_from_id: regularAccount.account_id,
          categories_category_id: expenseCategory.category_id,
        },
        {
          date_timestamp: januaryTimestamp,
          amount: 50_00n,
          type: MYFIN.TRX_TYPES.TRANSFER,
          description: 'Transfer to excluded account',
          accounts_account_from_id: regularAccount.account_id,
          accounts_account_to_id: excludedAccount.account_id,
          categories_category_id: expenseCategory.category_id,
        },
        {
          date_timestamp: januaryTimestamp,
          amount: 200_00n,
          type: MYFIN.TRX_TYPES.INCOME,
          description: 'Investment income',
          accounts_account_to_id: investmentAccount.account_id,
          categories_category_id: incomeCategory.category_id,
        },
        {
          date_timestamp: januaryTimestamp,
          amount: 100_00n,
          type: MYFIN.TRX_TYPES.EXPENSE,
          description: 'Investment expense',
          accounts_account_from_id: investmentAccount.account_id,
          categories_category_id: expenseCategory.category_id,
        },
        {
          date_timestamp: januaryTimestamp,
          amount: 999_00n,
          type: MYFIN.TRX_TYPES.EXPENSE,
          description: 'Excluded category expense',
          accounts_account_from_id: regularAccount.account_id,
          categories_category_id: excludedCategory.category_id,
        },
        {
          date_timestamp: januaryTimestamp,
          amount: 888_00n,
          type: MYFIN.TRX_TYPES.EXPENSE,
          description: 'Inactive category expense',
          accounts_account_from_id: regularAccount.account_id,
          categories_category_id: inactiveCategory.category_id,
        },
      ],
    });
  });

  test('returns paginated budgets in order with exact open and closed metrics', async () => {
    const firstPage = await BudgetService.getFilteredBudgetsForUserByPage(userId, 0, 2, '', '');

    expect(firstPage.total_count).toBe(3);
    expect(firstPage.filtered_count).toBe(3);
    expect(firstPage.results).toHaveLength(2);
    expect(firstPage.results[0]).toMatchObject({
      budget_id: zeroCreditBudgetId,
      credit_amount: 0,
      debit_amount: 100,
      balance_value: -100,
      balance_change_percentage: -12.5,
      savings_rate_percentage: 0,
    });
    expect(firstPage.results[1]).toMatchObject({
      budget_id: openBudgetId,
      credit_amount: 1000,
      debit_amount: 400,
      balance_value: 600,
      balance_change_percentage: 75,
      savings_rate_percentage: 60,
    });

    const secondPage = await BudgetService.getFilteredBudgetsForUserByPage(userId, 1, 2, '', '');
    expect(secondPage.results).toHaveLength(1);
    expect(secondPage.results[0]).toMatchObject({
      budget_id: closedBudgetId,
      credit_amount: 1000,
      debit_amount: 300,
      balance_value: 700,
      balance_change_percentage: 87.5,
      savings_rate_percentage: 70,
    });
  });

  test('applies search and open/closed filters while preserving total count', async () => {
    const searchResult = await BudgetService.getFilteredBudgetsForUserByPage(
      userId,
      0,
      10,
      'actual',
      ''
    );
    expect(searchResult.total_count).toBe(3);
    expect(searchResult.filtered_count).toBe(1);
    expect(searchResult.results[0].budget_id).toBe(closedBudgetId);

    const closedResult = await BudgetService.getFilteredBudgetsForUserByPage(
      userId,
      0,
      10,
      '',
      'C'
    );
    expect(closedResult.total_count).toBe(3);
    expect(closedResult.filtered_count).toBe(1);
    expect(closedResult.results[0].budget_id).toBe(closedBudgetId);

    const openResult = await BudgetService.getFilteredBudgetsForUserByPage(userId, 0, 10, '', 'O');
    expect(openResult.total_count).toBe(3);
    expect(openResult.filtered_count).toBe(2);
    expect(openResult.results.map((budget) => budget.budget_id)).toEqual([
      zeroCreditBudgetId,
      openBudgetId,
    ]);
  });
});
