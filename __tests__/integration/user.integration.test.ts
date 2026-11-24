import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { prisma } from '../../src/config/prisma.js';
import { UserErrorCodes } from '../../src/errorHandling/apiError.js';
import { i18n } from '../../src/middlewares/i18n.js';
import AccountService from '../../src/services/accountService.js';
import StatsService from '../../src/services/statsService.js';
import UserService from '../../src/services/userService.js';
import BackupManager from '../../src/utils/backupManager.js';
import DemoAccountScheduler from '../../src/utils/demoAccountScheduler.js';
import DemoDataManager from '../../src/utils/demoDataManager.js';
import userBackupMock from './mock/user-backup.mock.json';
import userBackupHugeVersionMock from './mock/user-backup_999999_major_version.mock.json';
import { expectThrowErrorCode, expectThrowErrorRationale } from './utils/testUtils.js';

describe('User tests', () => {
  let user: { user_id: bigint; username: string };

  const setDemoFlag = async (userId: bigint, isDemo: boolean) => {
    await prisma.$executeRaw`
      UPDATE users
      SET is_demo = ${isDemo}
      WHERE user_id = ${userId}
    `;
  };

  beforeEach(async () => {
    user = await UserService.createUser({
      username: 'demo',
      password: '123',
      email: 'demo@afaneca.com',
    });
  });

  describe('auth', () => {
    test('Login should be successful when given correct credentials', async () => {
      const result = await UserService.attemptLogin('demo', '123', false);
      expect(result).toHaveProperty('username');
      expect(result.username).toBe('demo');
      expect(result.is_demo).toBe(false);
    });

    test('Login should be unsuccessful when given incorrect credentials', async () => {
      await expectThrowErrorCode(() => UserService.attemptLogin('demo', '1234', false), 401);
    });

    test('Login should expose demo account flag', async () => {
      await setDemoFlag(user.user_id, true);

      const result = await UserService.attemptLogin('demo', '123', false);
      expect(result.is_demo).toBe(true);
    });

    test('Password change should be blocked for demo accounts', async () => {
      await setDemoFlag(user.user_id, true);

      await expectThrowErrorRationale(
        () => UserService.changeUserPassword(user.user_id, '123', '456', false),
        403,
        UserErrorCodes.DemoPasswordChangeNotAllowed
      );
    });

    test('Password recovery change should be blocked for demo accounts', async () => {
      await setDemoFlag(user.user_id, true);

      await expectThrowErrorRationale(
        // @ts-ignore
        () => UserService.setNewPassword('demo', '123456', '456'),
        403,
        UserErrorCodes.DemoPasswordChangeNotAllowed
      );
    });

    test('Password recovery OTP send should be blocked for demo accounts', async () => {
      await setDemoFlag(user.user_id, true);

      await expectThrowErrorRationale(
        () => UserService.sendOtpForRecovery('demo', i18n.t),
        403,
        UserErrorCodes.DemoPasswordChangeNotAllowed
      );
    });
  });

  describe('BackupManager', () => {
    test('Restore backup should correctly import all data', async () => {
      const initialCounters = await StatsService.getUserCounterStats(user.user_id);
      expect(initialCounters.nr_of_accounts).toBe(0);
      expect(initialCounters.nr_of_budgets).toBe(0);
      expect(initialCounters.nr_of_categories).toBe(0);
      expect(initialCounters.nr_of_entities).toBe(0);
      expect(initialCounters.nr_of_categories).toBe(0);
      expect(initialCounters.nr_of_rules).toBe(0);
      expect(initialCounters.nr_of_tags).toBe(0);
      expect(initialCounters.nr_of_goals).toBe(0);
      expect(initialCounters.nr_of_trx).toBe(0n);

      // @ts-ignore
      await BackupManager.restoreBackup(user.user_id, userBackupMock);

      // Check all entities were added
      const finalCounters = await StatsService.getUserCounterStats(user.user_id);
      expect(finalCounters.nr_of_accounts).toBe(5);
      expect(finalCounters.nr_of_budgets).toBe(4);
      expect(finalCounters.nr_of_categories).toBe(10);
      expect(finalCounters.nr_of_entities).toBe(9);
      expect(finalCounters.nr_of_categories).toBe(10);
      expect(finalCounters.nr_of_rules).toBe(2);
      expect(finalCounters.nr_of_tags).toBe(2);
      expect(finalCounters.nr_of_goals).toBe(2);
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

    test('Backup and restore should keep the tags of transactions', async () => {
      // @ts-ignore
      await BackupManager.restoreBackup(user.user_id, userBackupMock);
      const [tag] = await prisma.tags.findMany({ where: { users_user_id: user.user_id } });
      const trxs = await prisma.transactions.findMany({
        where: {
          accounts_transactions_accounts_account_from_idToaccounts: { users_user_id: user.user_id },
        },
        take: 3,
      });
      await prisma.transaction_has_tags.createMany({
        data: trxs.map((trx) => ({
          transactions_transaction_id: trx.transaction_id,
          tags_tag_id: tag.tag_id,
        })),
      });

      // Same JSON round trip as the backup download and upload
      const backup = JSON.parse(JSON.stringify(await BackupManager.createBackup(user.user_id)));
      const other = await UserService.createUser({
        username: 'other',
        password: '123',
        email: 'other@afaneca.com',
      });
      await BackupManager.restoreBackup(other.user_id, backup);

      const restoredLinks = await prisma.transaction_has_tags.findMany({
        where: { tags: { users_user_id: other.user_id } },
        include: { tags: true, transactions: true },
      });
      expect(restoredLinks.map((link) => link.transactions.description).sort()).toEqual(
        trxs.map((trx) => trx.description).sort()
      );
      expect(restoredLinks.every((link) => link.tags.name === tag.name)).toBe(true);
    });

    test('If backup file is from different major version, an error should be thrown', async () => {
      // @ts-ignore
      await expectThrowErrorCode(
        () => BackupManager.restoreBackup(user.user_id, userBackupHugeVersionMock),
        406
      );
    });
  });

  describe('DemoDataManager', () => {
    test('Create mock data should correctly set all data', async () => {
      const initialCounters = await StatsService.getUserCounterStats(user.user_id);
      expect(initialCounters.nr_of_accounts).toBe(0);
      expect(initialCounters.nr_of_budgets).toBe(0);
      expect(initialCounters.nr_of_categories).toBe(0);
      expect(initialCounters.nr_of_entities).toBe(0);
      expect(initialCounters.nr_of_categories).toBe(0);
      expect(initialCounters.nr_of_rules).toBe(0);
      expect(initialCounters.nr_of_tags).toBe(0);
      expect(initialCounters.nr_of_goals).toBe(0);
      expect(initialCounters.nr_of_trx).toBe(0n);

      // @ts-ignore
      await DemoDataManager.createMockData(user.user_id);

      // Check all entities were added
      const finalCounters = await StatsService.getUserCounterStats(user.user_id);
      expect(finalCounters.nr_of_accounts).toBe(5);
      expect(finalCounters.nr_of_budgets).toBe(4);
      expect(finalCounters.nr_of_categories).toBe(10);
      expect(finalCounters.nr_of_entities).toBe(9);
      expect(finalCounters.nr_of_categories).toBe(10);
      expect(finalCounters.nr_of_rules).toBe(2);
      expect(finalCounters.nr_of_tags).toBe(0);
      expect(finalCounters.nr_of_goals).toBe(1);
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

    test('Scheduler should reset only demo accounts', async () => {
      await setDemoFlag(user.user_id, true);
      await DemoDataManager.createMockData(user.user_id);

      await prisma.entities.deleteMany({
        where: { users_user_id: user.user_id },
      });

      const secondUser = await UserService.createUser({
        username: 'regular-user',
        password: '123',
        email: 'regular@afaneca.com',
      });

      await prisma.entities.create({
        data: {
          users_user_id: secondUser.user_id,
          name: 'Regular User Entity',
        },
      });

      await DemoAccountScheduler.resetDemoAccounts();

      const demoUserStats = await StatsService.getUserCounterStats(user.user_id);
      const regularUserStats = await StatsService.getUserCounterStats(secondUser.user_id);

      expect(demoUserStats.nr_of_accounts).toBe(5);
      expect(demoUserStats.nr_of_entities).toBe(9);
      expect(demoUserStats.nr_of_trx).toBe(17n);
      expect(regularUserStats.nr_of_entities).toBe(1);
      expect(regularUserStats.nr_of_accounts).toBe(0);
    });
  });
});
