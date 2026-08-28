import { beforeEach, describe, expect, test } from 'vitest';
import { prisma } from '../../src/config/prisma.js';
import { MYFIN } from '../../src/consts.js';
import BudgetMatrixService from '../../src/services/budgetMatrixService.js';
import BudgetService from '../../src/services/budgetService.js';
import UserService from '../../src/services/userService.js';

describe('Budget list tests', () => {
  let userId: bigint;
  let zeroCreditBudgetId: bigint;
  let openBudgetId: bigint;
  let closedBudgetId: bigint;
  let regularAccountId: bigint;
  let expenseCategoryId: bigint;

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
    regularAccountId = regularAccount.account_id;
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
    expenseCategoryId = expenseCategory.category_id;
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
  test('loads one to five budgets with shared categories and detail-consistent values', async () => {
    const fourthBudget = await prisma.budgets.create({
      data: {
        month: 4,
        year: 2026,
        observations: 'Fourth plan',
        is_open: true,
        users_user_id: userId,
      },
    });
    const fifthBudget = await prisma.budgets.create({
      data: {
        month: 5,
        year: 2026,
        observations: 'Fifth plan',
        is_open: true,
        users_user_id: userId,
      },
    });
    const allBudgetIds = [
      closedBudgetId,
      openBudgetId,
      zeroCreditBudgetId,
      fourthBudget.budget_id,
      fifthBudget.budget_id,
    ];

    for (let count = 1; count <= allBudgetIds.length; count++) {
      const response = await BudgetMatrixService.getBudgetMatrix(
        userId,
        allBudgetIds.slice(0, count)
      );
      expect(response.budgets).toHaveLength(count);
    }

    const response = await BudgetMatrixService.getBudgetMatrix(userId, allBudgetIds);
    expect(response.budgets.map((budget) => budget.budget_id)).toEqual([
      closedBudgetId,
      openBudgetId,
      zeroCreditBudgetId,
      fourthBudget.budget_id,
      fifthBudget.budget_id,
    ]);
    expect(response.categories.map((category) => category.name)).toEqual([
      'Expense',
      'Ignored',
      'Income',
    ]);

    const open = response.budgets.find((budget) => budget.budget_id === openBudgetId);
    const openExpense = open?.categories.find(
      (category) => response.categories.find((item) => item.category_id === category.category_id)?.name === 'Expense'
    );
    const openIncome = open?.categories.find(
      (category) => response.categories.find((item) => item.category_id === category.category_id)?.name === 'Income'
    );
    const openIgnored = open?.categories.find(
      (category) => response.categories.find((item) => item.category_id === category.category_id)?.name === 'Ignored'
    );
    expect(open?.totals).toMatchObject({
      planned_amount_credit: 1000,
      planned_amount_debit: 400,
    });
    expect(openExpense).toMatchObject({ planned_amount_debit: 400 });
    expect(openIncome).toMatchObject({ planned_amount_credit: 1000 });
    expect(openExpense?.tooltip).toMatchObject({
      avg_previous_month_debit: 400,
    });
    const zeroMarch = response.budgets.find(
      (budget) => budget.budget_id === zeroCreditBudgetId
    );
    const zeroMarchExpense = zeroMarch?.categories.find(
      (category) => category.category_id === openExpense?.category_id
    );
    expect(zeroMarchExpense?.tooltip).toMatchObject({
      avg_previous_month_debit: 0,
    });
    expect(openIgnored).toMatchObject({
      planned_amount_credit: 9999,
      planned_amount_debit: 9999,
    });
    expect(response.budgets.find((budget) => budget.budget_id === zeroCreditBudgetId)?.categories)
      .toContainEqual(expect.objectContaining({ category_id: openIncome?.category_id }));

    const closedDetail = await BudgetService.getBudget(userId, closedBudgetId);
    const closedMatrix = response.budgets.find((budget) => budget.budget_id === closedBudgetId);
    const closedDetailExpense = closedDetail.categories.find(
      (category) => category.name === 'Expense'
    );
    const closedMatrixExpense = closedMatrix?.categories.find(
      (category) => category.category_id === closedDetailExpense?.category_id
    );
    expect(closedMatrixExpense).toMatchObject({
      current_amount_credit: closedDetailExpense.current_amount_credit,
      current_amount_debit: closedDetailExpense.current_amount_debit,
    });
    expect(closedMatrix?.initial_balance).toBe(closedDetail.initial_balance);
  });

  test('updates one matrix cell and a description without overwriting other values', async () => {
    const initial = await BudgetMatrixService.getBudgetMatrix(userId, [openBudgetId]);
    const expense = initial.categories.find((category) => category.name === 'Expense');
    const income = initial.categories.find((category) => category.name === 'Income');
    expect(expense).toBeDefined();
    expect(income).toBeDefined();

    await BudgetService.updateBudgetCategoryPlannedValues(
      userId,
      openBudgetId,
      expense?.category_id || -1n,
      777,
      undefined
    );
    await BudgetMatrixService.updateBudgetDescription(
      userId,
      openBudgetId,
      'Updated from matrix'
    );

    const updated = await BudgetMatrixService.getBudgetMatrix(userId, [openBudgetId]);
    const budget = updated.budgets[0];
    const updatedExpense = budget.categories.find(
      (category) => category.category_id === expense?.category_id
    );
    const updatedIncome = budget.categories.find(
      (category) => category.category_id === income?.category_id
    );
    expect(budget.observations).toBe('Updated from matrix');
    expect(updatedExpense?.planned_amount_debit).toBe(777);
    expect(updatedIncome?.planned_amount_credit).toBe(1000);
    await expect(
      BudgetService.updateBudgetCategoryPlannedValues(
        userId,
        closedBudgetId,
        expense?.category_id || -1n,
        1,
        undefined
      )
    ).rejects.toMatchObject({ code: 403 });

    const otherUser = await UserService.createUser({
      username: 'budget-other-user',
      password: '123',
      email: 'budget-other-user@myfinbudget.com',
    });
    const otherCategory = await prisma.categories.create({
      data: {
        name: 'Other user category',
        type: MYFIN.TRX_TYPES.EXPENSE,
        users_user_id: otherUser.user_id,
        status: MYFIN.CATEGORY_STATUS.ACTIVE,
        exclude_from_budgets: 0,
      },
    });
    await expect(
      BudgetService.updateBudgetCategoryPlannedValues(
        userId,
        openBudgetId,
        otherCategory.category_id,
        1,
        undefined
      )
    ).rejects.toMatchObject({ code: 404 });
  });

  test('keeps month-boundary and foreign-account transactions out of the wrong totals', async () => {
    const otherUser = await UserService.createUser({
      username: 'budget-foreign-user',
      password: '123',
      email: 'budget-foreign-user@myfinbudget.com',
    });
    const foreignAccount = await prisma.accounts.create({
      data: {
        name: 'Foreign account',
        type: MYFIN.ACCOUNT_TYPES.CHECKING,
        description: '',
        exclude_from_budgets: false,
        status: MYFIN.ACCOUNT_STATUS.ACTIVE,
        users_user_id: otherUser.user_id,
        current_balance: 0n,
      },
    });
    const boundaryTimestamp = BigInt(new Date(2026, 1, 1).getTime() / 1000);
    await prisma.transactions.createMany({
      data: [
        {
          date_timestamp: boundaryTimestamp,
          amount: 100_00n,
          type: MYFIN.TRX_TYPES.EXPENSE,
          description: 'Month boundary expense',
          accounts_account_from_id: regularAccountId,
          categories_category_id: expenseCategoryId,
        },
        {
          date_timestamp: BigInt(new Date(2026, 1, 15).getTime() / 1000),
          amount: 900_00n,
          type: MYFIN.TRX_TYPES.EXPENSE,
          description: 'Foreign account expense',
          accounts_account_from_id: foreignAccount.account_id,
          categories_category_id: expenseCategoryId,
        },
      ],
    });

    const response = await BudgetMatrixService.getBudgetMatrix(userId, [
      closedBudgetId,
      openBudgetId,
    ]);
    const january = response.budgets.find((budget) => budget.budget_id === closedBudgetId);
    const february = response.budgets.find((budget) => budget.budget_id === openBudgetId);
    expect(january?.categories.find((category) => category.category_id === expenseCategoryId))
      .toMatchObject({ current_amount_debit: 300 });
    expect(february?.categories.find((category) => category.category_id === expenseCategoryId))
      .toMatchObject({ current_amount_debit: 100 });
  });

  test('rejects more than five budgets and budgets owned by another user', async () => {
    await expect(
      BudgetMatrixService.getBudgetMatrix(userId, [
        closedBudgetId,
        openBudgetId,
        zeroCreditBudgetId,
        4n,
        5n,
        6n,
      ])
    ).rejects.toMatchObject({ code: 400 });
    await expect(
      BudgetMatrixService.getBudgetMatrix(userId, [999999999999n])
    ).rejects.toMatchObject({ code: 404 });
  });
});
