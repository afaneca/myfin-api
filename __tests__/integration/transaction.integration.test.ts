import { beforeEach, describe, test } from "vitest";
import UserService from "../../src/services/userService.js";
import AccountService from "../../src/services/accountService.js";
import { MYFIN } from "../../src/consts.js";
import TransactionService from "../../src/services/transactionService.js";
import DateTimeUtils from "../../src/utils/DateTimeUtils.js";
import { assertAccountBalanceAtMonth } from "./account.integration.test.js";

describe("Transaction tests", () => {
  let user: { user_id: bigint; username: string; };
  let account1: { account_id: bigint; name: string; };
  let account2: { account_id: bigint; name: string; };
  beforeEach(async () => {
    user = await UserService.createUser({
      username: "demo",
      password: "123",
      email: "demo@afaneca.com"
    });

    account1 = await AccountService.createAccount({
        name: "test",
        type: MYFIN.ACCOUNT_TYPES.CHECKING,
        description: "",
        status: MYFIN.ACCOUNT_STATUS.ACTIVE,
        exclude_from_budgets: false,
        current_balance: 0,
        users_user_id: user.user_id
      },
      user.user_id);

    account2 = await AccountService.createAccount({
        name: "test2",
        type: MYFIN.ACCOUNT_TYPES.CHECKING,
        description: "",
        status: MYFIN.ACCOUNT_STATUS.ACTIVE,
        exclude_from_budgets: false,
        current_balance: 0,
        users_user_id: user.user_id
      },
      user.user_id);
  });

  test("When transactions are added, updated or removed, account balance is recalculated accordingly", async () => {
    // Create income transaction
    const trx1 = await TransactionService.createTransaction(user.user_id,
      {
        account_from_id: null,
        account_to_id: account1.account_id,
        amount: 10,
        category_id: null,
        date_timestamp: DateTimeUtils.getCurrentUnixTimestamp(),
        description: "test 1",
        entity_id: null,
        is_essential: false,
        tags: [],
        type: MYFIN.TRX_TYPES.INCOME
      });

    // Assert balance is 10
    await assertAccountBalanceAtMonth(
      account1.account_id,
      DateTimeUtils.getCurrentMonth(),
      DateTimeUtils.getCurrentYear(),
      10
    );

    // Create income transaction
    const trx2 = await TransactionService.createTransaction(user.user_id,
      {
        account_from_id: null,
        account_to_id: account1.account_id,
        amount: 125.5,
        category_id: null,
        date_timestamp: DateTimeUtils.getCurrentUnixTimestamp(),
        description: "test 2",
        entity_id: null,
        is_essential: false,
        tags: [],
        type: MYFIN.TRX_TYPES.INCOME
      });

    // Assert balance is 10 + 125.5 = 135.5
    await assertAccountBalanceAtMonth(
      account1.account_id,
      DateTimeUtils.getCurrentMonth(),
      DateTimeUtils.getCurrentYear(),
      135.5
    );

    // Create expense transaction
    const trx3 = await TransactionService.createTransaction(user.user_id,
      {
        account_from_id: account1.account_id,
        account_to_id: null,
        amount: 253.35,
        category_id: null,
        date_timestamp: DateTimeUtils.getCurrentUnixTimestamp(),
        description: "test 3",
        entity_id: null,
        is_essential: false,
        tags: [],
        type: MYFIN.TRX_TYPES.EXPENSE
      });

    // Assert balance is 10 + 125.5 - 253.35 = -117.85
    await assertAccountBalanceAtMonth(
      account1.account_id,
      DateTimeUtils.getCurrentMonth(),
      DateTimeUtils.getCurrentYear(),
      -117.85
    );

    // Create transfer from account1 to account2
    const trx4 = await TransactionService.createTransaction(user.user_id,
      {
        account_from_id: account1.account_id,
        account_to_id: account2.account_id,
        amount: 29,
        category_id: null,
        date_timestamp: DateTimeUtils.getCurrentUnixTimestamp(),
        description: "test 4",
        entity_id: null,
        is_essential: false,
        tags: [],
        type: MYFIN.TRX_TYPES.EXPENSE
      });

    // Assert balance is 10 + 125.5 - 253.35 -29 = -146.85
    await assertAccountBalanceAtMonth(
      account1.account_id,
      DateTimeUtils.getCurrentMonth(),
      DateTimeUtils.getCurrentYear(),
      -146.85
    );

    // Update trx3 to be income and change amount
    await TransactionService.updateTransaction(
      user.user_id,
      {
        new_amount: 254.35,
        new_account_from_id: null,
        new_account_to_id: account1.account_id,
        new_entity_id: null,
        new_category_id: null,
        new_type: MYFIN.TRX_TYPES.INCOME,
        new_description: trx3.description,
        new_date_timestamp: Number(trx3.date_timestamp),
        new_is_essential: trx3.isEssential,
        tags: trx3.tags,
        is_split: false,
        split_tags: null,
        transaction_id: trx3.transaction_id,
      }
    )

    // Assert balance is 10 + 125.5 - 253.35 -29 + 253.35 + 254.35 = 360.85
    await assertAccountBalanceAtMonth(
      account1.account_id,
      DateTimeUtils.getCurrentMonth(),
      DateTimeUtils.getCurrentYear(),
      360.85
    );

    // Delete trx4
    await TransactionService.deleteTransaction(
      user.user_id,
      trx4.transaction_id
    )

    // Assert balance is 10 + 125.5 - 253.35 -29 + 253.35 + 254.35 +29 = 389.85
    await assertAccountBalanceAtMonth(
      account1.account_id,
      DateTimeUtils.getCurrentMonth(),
      DateTimeUtils.getCurrentYear(),
      389.85
    );
  });
});