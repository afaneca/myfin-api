import { expect, test } from 'vitest';
import { prisma } from '../../src/config/prisma.js';
import { MYFIN } from '../../src/consts.js';
import StatsService from '../../src/services/statsService.js';
import TagService from '../../src/services/tagService.js';
import UserService from '../../src/services/userService.js';

test('includes the final day of the year and scopes totals to the user', async () => {
  const user = await UserService.createUser({
    username: 'yearly-stats-user',
    password: '123',
    email: 'yearly-stats-user@myfinbudget.com',
  });
  const account = await prisma.accounts.create({
    data: {
      name: 'Checking',
      type: MYFIN.ACCOUNT_TYPES.CHECKING,
      description: '',
      exclude_from_budgets: false,
      status: MYFIN.ACCOUNT_STATUS.ACTIVE,
      users_user_id: user.user_id,
      current_balance: 0n,
    },
  });
  const category = await prisma.categories.create({
    data: {
      name: 'Utilities',
      type: MYFIN.TRX_TYPES.EXPENSE,
      users_user_id: user.user_id,
      status: MYFIN.CATEGORY_STATUS.ACTIVE,
      exclude_from_budgets: 0,
    },
  });
  const entity = await prisma.entities.create({
    data: { name: 'Utility provider', users_user_id: user.user_id },
  });
  const otherUser = await UserService.createUser({
    username: 'other-yearly-stats-user',
    password: '123',
    email: 'other-yearly-stats-user@myfinbudget.com',
  });
  const otherAccount = await prisma.accounts.create({
    data: {
      name: 'Other checking',
      type: MYFIN.ACCOUNT_TYPES.CHECKING,
      exclude_from_budgets: false,
      status: MYFIN.ACCOUNT_STATUS.ACTIVE,
      users_user_id: otherUser.user_id,
      current_balance: 0n,
    },
  });
  const lastSecond = BigInt(new Date(2026, 11, 31, 23, 59, 59).getTime() / 1000);
  const nextYear = BigInt(new Date(2027, 0, 1).getTime() / 1000);
  const expense = {
    type: MYFIN.TRX_TYPES.EXPENSE,
    accounts_account_from_id: account.account_id,
    categories_category_id: category.category_id,
    entities_entity_id: entity.entity_id,
  };
  const decemberExpense = await prisma.transactions.create({
    data: { ...expense, date_timestamp: lastSecond, amount: 142_60n },
  });
  const januaryExpense = await prisma.transactions.create({
    data: { ...expense, date_timestamp: nextYear, amount: 17_00n },
  });
  for (const transaction of [decemberExpense, januaryExpense]) {
    await TagService.addTagToTransactionByName(
      user.user_id,
      transaction.transaction_id,
      'Bills',
      true
    );
  }

  // A foreign expense must not count even if its unused destination account belongs to the user.
  await prisma.transactions.create({
    data: {
      ...expense,
      date_timestamp: lastSecond,
      amount: 900_00n,
      accounts_account_from_id: otherAccount.account_id,
      accounts_account_to_id: account.account_id,
    },
  });

  const december = await StatsService.getYearByYearIncomeExpenseDistribution(user.user_id, 2026);
  expect(december.categories).toEqual([
    expect.objectContaining({ category_yearly_expense: 142.6 }),
  ]);
  expect(december.entities).toEqual([expect.objectContaining({ entity_yearly_expense: 142.6 })]);
  expect(december.tags).toEqual([expect.objectContaining({ tag_yearly_expense: 142.6 })]);

  const january = await StatsService.getYearByYearIncomeExpenseDistribution(user.user_id, 2027);
  expect(january.categories).toEqual([expect.objectContaining({ category_yearly_expense: 17 })]);
  expect(january.entities).toEqual([expect.objectContaining({ entity_yearly_expense: 17 })]);
  expect(january.tags).toEqual([expect.objectContaining({ tag_yearly_expense: 17 })]);
});
