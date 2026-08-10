import { beforeEach, describe, expect, test, vi } from 'vitest';
import AccountService from '../../src/services/accountService.js';
import BudgetService from '../../src/services/budgetService.js';
import CategoryService from '../../src/services/categoryService.js';
import { mockedPrisma } from './prisma.mock.js';

describe('budgetService', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('calculateBudgetBalance', () => {
    test('Should return correct amount when is open', async () => {
      const userId = 1;
      const budgetId = 123;
      const budget = {
        budget_id: budgetId,
        month: 5,
        year: 2025,
        is_open: true,
      };

      const mockCategories = [
        {
          category_id: 1,
          planned_amount_credit: 100,
          planned_amount_debit: 50,
          exclude_from_budgets: false,
        },
        {
          category_id: 2,
          planned_amount_credit: 200,
          planned_amount_debit: 100,
          exclude_from_budgets: true,
        },
      ];

      vi.spyOn(BudgetService, 'getAllCategoriesForUser').mockResolvedValue(mockCategories);

      const balance = await BudgetService.calculateBudgetBalance(userId, budget, mockedPrisma);

      expect(balance).toBeCloseTo(50);
    });

    test('Should return correct amount when is closed', async () => {
      const userId = 1;
      const budgetId = 123;
      const budget = {
        budget_id: budgetId,
        month: 5,
        year: 2025,
        is_open: false,
      };

      const mockCategories = [
        {
          category_id: 1,
          planned_amount_credit: 100,
          planned_amount_debit: 50,
          exclude_from_budgets: false,
        },
        {
          category_id: 2,
          planned_amount_credit: 200,
          planned_amount_debit: 100,
          exclude_from_budgets: true,
        },
      ];

      const mockCalculatedAmounts = {
        category_balance_credit: 50_00,
        category_balance_debit: 25_00,
      };

      const mockInvestmentAmounts = {
        account_balance_credit: 30_00,
        account_balance_debit: 20_00,
      };

      vi.spyOn(BudgetService, 'getAllCategoriesForUser').mockResolvedValue(mockCategories);
      vi.spyOn(CategoryService, 'getAmountForCategoryInMonth').mockResolvedValue(
        mockCalculatedAmounts
      );
      vi.spyOn(AccountService, 'getAmountForInvestmentAccountsInMonth').mockResolvedValue(
        mockInvestmentAmounts
      );
      const balance = await BudgetService.calculateBudgetBalance(userId, budget, mockedPrisma);

      expect(balance).toBeCloseTo(15);
    });
  });

  describe('calculateBudgetBalanceChangePercentage', () => {
    test("Should return 'NaN' when there's no previous budget", async () => {
      const budget = {
        budget_id: 1n,
        month: 5,
        year: 2025,
        is_open: false,
      };

      const initialBalance = 0;
      const budgetBalance = 500;
      vi.spyOn(AccountService, 'getBalancesSnapshotForMonthForUser').mockResolvedValue(
        initialBalance
      );

      const result = await BudgetService.calculateBudgetBalanceChangePercentage(
        1n,
        budget,
        budgetBalance,
        mockedPrisma as any
      );
      expect(result).toBeTypeOf('string');
    });

    test("Should return correct value when there's a previous budget", async () => {
      const budget = {
        budget_id: 1n,
        month: 5,
        year: 2025,
        is_open: false,
      };
      const initialBalance = 300;
      const budgetBalance = 500;
      const finalBalance = initialBalance + budgetBalance;
      const expectedResult = ((finalBalance - initialBalance) / Math.abs(initialBalance)) * 100;
      vi.spyOn(AccountService, 'getBalancesSnapshotForMonthForUser').mockResolvedValue(
        initialBalance
      );

      const result = await BudgetService.calculateBudgetBalanceChangePercentage(
        1n,
        budget,
        budgetBalance,
        mockedPrisma as any
      );
      expect(result).toBeCloseTo(expectedResult);
    });
  });

  test('getExpandedBudgetAmountsData should return adequate amounts', async () => {
    const budget = {
      budget_id: 1n,
      month: 5,
      year: 2025,
      is_open: false,
      observations: '',
      initial_balance: 0n,
      users_user_id: -1n,
    };
    const mockBudgetBalanceChangePercentage = 3.75;

    const mockCalculatedAmounts = {
      category_balance_credit: 50_00,
      category_balance_debit: 25_00,
    };

    const mockInvestmentAmounts = {
      account_balance_credit: 30_00,
      account_balance_debit: 20_00,
    };

    const mockCategories = [
      {
        category_id: 1,
        planned_amount_credit: 100,
        planned_amount_debit: 50,
        exclude_from_budgets: false,
      },
      {
        category_id: 2,
        planned_amount_credit: 200,
        planned_amount_debit: 100,
        exclude_from_budgets: true,
      },
    ];

    vi.spyOn(BudgetService, 'getAllCategoriesForUser').mockResolvedValue(mockCategories);
    vi.spyOn(BudgetService, 'calculateBudgetBalanceChangePercentage').mockResolvedValue(
      mockBudgetBalanceChangePercentage
    );
    vi.spyOn(CategoryService, 'getAmountForCategoryInMonth').mockResolvedValue(
      mockCalculatedAmounts
    );
    vi.spyOn(AccountService, 'getAmountForInvestmentAccountsInMonth').mockResolvedValue(
      mockInvestmentAmounts
    );

    const result = await BudgetService.getExpandedBudgetAmountsData(
      1n,
      budget,
      mockedPrisma as any
    );
    expect(result).toStrictEqual({
      ...budget,
      balance_value: 15,
      balance_change_percentage: mockBudgetBalanceChangePercentage,
      credit_amount: 20,
      debit_amount: 5,
      savings_rate_percentage: 75,
    });
  });

  describe('paginated budget metrics', () => {
    const budget = {
      budget_id: 1n,
      month: 1,
      year: 2026,
      is_open: true,
      observations: '',
      initial_balance: 0n,
      users_user_id: 1n,
    };

    test.each([true, false])(
      'returns aggregated amounts for an %s budget with one database request',
      async (isOpen) => {
        mockedPrisma.$queryRaw.mockResolvedValueOnce([
          { balance_credit: 125_00n, balance_debit: 25_00n },
        ]);

        const result = await BudgetService.getAggregatedAmountsForBudget(
          1n,
          { ...budget, is_open: isOpen },
          mockedPrisma
        );

        expect(result).toEqual({ balance_credit: 125, balance_debit: 25 });
        expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      }
    );

    test('selects the latest account snapshot before a January budget', () => {
      const initialBalances = BudgetService.getInitialBalancesByBudget(
        [budget],
        [
          {
            accounts_account_id: 1n,
            month: 11,
            year: 2025,
            balance: 100_00n,
          },
          {
            accounts_account_id: 1n,
            month: 12,
            year: 2025,
            balance: 200_00n,
          },
          {
            accounts_account_id: 1n,
            month: 1,
            year: 2026,
            balance: 999_00n,
          },
          {
            accounts_account_id: 2n,
            month: 12,
            year: 2025,
            balance: 300_00n,
          },
        ]
      );

      expect(initialBalances.get(budget.budget_id)).toBe(500);
    });

    test('returns zero when no account snapshot exists before the budget', () => {
      const initialBalances = BudgetService.getInitialBalancesByBudget([budget], []);

      expect(initialBalances.get(budget.budget_id)).toBe(0);
    });
  });

  test('uses one snapshot request and one amount request per paginated budget', async () => {
    const budgets = [
      {
        budget_id: 1n,
        month: 2,
        year: 2026,
        is_open: true,
        observations: 'one',
        initial_balance: 0n,
        users_user_id: 1n,
      },
      {
        budget_id: 2n,
        month: 1,
        year: 2026,
        is_open: false,
        observations: 'two',
        initial_balance: 0n,
        users_user_id: 1n,
      },
    ];
    const getBudgetsSpy = vi.spyOn(BudgetService, 'getBudgetsForUserByPage').mockResolvedValue({
      total_count: 2,
      filtered_count: 2,
      results: budgets,
    });
    const snapshotsSpy = vi
      .spyOn(BudgetService, 'getBalanceSnapshotsForUser')
      .mockResolvedValue([]);
    const amountsSpy = vi
      .spyOn(BudgetService, 'getAggregatedAmountsForBudget')
      .mockResolvedValueOnce({ balance_credit: 100, balance_debit: 25 })
      .mockResolvedValueOnce({ balance_credit: 0, balance_debit: 10 });

    const result = await BudgetService.getFilteredBudgetsForUserByPage(
      1n,
      0,
      2,
      '',
      '',
      mockedPrisma
    );

    expect(snapshotsSpy).toHaveBeenCalledTimes(1);
    expect(amountsSpy).toHaveBeenCalledTimes(2);
    expect(result.results).toEqual([
      expect.objectContaining({
        balance_value: 75,
        balance_change_percentage: 'NaN',
        savings_rate_percentage: 75,
      }),
      expect.objectContaining({
        balance_value: -10,
        balance_change_percentage: 'NaN',
        savings_rate_percentage: 0,
      }),
    ]);

    getBudgetsSpy.mockRestore();
    snapshotsSpy.mockRestore();
    amountsSpy.mockRestore();
  });
});
