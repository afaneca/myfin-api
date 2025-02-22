import { performDatabaseRequest, prisma } from "../config/prisma.js";
import ConvertUtils from "../utils/convertUtils.js";
import { MYFIN } from "../consts.js";
import DateTimeUtils from "../utils/DateTimeUtils.js";
import UserService from "./userService.js";
import { Prisma } from "@prisma/client";

const Account = prisma.accounts;
const Transaction = prisma.transactions;
const BalanceSnapshot = prisma.balances_snapshot;

interface BalanceSnapshot {
  month: number;
  year: number;
  account_snapshots: Array<any>;
}

interface AccountBalance {
  account_id: bigint;
  balance: number;
}

export type AccountType = {
  account_id: number;
  name: string;
  type: string;
  description: string;
  status: string;
  exclude_from_budgets: boolean;
  current_balance: number;
  color_gradient?: string;
  users_user_id: number;
};

export type CreateAccountType = {
  name: string;
  type: string;
  description: string;
  status: string;
  exclude_from_budgets: boolean;
  current_balance: number;
  color_gradient?: string;
  users_user_id: bigint;
};

export type UpdateAccountType = {
  account_id: bigint;
  new_name: string;
  new_type: string;
  new_description: string;
  new_status: string;
  exclude_from_budgets: boolean;
  current_balance: number;
  color_gradient?: string;
  users_user_id: bigint;
};

class AccountService {
  static async createAccount(account: CreateAccountType, userId: bigint, dbClient = prisma) {
    const accountObj = {
      ...account
    };
    // eslint-disable-next-line no-param-reassign
    accountObj.users_user_id = userId;
    // eslint-disable-next-line no-param-reassign
    accountObj.current_balance = ConvertUtils.convertFloatToBigInteger(account.current_balance);
    return dbClient.accounts.create({
      data: accountObj
    });
  }

  static async getAccountsForUser(userId: bigint, selectConfig: Prisma.accountsSelect = undefined, dbClient = prisma) {
    return dbClient.accounts.findMany({
      where: {
        users_user_id: userId
      },
      select: selectConfig
    });
  }

  static async getActiveAccountsForUser(userId: bigint, dbClient = prisma) {
    return dbClient.accounts.findMany({
      where: {
        users_user_id: userId,
        status: MYFIN.ACCOUNT_STATUS.ACTIVE
      }
    });
  }

  static async getAccountsForUserWithAmounts(userId: bigint, onlyActive = false) {
    const onlyActiveExcerpt = onlyActive ? `AND a.status = ${MYFIN.ACCOUNT_STATUS.ACTIVE}` : "";

    return prisma.$queryRaw`SELECT a.account_id,
                                   a.name,
                                   a.type,
                                   a.description,
                                   a.status,
                                   a.color_gradient,
                                   a.exclude_from_budgets,
                                   (a.current_balance / 100) as 'balance', a.users_user_id
                            FROM accounts a
                            WHERE users_user_id = ${userId} || ${onlyActiveExcerpt}
                            ORDER BY abs(balance) DESC, case when a.status = ${MYFIN.TRX_TYPES.EXPENSE} then 1 else 0 end`;
  }

  static async doesAccountBelongToUser(userId: bigint, accountId: bigint, dbClient = prisma) {
    const result = await dbClient.accounts.findUnique({
      where: {
        users_user_id: userId,
        account_id: accountId
      }
    });

    return result !== null;
  }

  static async deleteAccount(accountId: bigint) {
    const deleteTransactions = Transaction.deleteMany({
      where: {
        OR: [{ accounts_account_from_id: accountId }, { accounts_account_to_id: accountId }]
      }
    });

    const deleteBalanceSnapshots = BalanceSnapshot.deleteMany({
      where: { accounts_account_id: accountId }
    });

    const deleteAccount = Account.delete({
      where: { account_id: accountId }
    });

    await prisma.$transaction([deleteTransactions, deleteBalanceSnapshots, deleteAccount]);
  }

  static async updateAccount(account: UpdateAccountType, userId: bigint) {
    const accountObj = {
      ...account,
      users_user_id: userId,
      current_balance: ConvertUtils.convertFloatToBigInteger(account.current_balance)
    };

    return Account.update({
      where: { account_id: accountObj.account_id },
      data: {
        name: accountObj.new_name,
        type: accountObj.new_type,
        description: accountObj.new_description,
        exclude_from_budgets: accountObj.exclude_from_budgets,
        status: accountObj.new_status,
        current_balance: accountObj.current_balance,
        color_gradient: accountObj.color_gradient,
        updated_timestamp: DateTimeUtils.getCurrentUnixTimestamp()
      }
    });
  }

