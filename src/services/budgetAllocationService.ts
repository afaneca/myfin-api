import { performDatabaseRequest } from '../config/prisma.js';
import { MYFIN } from '../consts.js';
import APIError from '../errorHandling/apiError.js';
import type { Prisma } from '../generated/prisma/client.js';

export type BreakdownItem = { label: string; amount: number | string; sort_order?: number };
export type BreakdownInput = { expense_items?: BreakdownItem[]; income_items?: BreakdownItem[] };
const invalid = () =>
  APIError.badRequest(
    'Invalid budget breakdown: use nonblank labels and nonnegative currency amounts with at most two decimal places.',
    'BUDGET_BREAKDOWN_INVALID'
  );

export function validateCents(cents: bigint): bigint {
  if (cents < 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
  const decimal = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(Number(cents) / 100));
  if (!decimal || BigInt(decimal[1]) * 100n + BigInt((decimal[2] ?? '').padEnd(2, '0')) !== cents)
    throw invalid();
  return cents;
}

// Parse decimal currency into cents without floating point multiplication or rounding.
export function moneyInCents(value: unknown): bigint {
  if (typeof value !== 'number' && typeof value !== 'string') throw invalid();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw invalid();
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return validateCents(cents);
}

export function normalizeItems(items: unknown) {
  if (!Array.isArray(items)) throw invalid();
  return items.map((item, index) => {
    if (
      !item ||
      typeof item.label !== 'string' ||
      !item.label.trim() ||
      item.label.trim().length > 255 ||
      (item.sort_order !== undefined &&
        (!Number.isInteger(item.sort_order) ||
          item.sort_order < 0 ||
          item.sort_order > 2147483647)) ||
      Object.keys(item).some((key) => !['label', 'amount', 'sort_order', 'item_id'].includes(key))
    )
      throw invalid();
    return {
      label: item.label.trim(),
      amount: moneyInCents(item.amount),
      sort_order: item.sort_order ?? index,
    };
  });
}

export function directionTotal(
  current: bigint,
  manual: unknown,
  items: { amount: bigint }[] | undefined,
  existing: { amount: bigint }[]
) {
  const direct = manual === undefined ? undefined : moneyInCents(manual);
  const active = items ?? existing;
  if (!active.length) return direct ?? current;
  const sum = active.reduce((total, item) => total + item.amount, 0n);
  validateCents(sum);
  if (direct !== undefined && direct !== sum && direct !== current) {
    throw APIError.badRequest(
      'The planned amount conflicts with its breakdown. Edit the items or explicitly switch to a single amount.',
      'BUDGET_BREAKDOWN_CONFLICT'
    );
  }
  return sum;
}

export function serializeItems(
  items: { direction: string; label: string; amount: bigint; sort_order: number }[]
) {
  const direction = (name: string) =>
    items
      .filter((item) => item.direction === name)
      .map(({ label, amount, sort_order }) => ({
        label,
        amount: Number(amount) / 100,
        sort_order,
      }));
  return { expense_items: direction('EXPENSE'), income_items: direction('INCOME') };
}

export default class BudgetAllocationService {
  static async lock(userId: bigint, budgetId: bigint, db: Prisma.TransactionClient) {
    const rows = await db.$queryRaw<{ is_open: boolean }[]>`
      SELECT is_open FROM budgets WHERE budget_id = ${budgetId} AND users_user_id = ${userId} FOR UPDATE`;
    if (!rows.length) throw APIError.notFound();
    if (!rows[0].is_open) throw APIError.forbidden('Closed budgets are read-only.');
  }

  static async save(
    userId: bigint,
    budgetId: bigint,
    categoryId: bigint,
    expense: unknown,
    income: unknown,
    breakdown: BreakdownInput,
    dbClient = undefined
  ) {
    return performDatabaseRequest(async (db) => {
      await BudgetAllocationService.lock(userId, budgetId, db);
      const category = await db.categories.findFirst({
        where: { category_id: categoryId, users_user_id: userId },
      });
      if (!category) throw APIError.notFound();
      if (category.status !== MYFIN.CATEGORY_STATUS.ACTIVE) throw APIError.forbidden();
      const key = {
        budgets_budget_id: budgetId,
        budgets_users_user_id: userId,
        categories_category_id: categoryId,
      };
      const where = { budgets_budget_id_budgets_users_user_id_categories_category_id: key };
      const current = await db.budgets_has_categories.findUnique({
        where,
        include: { breakdown_items: true },
      });
      const expenseItems =
        breakdown.expense_items === undefined ? undefined : normalizeItems(breakdown.expense_items);
      const incomeItems =
        breakdown.income_items === undefined ? undefined : normalizeItems(breakdown.income_items);
      const totals = {
        planned_amount_debit: directionTotal(
          current?.planned_amount_debit ?? 0n,
          expense,
          expenseItems,
          current?.breakdown_items.filter((item) => item.direction === 'EXPENSE') ?? []
        ),
        planned_amount_credit: directionTotal(
          current?.planned_amount_credit ?? 0n,
          income,
          incomeItems,
          current?.breakdown_items.filter((item) => item.direction === 'INCOME') ?? []
        ),
      };
      await db.budgets_has_categories.upsert({
        where,
        create: { ...key, ...totals },
        update: totals,
      });
      for (const [direction, items] of [
        ['EXPENSE', expenseItems],
        ['INCOME', incomeItems],
      ] as const) {
        if (items === undefined) continue;
        await db.budget_category_items.deleteMany({ where: { ...key, direction } });
        if (items.length)
          await db.budget_category_items.createMany({
            data: items.map((item) => ({ ...key, direction, ...item })),
          });
      }
    }, dbClient);
  }
}
