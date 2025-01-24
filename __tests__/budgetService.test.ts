import { beforeEach, describe, expect, it, test, vi } from "vitest";
import { mockedPrisma } from "./prisma.mock";
import BudgetService from "../src/services/budgetService.js";
import CategoryService from "../src/services/categoryService.js";
import AccountService from "../src/services/accountService.js"; // Adjust path as needed

describe("budgetService", () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  test("calculateBudgetBalance should return correct amount when is open", async () => {
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

  test("calculateBudgetBalance should return correct amount when is closed", async () => {
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
    vi.spyOn(CategoryService, "getAmountForCategoryInMonth").mockResolvedValue(mockCalculatedAmounts)
    vi.spyOn(AccountService, "getAmountForInvestmentAccountsInMonth").mockResolvedValue(mockInvestmentAmounts)
    const balance = await BudgetService.calculateBudgetBalance(userId, budget, mockedPrisma);

    expect(balance).toBeCloseTo(15);
  });
});