import { expect } from 'vitest';
import { prisma } from '../../../src/config/prisma.js';
import APIError from '../../../src/errorHandling/apiError.js';
import AccountService from '../../../src/services/accountService.js';
import DateTimeUtils from '../../../src/utils/DateTimeUtils.js';
import ConvertUtils from '../../../src/utils/convertUtils.js';

export const expectThrowErrorCode = async (assertion: () => Promise<any>, expectedCode: number) => {
  await expect(assertion()).rejects.toSatisfy((e) => {
    expect(e).toBeInstanceOf(APIError);
    expect(e.code).toBe(expectedCode);
    return true;
  });
};

export const assertAccountBalanceAtMonth = async (
  accountId: bigint,
  month: number,
  year: number,
  expectedBalance
) => {
  const accountBalance = await AccountService.getBalanceSnapshotAtMonth(accountId, month, year);
  expect(accountBalance.balance).toBeCloseTo(expectedBalance);
};

export const assertCurrentAccountBalance = async (accountId: bigint, expectedBalance) => {
  // Assert from the latest snapshot
  await assertAccountBalanceAtMonth(
    accountId,
    DateTimeUtils.getCurrentMonth(),
    DateTimeUtils.getCurrentYear(),
    expectedBalance
  );

  // Also assert from current_balance property
  const account = await prisma.accounts.findUniqueOrThrow({
    where: {
      account_id: accountId,
    },
  });
  expect(ConvertUtils.convertBigIntegerToFloat(account.current_balance)).toBeCloseTo(
    expectedBalance
  );
};
