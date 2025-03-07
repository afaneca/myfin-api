import { beforeEach, describe, expect, test } from "vitest";
import UserService from "../../src/services/userService.js";
import AccountService from "../../src/services/accountService.js";
import { MYFIN } from "../../src/consts.js";

describe("Account tests", () => {
  let user: { user_id: bigint; username: string; };
  beforeEach(async () => {
    user = await UserService.createUser({
      username: "demo",
      password: "123",
      email: "demo@afaneca.com"
    });
  });

  test("Balance is zero when account is created", async () => {
    await AccountService.createAccount({
      name: "test",
      type: MYFIN.ACCOUNT_TYPES.CHECKING,
      description: "",
      status: MYFIN.ACCOUNT_STATUS.ACTIVE,
      exclude_from_budgets: false,
      current_balance: 0,
      users_user_id: user.user_id
    }, user.user_id);

    const accounts = await AccountService.getAccountsForUserWithAmounts(user.user_id, false);
    expect(accounts).not.toBeNull();
    expect((accounts as Array<any>).length).toBe(1)

    const account = accounts[0];
    expect(account.balance).toBeCloseTo(0)
  });
});

export const assertAccountBalanceAtMonth = async (accountId: bigint, month: number, year: number, expectedBalance) => {
  const accountBalance = await AccountService.getBalanceSnapshotAtMonth(accountId, month, year);
  expect(accountBalance.balance).toBeCloseTo(expectedBalance);
};