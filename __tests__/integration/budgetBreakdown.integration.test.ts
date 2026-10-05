import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prisma } from '../../src/config/prisma.js';
import BudgetMatrixService from '../../src/services/budgetMatrixService.js';
import BudgetService from '../../src/services/budgetService.js';
import CategoryService from '../../src/services/categoryService.js';
import UserService from '../../src/services/userService.js';
import BackupManager from '../../src/utils/backupManager.js';

// Every test uses the disposable Docker database and the standard database reset.
describe('budget breakdowns', () => {
  let userId: bigint;
  let categoryId: bigint;
  let budgetId: bigint;
  const items = [
    { label: 'Electricity', amount: 75.15, sort_order: 1 },
    { label: 'Buffer', amount: 0.2, sort_order: 0 },
  ];
  const allocation = () =>
    prisma.budgets_has_categories.findFirstOrThrow({
      where: { budgets_budget_id: budgetId, categories_category_id: categoryId },
      include: { breakdown_items: { orderBy: [{ sort_order: 'asc' }, { item_id: 'asc' }] } },
    });
  const save = (expenseItems?: typeof items, expense?: number, income?: number) =>
    BudgetService.updateBudgetCategoryPlannedValues(
      userId,
      budgetId,
      categoryId,
      expense,
      income,
      undefined,
      { expense_items: expenseItems }
    );

  beforeEach(async () => {
    const user = await UserService.createUser({
      username: 'breakdown-user',
      password: '123',
      email: 'breakdown@myfin.test',
    });
    userId = user.user_id;
    const category = await prisma.categories.create({
      data: { name: 'Utilities', type: 'E', users_user_id: userId },
    });
    categoryId = category.category_id;
    budgetId = await BudgetService.createBudget(
      userId,
      1,
      2026,
      [{ category_id: categoryId, planned_value_debit: '5.25', planned_value_credit: '10' }],
      ''
    );
  });

  test('adds exact totals, ordered items, independent income, and exposes detail/matrix reads', async () => {
    await save(items, undefined, 12.34);
    const row = await allocation();
    expect(row.planned_amount_debit).toBe(7535n);
    expect(row.planned_amount_credit).toBe(1234n);
    expect(row.breakdown_items.map((item) => item.label)).toEqual(['Buffer', 'Electricity']);
    const detail = await BudgetService.getBudget(userId, budgetId);
    expect(detail.categories.find((c) => c.category_id === categoryId).expense_items).toEqual([
      items[1],
      items[0],
    ]);
    const matrix = await BudgetMatrixService.getBudgetMatrix(userId, [budgetId]);
    expect(matrix.budgets[0].categories.find((c) => c.category_id === categoryId)).toMatchObject({
      expense_items: [items[1], items[0]],
      income_items: [],
    });
    await BudgetService.updateBudgetCategoryPlannedValues(
      userId,
      budgetId,
      categoryId,
      undefined,
      undefined,
      undefined,
      { income_items: [{ label: 'Refund', amount: 2 }] }
    );
    await save([{ label: 'Renamed', amount: 3.45, sort_order: 0 }]);
    const updated = await allocation();
    expect(updated.planned_amount_credit).toBe(200n);
    expect(updated.planned_amount_debit).toBe(345n);
    expect(updated.breakdown_items).toHaveLength(2);
  });

  test('omission and old clients preserve items; conflicting direct writes fail atomically', async () => {
    await save(items);
    const initial = await allocation();
    await save(undefined, 75.35, 20);
    expect((await allocation()).breakdown_items).toEqual(initial.breakdown_items);
    await expect(save(undefined, 80)).rejects.toMatchObject({ code: 400 });
    await expect(
      BudgetService.updateBudget(
        userId,
        budgetId,
        2,
        2026,
        [{ category_id: categoryId, planned_value_debit: '80', planned_value_credit: '20' }],
        'changed'
      )
    ).rejects.toMatchObject({ code: 400 });
    expect((await prisma.budgets.findFirstOrThrow({ where: { budget_id: budgetId } })).month).toBe(
      1
    );
    expect((await allocation()).planned_amount_debit).toBe(7535n);
    await save([]);
    expect((await allocation()).planned_amount_debit).toBe(7535n);
    expect((await allocation()).breakdown_items).toHaveLength(0);
    await save(items);
    await save([], 30);
    expect((await allocation()).planned_amount_debit).toBe(3000n);
    await save(undefined, 42.01);
    expect((await allocation()).planned_amount_debit).toBe(4201n);
  });

  test('full saves create/copy independent records and allow unchanged old totals', async () => {
    await save(items);
    await BudgetService.updateBudget(
      userId,
      budgetId,
      1,
      2026,
      [
        {
          category_id: categoryId,
          expense_items: [{ label: 'New', amount: 1.23 }],
          planned_value_debit: '75.35',
        },
      ],
      ''
    );
    const detail = await BudgetService.getBudget(userId, budgetId);
    const source = detail.categories.find((c) => c.category_id === categoryId);
    const copied = await BudgetService.createBudget(
      userId,
      2,
      2026,
      [
        {
          category_id: categoryId,
          expense_items: source.expense_items,
          income_items: source.income_items,
          planned_value_debit: source.planned_amount_debit,
          planned_value_credit: source.planned_amount_credit,
        },
      ],
      ''
    );
    const copiedItems = await prisma.budget_category_items.findMany({
      where: { budgets_budget_id: copied },
    });
    expect(copiedItems[0].item_id).not.toBe((await allocation()).breakdown_items[0].item_id);
    await BudgetService.updateBudgetCategoryPlannedValues(
      userId,
      copied,
      categoryId,
      undefined,
      undefined,
      undefined,
      { expense_items: [{ label: 'Destination', amount: 2 }] }
    );
    expect((await allocation()).breakdown_items[0].label).toBe('New');
  });

  test('enforces ownership, validation and closed budgets', async () => {
    const other = await UserService.createUser({
      username: 'other',
      password: '123',
      email: 'other@myfin.test',
    });
    await expect(
      BudgetService.updateBudgetCategoryPlannedValues(other.user_id, budgetId, categoryId, 2)
    ).rejects.toMatchObject({ code: 404 });
    const foreign = await prisma.categories.create({
      data: { name: 'Foreign', type: 'E', users_user_id: other.user_id },
    });
    await expect(
      BudgetService.updateBudgetCategoryPlannedValues(userId, budgetId, foreign.category_id, 2)
    ).rejects.toMatchObject({ code: 404 });
    await expect(save([{ label: ' ', amount: 0, sort_order: 0 }])).rejects.toMatchObject({
      code: 400,
    });
    await expect(save([{ label: 'Negative', amount: -1, sort_order: 0 }])).rejects.toMatchObject({
      code: 400,
    });
    await expect(
      save([{ label: 'Precision', amount: 1.001, sort_order: 0 }])
    ).rejects.toMatchObject({ code: 400 });
    await BudgetService.changeBudgetStatus(userId, budgetId, false);
    await expect(save(items)).rejects.toMatchObject({ code: 403 });
    await expect(
      BudgetService.updateBudget(userId, budgetId, 1, 2026, [], '')
    ).rejects.toMatchObject({ code: 403 });
  });

  test('rolls back totals and item removal when item insertion fails', async () => {
    await save(items);
    const initial = await allocation();
    await expect(
      prisma.$transaction(async (tx) => {
        const spy = vi
          .spyOn(tx.budget_category_items, 'createMany')
          .mockRejectedValueOnce(new Error('Item insertion failed'));
        try {
          await BudgetService.updateBudgetCategoryPlannedValues(
            userId,
            budgetId,
            categoryId,
            undefined,
            undefined,
            tx as typeof prisma,
            { expense_items: [{ label: 'Changed', amount: 1 }] }
          );
        } finally {
          spy.mockRestore();
        }
      })
    ).rejects.toThrow('Item insertion failed');
    expect(await allocation()).toEqual(initial);
  });

  test('serializes concurrent replacements and independent direction edits', async () => {
    await prisma.budgets_has_categories.deleteMany({ where: { budgets_budget_id: budgetId } });
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        save([{ label: String(index), amount: index + 0.01, sort_order: 0 }])
      )
    );
    const row = await allocation();
    expect(row.breakdown_items).toHaveLength(1);
    expect(row.planned_amount_debit).toBe(row.breakdown_items[0].amount);
    await Promise.all([
      save([{ label: 'Expense', amount: 2, sort_order: 0 }]),
      BudgetService.updateBudgetCategoryPlannedValues(
        userId,
        budgetId,
        categoryId,
        undefined,
        undefined,
        undefined,
        { income_items: [{ label: 'Income', amount: 3 }] }
      ),
    ]);
    expect(await allocation()).toMatchObject({
      planned_amount_debit: 200n,
      planned_amount_credit: 300n,
    });
  });

  test('backup/restore maps parent ids, rejects inconsistent backups and accepts old backups', async () => {
    await save(items);
    const backup = await BackupManager.createBackup(userId);
    const invalid = {
      ...backup,
      budget_category_items: backup.budget_category_items.map((item) => ({
        ...item,
        amount: item.amount + 1n,
      })),
    };
    await expect(UserService.restoreUser(userId, invalid)).rejects.toMatchObject({ code: 400 });
    expect((await allocation()).planned_amount_debit).toBe(7535n);
    await UserService.restoreUser(userId, JSON.parse(JSON.stringify(backup)));
    const restored = await prisma.budget_category_items.findMany({
      where: { budgets_users_user_id: userId },
      include: { allocation: true },
    });
    expect(restored).toHaveLength(2);
    expect(restored[0].budgets_budget_id).not.toBe(budgetId);
    expect(restored[0].categories_category_id).not.toBe(categoryId);
    expect(restored[0].allocation.planned_amount_debit).toBe(7535n);
    const older = { ...backup, budget_category_items: undefined };
    await UserService.restoreUser(userId, older);
    expect(await prisma.budget_category_items.count()).toBe(0);
  });

  test('HTTP writes reject invalid directions and conflicting old-client totals', async () => {
    await save(items);
    const app = (await import('../../src/app.js')).default;
    const server = app.listen(0);
    try {
      const session = await UserService.attemptLogin('breakdown-user', '123', false);
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test server port');
      const headers = {
        authusername: session.username,
        sessionkey: session.sessionkey,
        'Content-Type': 'application/json',
      };
      for (const body of [
        {
          category_id: String(categoryId),
          expense_items: [{ label: 'Invalid', amount: 1, direction: 'OTHER' }],
        },
        { category_id: String(categoryId), expense_items: [{ label: 'Precision', amount: 1.001 }] },
        {
          category_id: String(categoryId),
          expense_items: [{ label: 'String precision', amount: '1.000' }],
        },
        { category_id: String(categoryId), planned_expense: 80 },
      ]) {
        const response = await fetch(`http://localhost:${address.port}/budgets/${budgetId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(400);
      }
      expect((await allocation()).planned_amount_debit).toBe(7535n);
      expect((await allocation()).breakdown_items).toHaveLength(2);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  test('budget, category and user data deletion cascade to child items', async () => {
    await save(items);
    await BudgetService.removeBudget(userId, budgetId);
    expect(await prisma.budget_category_items.count()).toBe(0);
    budgetId = await BudgetService.createBudget(
      userId,
      1,
      2026,
      [{ category_id: categoryId, expense_items: items }],
      ''
    );
    await CategoryService.deleteCategory(userId, Number(categoryId));
    expect(await prisma.budget_category_items.count()).toBe(0);
    const category = await prisma.categories.create({
      data: { name: 'New', type: 'E', users_user_id: userId },
    });
    categoryId = category.category_id;
    await save(items);
    await UserService.deleteAllUserData(userId);
    expect(await prisma.budget_category_items.count()).toBe(0);
  });
});