  static async setNewAccountBalance(
    userId: bigint,
    accountId: bigint,
    newBalance: number,
    prismaClient = prisma
  ) {
    return prismaClient.accounts.update({
      where: {
        users_user_id: userId,
        account_id: accountId
      },
      data: { current_balance: newBalance }
    });
  }

  static async removeBalanceSnapshotsForAccountBetweenMonths(
    accountId: bigint,
    month1: number,
    year1: number,
    month2: number,
    year2: number,
    prismaClient = prisma
  ) {
    if (year2 !== year1) {
      return prismaClient.$queryRaw`DELETE
                                    FROM balances_snapshot
                                    WHERE accounts_account_id = ${accountId}
                                      AND ((year > ${year1} AND year < ${year2}) OR
                                           (year = ${year1} AND month >= ${month1}) OR
                                           (year = ${year2} AND month <= ${month2})) `;
    }

    return prismaClient.$queryRaw`DELETE
                                  FROM balances_snapshot
                                  WHERE accounts_account_id = ${accountId}
                                          AND month >= ${month1}
                                          AND month <= ${month2} `;
  }

  static async getBalanceSnapshotAtMonth(
    accId: bigint,
    month: number,
    year: number,
    prismaClient = prisma
  ): Promise<{ balance?: number } | undefined> {
    const data =
      await prismaClient.$queryRaw`SELECT truncate((coalesce(balance, 0) / 100), 2) as 'balance'
                                   FROM balances_snapshot
                                   WHERE accounts_account_id = ${accId}
                                     AND ((year = ${year} AND month <= ${month})
                                     OR (year < ${year}))
                                   ORDER BY year DESC, month DESC
                                     LIMIT 1`;
    if (Array.isArray(data)) {
      return data[0];
    } else return undefined;
  }

  static async addCustomBalanceSnapshot(
    accountId: bigint,
    month: number,
    year: number,
    newBalance: number,
    prismaClient = prisma
  ) {
    const currentTimestamp = DateTimeUtils.getCurrentUnixTimestamp();
    return prismaClient.$queryRaw`INSERT INTO balances_snapshot (accounts_account_id, month, year, balance, created_timestamp)
                                  VALUES (${accountId}, ${month}, ${year},
                                          ${newBalance},
                                          ${currentTimestamp}) ON DUPLICATE KEY
    UPDATE balance = ${newBalance},
      updated_timestamp = ${currentTimestamp};`;
  }

  static async getAllTransactionsForAccountBetweenDates(
    accountId: bigint,
    fromDate: number,
    toDate: number,
    prismaClient = prisma
  ): Promise<any[]> {
    return prismaClient.$queryRaw`SELECT transaction_id,
                                         transactions.date_timestamp,
                                         transactions.amount as amount,
                                         transactions.type,
                                         transactions.description,
                                         accounts_account_from_id,
                                         accounts_account_to_id
                                  FROM transactions
                                  WHERE date_timestamp BETWEEN ${fromDate} AND ${toDate}
                                    AND (accounts_account_from_id = ${accountId} OR
                                         accounts_account_to_id = ${accountId})
                                  ORDER BY date_timestamp ASC`;
  }

