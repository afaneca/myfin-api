import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import AccountService from '../../src/services/accountService.js';
import StatsService from '../../src/services/statsService.js';
import UserService from '../../src/services/userService.js';
import BackupManager from '../../src/utils/backupManager.js';
import DemoDataManager from '../../src/utils/demoDataManager.js';
import userBackupMock from './mock/user-backup.mock.json';
import userBackupHugeVersionMock from './mock/user-backup_999999_major_version.mock.json';
import { expectThrowErrorCode } from './utils/testUtils.js';

describe('User tests', () => {
  let user: { user_id: bigint; username: string };

  beforeEach(async () => {
    user = await UserService.createUser({
      username: 'demo',
      password: '123',
      email: 'demo@afaneca.com',
    });
  });

  describe('auth', async () => {
    test('Login should be successful when given correct credentials', async () => {
      const result = await UserService.attemptLogin('demo', '123', false);
      expect(result).toHaveProperty('username');
      expect(result.username).toBe('demo');
    });

    test('Login should be unsuccessful when given incorrect credentials', async () => {
      await expectThrowErrorCode(() => UserService.attemptLogin('demo', '1234', false), 401);
    });
  });

  describe('BackupManager', async () => {
    test('Restore backup should correctly import all data', async () => {
      const initialCounters = await StatsService.getUserCounterStats(user.user_id);
      expect(initialCounters.nr_of_accounts).toBe(0);
      expect(initialCounters.nr_of_budgets).toBe(0);
      expect(initialCounters.nr_of_categories).toBe(0);
      expect(initialCounters.nr_of_entities).toBe(0);
      expect(initialCounters.nr_of_categories).toBe(0);
      expect(initialCounters.nr_of_rules).toBe(0);
      expect(initialCounters.nr_of_tags).toBe(0);
      expect(initialCounters.nr_of_trx).toBe(0n);

      // @ts-ignore
      await BackupManager.restoreBackup(user.user_id, userBackupMock);

      // Check all entities were added
      const finalCounters = await StatsService.getUserCounterStats(user.user_id);
      expect(finalCounters.nr_of_accounts).toBe(5);
      expect(finalCounters.nr_of_budgets).toBe(4);
      expect(finalCounters.nr_of_categories).toBe(9);
      expect(finalCounters.nr_of_entities).toBe(10);
      expect(finalCounters.nr_of_categories).toBe(9);
      expect(finalCounters.nr_of_rules).toBe(2);
      expect(finalCounters.nr_of_tags).toBe(0);
      expect(finalCounters.nr_of_trx).toBe(17n);

      // Check account balances are correct
      const balances = (await AccountService.getAccountsForUserWithAmounts(user.user_id)) as {
        name: string;
        balance: number;
      }[];
      expect(balances.find((a) => a.name === 'HQ Mutual').balance).toBeCloseTo(-299465.4);
      expect(balances.find((a) => a.name === 'BBank - Current').balance).toBeCloseTo(8261.76);
      expect(balances.find((a) => a.name === 'BBank - Savings').balance).toBeCloseTo(2500.0);
      expect(balances.find((a) => a.name === 'XYZ Capital').balance).toBeCloseTo(0.0);
      expect(balances.find((a) => a.name === 'SAFU Credit').balance).toBeCloseTo(-911.79);
    });

    test('If backup file is from different major version, an error should be thrown', async () => {
      // @ts-ignore
      await expectThrowErrorCode(
        () => BackupManager.restoreBackup(user.user_id, userBackupHugeVersionMock),
        406
      );
    });
  });

  describe('DemoDataManager', async () => {
    test('Create mock data should correctly set all data', async () => {
      const initialCounters = await StatsService.getUserCounterStats(user.user_id);
      expect(initialCounters.nr_of_accounts).toBe(0);
      expect(initialCounters.nr_of_budgets).toBe(0);
      expect(initialCounters.nr_of_categories).toBe(0);
      expect(initialCounters.nr_of_entities).toBe(0);
      expect(initialCounters.nr_of_categories).toBe(0);
      expect(initialCounters.nr_of_rules).toBe(0);
      expect(initialCounters.nr_of_tags).toBe(0);
      expect(initialCounters.nr_of_trx).toBe(0n);

      // @ts-ignore
      await DemoDataManager.createMockData(user.user_id);

      // Check all entities were added
      const finalCounters = await StatsService.getUserCounterStats(user.user_id);
      expect(finalCounters.nr_of_accounts).toBe(5);
      expect(finalCounters.nr_of_budgets).toBe(4);
      expect(finalCounters.nr_of_categories).toBe(9);
      expect(finalCounters.nr_of_entities).toBe(10);
      expect(finalCounters.nr_of_categories).toBe(9);
      expect(finalCounters.nr_of_rules).toBe(2);
      expect(finalCounters.nr_of_tags).toBe(0);
      expect(finalCounters.nr_of_trx).toBe(17n);

      // Check account balances are correct
      const balances = (await AccountService.getAccountsForUserWithAmounts(user.user_id)) as {
        name: string;
        balance: number;
      }[];
      expect(balances.find((a) => a.name === 'HQ Mutual').balance).toBeCloseTo(-299465.4);
      expect(balances.find((a) => a.name === 'BBank - Current').balance).toBeCloseTo(8261.76);
      expect(balances.find((a) => a.name === 'BBank - Savings').balance).toBeCloseTo(2500.0);
      expect(balances.find((a) => a.name === 'XYZ Capital').balance).toBeCloseTo(0.0);
      expect(balances.find((a) => a.name === 'SAFU Credit').balance).toBeCloseTo(-911.79);
    });
  });
});
