import { beforeEach, describe, expect, test, vi } from "vitest";
import { mockedPrisma } from "./prisma.mock.js";
import BudgetService from "../../src/services/budgetService.js";
import CategoryService from "../../src/services/categoryService.js";
import AccountService from "../../src/services/accountService.js"; // Adjust path as needed

describe("budgetService", () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe("calculateBudgetBalance", () => {
    test("Should return correct amount when is open", async () => {
      const userId = 1;
      const budgetId = 123;
      const budget = {
        budget_id: budgetId,
        month: 5,
        year: 2025,
        is_open: true
      };

      const mockCategories = [
        {
          category_id: 1,
          planned_amount_credit: 100,
          planned_amount_debit: 50,
          exclude_from_budgets: false
        },
        {
          category_id: 2,
          planned_amount_credit: 200,
          planned_amount_debit: 100,
          exclude_from_budgets: true
        }
      ];

      vi.spyOn(BudgetService, "getAllCategoriesForUser").mockResolvedValue(mockCategories);

      const balance = await BudgetService.calculateBudgetBalance(userId, budget, mockedPrisma);

      expect(balance).toBeCloseTo(50);
    });

    test("Should return correct amount when is closed", async () => {
      const userId = 1;
      const budgetId = 123;
      const budget = {
        budget_id: budgetId,
        month: 5,
        year: 2025,
        is_open: false
      };

      const mockCategories = [
        {
          category_id: 1,
          planned_amount_credit: 100,
          planned_amount_debit: 50,
          exclude_from_budgets: false
        },
        {
          category_id: 2,
          planned_amount_credit: 200,
          planned_amount_debit: 100,
          exclude_from_budgets: true
        }
      ];

      const mockCalculatedAmounts = {
        category_balance_credit: 50_00,
        category_balance_debit: 25_00
      };

      const mockInvestmentAmounts = {
        account_balance_credit: 30_00,
        account_balance_debit: 20_00
      };

      vi.spyOn(BudgetService, "getAllCategoriesForUser").mockResolvedValue(mockCategories);
      vi.spyOn(CategoryService, "getAmountForCategoryInMonth").mockResolvedValue(mockCalculatedAmounts);
      vi.spyOn(AccountService, "getAmountForInvestmentAccountsInMonth").mockResolvedValue(mockInvestmentAmounts);
      const balance = await BudgetService.calculateBudgetBalance(userId, budget, mockedPrisma);

      expect(balance).toBeCloseTo(15);
    });
  });

  describe("calculateBudgetBalanceChangePercentage", () => {
    test("Should return 'NaN' when there's no previous budget", async () => {
      const budget = {
        budget_id: 1n,
        month: 5,
        year: 2025,
        is_open: false
      };

      const initialBalance = 0;
      const budgetBalance = 500;
      vi.spyOn(AccountService, "getBalancesSnapshotForMonthForUser").mockResolvedValue(initialBalance);

      const result = await BudgetService.calculateBudgetBalanceChangePercentage(1n, budget, budgetBalance, mockedPrisma as any);
      expect(result).toBeTypeOf("string");
    });

    test("Should return correct value when there's a previous budget", async () => {
      const budget = {
        budget_id: 1n,
        month: 5,
        year: 2025,
        is_open: false
      };
      const initialBalance = 300;
      const budgetBalance = 500;
      const finalBalance = initialBalance + budgetBalance;
      const expectedResult = ((finalBalance - initialBalance) / Math.abs(initialBalance)) * 100;
      vi.spyOn(AccountService, "getBalancesSnapshotForMonthForUser").mockResolvedValue(initialBalance);

      const result = await BudgetService.calculateBudgetBalanceChangePercentage(1n, budget, budgetBalance, mockedPrisma as any);
      expect(result).toBeCloseTo(expectedResult);
    });
  });

  test("getExpandedBudgetAmountsData should return adequate amounts", async () => {
    const budget = {
      budget_id: 1n,
      month: 5,
      year: 2025,
      is_open: false,
      observations: "",
      initial_balance: 0n,
      users_user_id: -1n
    };
    const mockBudgetBalanceChangePercentage = 3.75;

    const mockCalculatedAmounts = {
      category_balance_credit: 50_00,
      category_balance_debit: 25_00
    };

    const mockInvestmentAmounts = {
      account_balance_credit: 30_00,
      account_balance_debit: 20_00
    };

    const mockCategories = [
      {
        category_id: 1,
        planned_amount_credit: 100,
        planned_amount_debit: 50,
        exclude_from_budgets: false
      },
      {
        category_id: 2,
        planned_amount_credit: 200,
        planned_amount_debit: 100,
        exclude_from_budgets: true
      }
    ];

    vi.spyOn(BudgetService, "getAllCategoriesForUser").mockResolvedValue(mockCategories);
    vi.spyOn(BudgetService, "calculateBudgetBalanceChangePercentage").mockResolvedValue(mockBudgetBalanceChangePercentage);
    vi.spyOn(CategoryService, "getAmountForCategoryInMonth").mockResolvedValue(mockCalculatedAmounts);
    vi.spyOn(AccountService, "getAmountForInvestmentAccountsInMonth").mockResolvedValue(mockInvestmentAmounts);

    const result = await BudgetService.getExpandedBudgetAmountsData(1n, budget, mockedPrisma as any);
    expect(result).toStrictEqual({
      ...budget,
      balance_value: 15,
      balance_change_percentage: mockBudgetBalanceChangePercentage,
      credit_amount: 20,
      debit_amount: 5,
      savings_rate_percentage: 75

    });
  });

});