  static async recalculateBalanceForAccountIncrementally(
    accountId: bigint,
    fromDate: number | bigint,
    toDate: number | bigint,
    dbClient = prisma
  ) {
    /* Logger.addLog(`account: ${accountId} | fromDate: ${fromDate} | toDate: ${toDate}`); */
    /*
     * Given that I'm unable to know the balance of an account at any specific time (only at the end of each month),
     * I will need to recalculate from the beginning of the previous month relative to $fromDate all the way to the end of
     * month after associated with $toDate.
     */

    /*
     * Loop through all the months that are being recalculated to clean up the data
     * Very important in case there are months with no transactions at all
     */
    const month1 = DateTimeUtils.getMonthNumberFromTimestamp(Number(fromDate));
    const year1 = DateTimeUtils.getYearFromTimestamp(Number(fromDate));
    const month2 = DateTimeUtils.getMonthNumberFromTimestamp(Number(toDate));
    const year2 = DateTimeUtils.getYearFromTimestamp(Number(toDate));

    await this.removeBalanceSnapshotsForAccountBetweenMonths(
      accountId,
      month1,
      year1,
      month2,
      year2,
      dbClient
    );

    let beginMonth = month1;
    let beginYear = year1;

    let priorMonthsBalance: any = (await this.getBalanceSnapshotAtMonth(
      accountId,
      beginMonth > 2 ? beginMonth - 2 : 12 - 2 + beginMonth,
      beginMonth > 2 ? beginYear : beginYear - 1,
      dbClient
    )) ?? { balance: 0 };
    priorMonthsBalance = ConvertUtils.convertFloatToBigInteger(priorMonthsBalance.balance || "0");

    if (!priorMonthsBalance) {
      priorMonthsBalance = 0;
    }

    let addCustomBalanceSnapshotsPromises = [];
    addCustomBalanceSnapshotsPromises.push(
      this.addCustomBalanceSnapshot(
        accountId,
        beginMonth,
        beginYear,
        priorMonthsBalance,
        dbClient
      )
    );

    /* Reset balance for next 2 months (in case there are no transactions in
                                                  these months and the balance doesn't get recalculated */
    addCustomBalanceSnapshotsPromises.push(
      this.addCustomBalanceSnapshot(
        accountId,
        beginMonth < 12 ? beginMonth + 1 : 1,
        beginMonth < 12 ? beginYear : beginYear + 1,
        priorMonthsBalance,
        dbClient
      )
    );

    addCustomBalanceSnapshotsPromises.push(
      this.addCustomBalanceSnapshot(
        accountId,
        beginMonth < 11 ? beginMonth + 2 : 1,
        beginMonth < 11 ? beginYear : beginYear + 1,
        priorMonthsBalance,
        dbClient
      )
    );

    await Promise.all(addCustomBalanceSnapshotsPromises);

    // Decrease begin month by 1
    if (beginMonth > 1) {
      beginMonth -= 1;
    } else {
      beginMonth = 12;
      beginYear -= 1;
    }

    let endMonth = DateTimeUtils.getMonthNumberFromTimestamp(toDate);
    let endYear = DateTimeUtils.getYearFromTimestamp(toDate);

    // Increase end month by 1
    if (endMonth < 12) {
      endMonth += 1;
    } else {
      endMonth = 1;
      endYear += 1;
    }

    fromDate = new Date(`${beginYear}-${beginMonth}-1`).getTime() / 1000;
    toDate = new Date(`${endYear}-${endMonth}-1`).getTime() / 1000;
    const trxList = await this.getAllTransactionsForAccountBetweenDates(
      accountId,
      fromDate,
      toDate,
      dbClient
    );

    let initialBalance = priorMonthsBalance;
    if (!initialBalance) {
      initialBalance = 0;
    }

    for (const trx of trxList) {
      /* Logger.addStringifiedLog(trx); */
      const trxDate = parseInt(trx.date_timestamp, 10);
      const month = DateTimeUtils.getMonthNumberFromTimestamp(trxDate);
      const year = DateTimeUtils.getYearFromTimestamp(trxDate);

      const trxType = trx.type;
      let trxAmount = parseInt(trx.amount, 10);

      if (
        trxType === MYFIN.TRX_TYPES.EXPENSE ||
        (trxType === MYFIN.TRX_TYPES.TRANSFER &&
          trx.accounts_account_from_id &&
          trx.accounts_account_from_id == accountId)
      ) {
        trxAmount *= -1;
        /* Logger.addLog(`Trx type is ${trxType}, trxAmmount: ${trxAmount}`); */
      }

      initialBalance += trxAmount;

      addCustomBalanceSnapshotsPromises = [];

      addCustomBalanceSnapshotsPromises.push(
        this.addCustomBalanceSnapshot(accountId, month, year, initialBalance, dbClient)
      );
      addCustomBalanceSnapshotsPromises.push(
        this.addCustomBalanceSnapshot(
          accountId,
          month < 12 ? month + 1 : 1,
          month < 12 ? year : year + 1,
          initialBalance,
          dbClient
        )
      );

      addCustomBalanceSnapshotsPromises.push(
        this.addCustomBalanceSnapshot(
          accountId,
          month < 11 ? month + 2 : 1,
          month < 11 ? year : year + 1,
          initialBalance,
          dbClient
        )
      );

      await Promise.all(addCustomBalanceSnapshotsPromises);
    }

    /* Logger.addLog(`FINAL BALANCE: ${initialBalance}`); */
    return initialBalance;
  }

