import { expect, test } from 'vitest';
import { prisma } from '../../src/config/prisma.js';
import { MYFIN } from '../../src/consts.js';
import CategoryService from '../../src/services/categoryService.js';
import UserService from '../../src/services/userService.js';

test('counts a transaction dated later on December 31 in that year', async () => {
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
  await prisma.transactions.create({
    data: {
      date_timestamp: BigInt(new Date(2026, 11, 31, 9).getTime() / 1000),
      amount: 142_60n,
      type: MYFIN.TRX_TYPES.EXPENSE,
      description: 'Last day of the year',
      accounts_account_from_id: account.account_id,
      categories_category_id: category.category_id,
    },
  });

  const amounts = await CategoryService.getAmountForCategoryInYear(category.category_id, 2026);

  expect(Number(amounts.category_balance_debit)).toBe(142_60);
});
