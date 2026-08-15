import { afterEach, describe, expect, test, vi } from 'vitest';
import AccountService from '../../src/services/accountService.js';
import { mockedPrisma } from './prisma.mock.js';

describe('accountService balance snapshots', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('fetches snapshots once and carries the latest balance forward by month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 15));

    mockedPrisma.accounts.count.mockResolvedValue(2);
    mockedPrisma.accounts.findMany.mockResolvedValue([
      { account_id: 1n },
      { account_id: 2n },
    ] as never);
    mockedPrisma.$queryRaw.mockResolvedValueOnce([{ month: 1, year: 2025 }] as never);
    mockedPrisma.balances_snapshot.findMany.mockResolvedValue([
      { accounts_account_id: 1n, month: 1, year: 2025, balance: 10_000n },
      { accounts_account_id: 2n, month: 12, year: 2024, balance: -500n },
      { accounts_account_id: 2n, month: 2, year: 2025, balance: 2_500n },
      { accounts_account_id: 1n, month: 3, year: 2025, balance: 12_500n },
    ] as never);

    const result = await AccountService.getUserAccountsBalanceSnapshot(1n, mockedPrisma);

    expect(result).toEqual([
      {
        month: 1,
        year: 2025,
        account_snapshots: [
          { account_id: 1n, balance: 100 },
          { account_id: 2n, balance: -5 },
        ],
      },
      {
        month: 2,
        year: 2025,
        account_snapshots: [
          { account_id: 1n, balance: 100 },
          { account_id: 2n, balance: 25 },
        ],
      },
      {
        month: 3,
        year: 2025,
        account_snapshots: [
          { account_id: 1n, balance: 125 },
          { account_id: 2n, balance: 25 },
        ],
      },
    ]);
    expect(mockedPrisma.balances_snapshot.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
