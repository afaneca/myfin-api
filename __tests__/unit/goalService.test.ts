import { describe, expect, test } from 'vitest';
import GoalService from '../../src/services/goalService.js';
import { mockedPrisma } from './prisma.mock.js';

const account = (accountId: bigint, currentBalance: bigint) => ({
  account_id: accountId,
  current_balance: currentBalance,
});

const fundingAccount = (
  accountId: bigint,
  matchType: 'absolute' | 'relative',
  matchValue: number
) => ({
  accounts_account_id: accountId,
  match_type: matchType,
  match_value: matchValue,
  accounts: account(accountId, 0n),
});

const goal = (
  goalId: bigint,
  priority: number,
  amount: bigint,
  goalHasAccount: ReturnType<typeof fundingAccount>[]
) => ({
  goal_id: goalId,
  name: `Goal ${goalId}`,
  description: null,
  priority,
  amount,
  due_date: null,
  is_archived: false,
  goal_has_account: goalHasAccount,
});

describe('goalService', () => {
  describe('createGoal', () => {
    test('rejects funding accounts that do not belong to the user', async () => {
      mockedPrisma.accounts.count.mockResolvedValue(1);

      await expect(
        GoalService.createGoal(
          {
            name: 'Goal',
            priority: 1,
            amount: 1000,
            funding_accounts: [
              { account_id: 1, funding_type: 'absolute', funding_amount: 500 },
              { account_id: 2, funding_type: 'absolute', funding_amount: 500 },
            ],
          },
          1n,
          mockedPrisma
        )
      ).rejects.toMatchObject({ code: 401 });
      expect(mockedPrisma.goals.create).not.toHaveBeenCalled();
    });
  });

  describe('getGoalsForUser', () => {
    test('funds lower priority goals after a higher priority goal reaches its target', async () => {
      mockedPrisma.goals.findMany.mockResolvedValue([
        goal(1n, 2, 100_000n, [fundingAccount(1n, 'relative', 100)]),
        goal(2n, 1, 50_000n, [fundingAccount(1n, 'relative', 100)]),
      ] as never);
      mockedPrisma.accounts.findMany.mockResolvedValue([account(1n, 200_000n)] as never);

      const result = await GoalService.getGoalsForUser(1n, false, mockedPrisma);

      expect(result).toMatchObject({
        goals: [
          {
            goal_id: 1,
            amount: 1000,
            currently_funded_amount: 1000,
            funding_accounts: [{ account_id: 1, current_funding: 1000 }],
            is_underfunded: false,
          },
          {
            goal_id: 2,
            amount: 500,
            currently_funded_amount: 500,
            funding_accounts: [{ account_id: 1, current_funding: 500 }],
            is_underfunded: false,
          },
        ],
        unallocated_funding: {
          total_amount: 500,
          accounts: [{ account_id: 1, amount: 500 }],
        },
      });
    });

    test('keeps allocations account-scoped across mixed funding accounts and funding types', async () => {
      mockedPrisma.goals.findMany.mockResolvedValue([
        goal(1n, 3, 100_000n, [
          fundingAccount(1n, 'relative', 100),
          fundingAccount(2n, 'absolute', 700),
        ]),
        goal(2n, 2, 80_000n, [
          fundingAccount(1n, 'absolute', 700),
          fundingAccount(2n, 'relative', 100),
        ]),
        goal(3n, 1, 60_000n, [fundingAccount(2n, 'absolute', 600)]),
      ] as never);
      mockedPrisma.accounts.findMany.mockResolvedValue([
        account(1n, 200_000n),
        account(2n, 100_000n),
      ] as never);

      const result = await GoalService.getGoalsForUser(1n, false, mockedPrisma);

      expect(result).toMatchObject({
        goals: [
          {
            goal_id: 1,
            currently_funded_amount: 1000,
            funding_accounts: [
              { account_id: 1, current_funding: 1000 },
              { account_id: 2, current_funding: 0 },
            ],
            is_underfunded: false,
          },
          {
            goal_id: 2,
            currently_funded_amount: 800,
            funding_accounts: [
              { account_id: 1, current_funding: 700 },
              { account_id: 2, current_funding: 100 },
            ],
            is_underfunded: false,
          },
          {
            goal_id: 3,
            currently_funded_amount: 600,
            funding_accounts: [{ account_id: 2, current_funding: 600 }],
            is_underfunded: false,
          },
        ],
        unallocated_funding: {
          total_amount: 600,
          accounts: [
            { account_id: 1, amount: 300 },
            { account_id: 2, amount: 300 },
          ],
        },
      });
    });

    test('reports surplus for one referenced account while omitting fully consumed accounts', async () => {
      mockedPrisma.goals.findMany.mockResolvedValue([
        goal(1n, 2, 100_000n, [fundingAccount(1n, 'absolute', 1000)]),
        goal(2n, 1, 50_000n, [fundingAccount(2n, 'absolute', 500)]),
      ] as never);
      mockedPrisma.accounts.findMany.mockResolvedValue([
        account(1n, 150_000n),
        account(2n, 50_000n),
      ] as never);

      const result = await GoalService.getGoalsForUser(1n, false, mockedPrisma);

      expect(result).toMatchObject({
        goals: [
          {
            goal_id: 1,
            currently_funded_amount: 1000,
            funding_accounts: [{ account_id: 1, current_funding: 1000 }],
            is_underfunded: false,
          },
          {
            goal_id: 2,
            currently_funded_amount: 500,
            funding_accounts: [{ account_id: 2, current_funding: 500 }],
            is_underfunded: false,
          },
        ],
        unallocated_funding: {
          total_amount: 500,
          accounts: [{ account_id: 1, amount: 500 }],
        },
      });
    });

    test('preserves accounts needed by lower priority goals when funding a shared higher priority goal', async () => {
      mockedPrisma.goals.findMany.mockResolvedValue([
        goal(1n, 2, 100_000n, [
          fundingAccount(1n, 'absolute', 1000),
          fundingAccount(2n, 'absolute', 1000),
        ]),
        goal(2n, 1, 100_000n, [fundingAccount(1n, 'absolute', 1000)]),
      ] as never);
      mockedPrisma.accounts.findMany.mockResolvedValue([
        account(1n, 100_000n),
        account(2n, 100_000n),
      ] as never);

      const result = await GoalService.getGoalsForUser(1n, false, mockedPrisma);

      expect(result).toMatchObject({
        goals: [
          {
            goal_id: 1,
            currently_funded_amount: 1000,
            funding_accounts: [
              { account_id: 1, current_funding: 0 },
              { account_id: 2, current_funding: 1000 },
            ],
            is_underfunded: false,
          },
          {
            goal_id: 2,
            currently_funded_amount: 1000,
            funding_accounts: [{ account_id: 1, current_funding: 1000 }],
            is_underfunded: false,
          },
        ],
        unallocated_funding: {
          total_amount: 0,
          accounts: [],
        },
      });
    });

    test('reports surplus even when funding rules leave an eligible goal below target', async () => {
      mockedPrisma.goals.findMany.mockResolvedValue([
        goal(1n, 2, 100_000n, [fundingAccount(1n, 'relative', 100)]),
        goal(2n, 1, 50_000n, [fundingAccount(1n, 'absolute', 100)]),
      ] as never);
      mockedPrisma.accounts.findMany.mockResolvedValue([account(1n, 200_000n)] as never);

      const result = await GoalService.getGoalsForUser(1n, false, mockedPrisma);

      expect(result).toMatchObject({
        goals: [
          {
            goal_id: 1,
            currently_funded_amount: 1000,
            funding_accounts: [{ account_id: 1, current_funding: 1000 }],
            is_underfunded: false,
          },
          {
            goal_id: 2,
            currently_funded_amount: 100,
            funding_accounts: [{ account_id: 1, current_funding: 100 }],
            is_underfunded: true,
          },
        ],
        unallocated_funding: {
          total_amount: 900,
          accounts: [{ account_id: 1, amount: 900 }],
        },
      });
    });
  });

  describe('updateGoal', () => {
    test('rejects funding accounts that do not belong to the user', async () => {
      mockedPrisma.$transaction.mockImplementation(async (callback: unknown) =>
        (callback as (tx: typeof mockedPrisma) => Promise<unknown>)(mockedPrisma)
      );
      mockedPrisma.accounts.count.mockResolvedValue(0);

      await expect(
        GoalService.updateGoal(
          {
            goal_id: 1n,
            name: 'Goal',
            priority: 1,
            amount: 1000,
            is_archived: false,
            funding_accounts: [{ account_id: 1, funding_type: 'absolute', funding_amount: 500 }],
          },
          1n,
          mockedPrisma
        )
      ).rejects.toMatchObject({ code: 401 });
      expect(mockedPrisma.goals.update).not.toHaveBeenCalled();
    });
  });
});