  static async changeBalance(
    userId: bigint,
    accountId: bigint,
    offsetAmount: number,
    prismaClient = prisma
  ) {
    return prismaClient.$queryRaw`UPDATE accounts
                                  SET current_balance   = current_balance + ${offsetAmount},
                                      updated_timestamp = ${DateTimeUtils.getCurrentUnixTimestamp()}
                                  WHERE account_id = ${accountId}`;
  }

  static async getAmountForInvestmentAccountsInMonth(
    categoryId: bigint,
    month: number,
    year: number,
    dbClient = undefined
  ): Promise<{
    account_balance_credit: number;
    account_balance_debit: number;
  }> {
    return performDatabaseRequest(async (prismaTx) => {
      const nextMonth = month < 12 ? month + 1 : 1;
      const nextMonthsYear = month < 12 ? year : year + 1;
      const toDate = DateTimeUtils.getUnixTimestampFromDate(
        new Date(nextMonthsYear, nextMonth - 1, 1)
      );
      const fromDate = DateTimeUtils.getUnixTimestampFromDate(new Date(year, month - 1, 1));

      const amounts =
        await prismaTx.$queryRaw`SELECT sum(if(transactions.type = 'I', amount, 0)) as 'account_balance_credit', sum(if(transactions.type = 'E' OR (transactions.type = 'T'), amount, 0)) as 'account_balance_debit'
                                 FROM transactions
                                        INNER JOIN accounts
                                                   on accounts.account_id =
                                                      transactions.accounts_account_from_id OR
                                                      accounts.account_id =
                                                      transactions.accounts_account_to_id
                                 WHERE date_timestamp between ${fromDate} AND ${toDate}
                                   AND categories_category_id = ${categoryId}
                                   AND (accounts.type = 'INVAC' AND transactions.type != 'T') `;
      return amounts[0] as { account_balance_credit: number; account_balance_debit: number };
    }, dbClient);
  }

  static async getBalancesSnapshotForMonthForUser(
    userId: bigint,
    month: number,
    year: number,
    includeInvestmentAccounts = true,
    dbClient = undefined
  ): Promise<number> {
    return performDatabaseRequest(async (prismaTx) => {
      const accounts = await prismaTx.accounts.findMany({
        where: {
          users_user_id: userId
        },
        select: {
          account_id: true,
          type: true
        }
      });

      let balancePromises = [];
      for (const account of accounts) {
        if (includeInvestmentAccounts || account.type !== MYFIN.ACCOUNT_TYPES.INVESTING) {
          balancePromises.push(this.getBalanceSnapshotAtMonth(
            account.account_id,
            month,
            year,
            prismaTx
          ));
        }
      }

      const balances = await Promise.all(balancePromises);
      let balance = balances.reduce((result, current) => {
        const balanceSnapshotAtMonth = parseFloat(String(current?.balance || 0));
        if (balanceSnapshotAtMonth) {
          return result + balanceSnapshotAtMonth;
        } else return result;
      }, 0);

      return balance;
    }, dbClient);
  }

  static async getCountOfUserAccounts(userId, dbClient = prisma) {
    return dbClient.accounts.count({
      where: { users_user_id: userId }
    });
  }

  static async getAllBalancesSnapshotsForMonthForUser(
    userId: bigint,
    month: number,
    year: number,
    accounts: Array<{
      account_id: bigint;
    }>,
    dbClient = prisma
  ): Promise<Array<AccountBalance>> {
    const accSnapshot: Array<AccountBalance> = [];
    for (const account of accounts) {
      const balance = (await this.getBalanceSnapshotAtMonth(
        account.account_id,
        month,
        year,
        dbClient
      )) ?? { balance: 0 };
      /* Logger.addLog("---------");
                              Logger.addStringifiedLog(balance);
                              Logger.addLog("---------"); */
      /* Logger.addStringifiedLog({
                                account_id: account.account_id,
                                balance: balance.balance
                              }); */
      accSnapshot.push({
        account_id: account.account_id,
        balance: balance.balance ?? 0
      });
    }
    return accSnapshot;
  }

  static async recalculateAndSetAccountBalance(
    userId: bigint,
    accountId: bigint,
    dbClient = undefined
  ) {
    await performDatabaseRequest(async (dbTx) => {
      const recalculatedBalance = await this.recalculateBalanceForAccountIncrementally(
        accountId,
        0,
        DateTimeUtils.getCurrentUnixTimestamp() + 1,
        dbTx
      );
      await this.setNewAccountBalance(userId, accountId, recalculatedBalance, dbTx);
    }, dbClient);
  }

  static async getUserAccountsBalanceSnapshot(
    userId,
    dbClient = undefined
  ): Promise<Array<BalanceSnapshot>> {
    return performDatabaseRequest(async (prismaTx) => {
      const snapArr: Array<BalanceSnapshot> = [];

      // If user has no accounts, return immediately an empty array
      if (!((await this.getCountOfUserAccounts(userId, prismaTx)) != 0)) {
        return snapArr;
      }
      const firstUserTransactionDate = await UserService.getFirstUserTransactionDate(
        userId,
        prismaTx
      );
      if (!firstUserTransactionDate) return snapArr;

      let firstMonth = firstUserTransactionDate.month;
      let firstYear = firstUserTransactionDate.year;

      const currentMonth = DateTimeUtils.getMonthNumberFromTimestamp(
        DateTimeUtils.getCurrentUnixTimestamp()
      );
      const currentYear = DateTimeUtils.getYearFromTimestamp(
        DateTimeUtils.getCurrentUnixTimestamp()
      );
      const userAccounts = await prismaTx.accounts.findMany({
        where: {
          users_user_id: userId
        },
        select: {
          account_id: true
        }
      });
      /* Logger.addStringifiedLog(accsArr); */
      // Get balance snapshots for all accounts every month in between the first transaction and right now
      while (
        DateTimeUtils.monthIsEqualOrPriorTo(firstMonth, firstYear, currentMonth, currentYear)
        ) {
        /* Logger.addLog(`First Month: ${firstMonth} | First Year: ${firstYear} | Current Month: ${currentMonth} | Current Year: ${currentYear}`); */
        snapArr.push({
          month: firstMonth,
          year: firstYear,
          account_snapshots: await this.getAllBalancesSnapshotsForMonthForUser(
            userId,
            firstMonth,
            firstYear,
            userAccounts,
            prismaTx
          )
        });

        if (firstMonth < 12) firstMonth++;
        else {
          firstMonth = 1;
          firstYear++;
        }
      }
      /* Logger.addStringifiedLog(snapArr); */
      return snapArr;
    }, dbClient);
  }

  static async recalculateAllUserAccountsBalances(userId: bigint, dbClient = prisma) {
    await performDatabaseRequest(async (dbTx) => {
      const userAccounts = await this.getAccountsForUser(
        userId,
        { account_id: true },
        dbTx
      );
      const promises = [];
      for (const account of userAccounts) {
        promises.push(
          this.recalculateAndSetAccountBalance(userId, account.account_id, dbTx)
        );
      }

      await Promise.all(promises);
    }, dbClient);
  }

  static async getAllAccountsForUserWithAmounts(
    userId: bigint,
    onlyActive = false,
    dbClient = undefined
  ) {
    return performDatabaseRequest(async (dbTx) => {
      return dbTx.$queryRaw`SELECT a.account_id,
                                   a.name,
                                   a.type,
                                   a.description,
                                   a.status,
                                   a.color_gradient,
                                   a.exclude_from_budgets,
                                   (a.current_balance / 100) as 'balance', a.users_user_id
                            FROM accounts a
                            WHERE users_user_id = ${userId}
                              AND a.status LIKE ${onlyActive ? MYFIN.ACCOUNT_STATUS.ACTIVE : "%"}
                            ORDER BY abs(balance) DESC, case when a.status = ${
                              MYFIN.ACCOUNT_STATUS.INACTIVE
                            } then 1 else 0 end`;
    }, dbClient);
  }

  static async deleteBalanceSnapshotsForUser(userId: bigint, dbClient = prisma) {
    return dbClient.$queryRaw`DELETE
    balances_snapshot FROM balances_snapshot 
      LEFT JOIN accounts ON accounts.account_id = balances_snapshot.accounts_account_id
      WHERE users_user_id =
    ${userId} `;
  }
}

export default AccountService;
