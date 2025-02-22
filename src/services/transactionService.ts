import { performDatabaseRequest, prisma } from '../config/prisma.js';
import EntityService from './entityService.js';
import CategoryService from './categoryService.js';
import AccountService from './accountService.js';
import UserService from './userService.js';
import DateTimeUtils from '../utils/DateTimeUtils.js';
import { MYFIN } from '../consts.js';
import ConvertUtils from '../utils/convertUtils.js';
import APIError from '../errorHandling/apiError.js';
import Logger from '../utils/Logger.js';
import RuleService from './ruleService.js';
import TagService, { Tag } from './tagService.js';

const getTransactionsForUser = async (
  userId: bigint,
  trxLimit: number
) => prisma.$queryRaw`SELECT transaction_id,
                             transactions.date_timestamp,
                             (transactions.amount / 100) as amount,
                             transactions.type,
                             transactions.is_essential,
                             transactions.description,
                             entities.entity_id,
                             entities.name               as entity_name,
                             categories_category_id,
                             categories.name             as category_name,
                             accounts_account_from_id,
                             acc_to.name                 as account_to_name,
                             accounts_account_to_id,
                             acc_from.name               as account_from_name
                      FROM transactions
                             LEFT JOIN accounts ON accounts.account_id = transactions.accounts_account_from_id
                             LEFT JOIN categories
                                       ON categories.category_id = transactions.categories_category_id
                             LEFT JOIN entities ON entities.entity_id = transactions.entities_entity_id
                             LEFT JOIN accounts acc_to
                                       ON acc_to.account_id = transactions.accounts_account_to_id
                             LEFT JOIN accounts acc_from
                                       ON acc_from.account_id = transactions.accounts_account_from_id
                      WHERE acc_to.users_user_id = ${userId}
                         OR acc_from.users_user_id = ${userId}
                      GROUP BY transaction_id
                      ORDER BY transactions.date_timestamp DESC
                      LIMIT ${trxLimit}`;

const doesTransactionBelongToUser = async (
  userId: bigint,
  transactionId: bigint,
  dbClient = prisma
) => {
  // Get the transaction
  const trx = await dbClient.transactions.findFirst({
    where: {
      transaction_id: transactionId,
    },
  });
  if (!trx) return false;
  const result = await dbClient.accounts.findFirst({
    where: {
      OR: [
        { account_id: trx.accounts_account_from_id || -1 },
        { account_id: trx.accounts_account_to_id || -1 },
      ],
    },
  });

  return result !== null;
};

const getAllTagsForTransaction = async (
  userId: bigint,
  transactionId: bigint,
  dbClient = undefined
) =>
  performDatabaseRequest(async (prismaTx) => {
    // Make sure transaction belongs to user
    const transactionBelongsToUser = await doesTransactionBelongToUser(
      userId,
      transactionId,
      prismaTx
    );
    if (!transactionBelongsToUser) {
      throw APIError.notAuthorized();
    }

    const tags = await prismaTx.transaction_has_tags.findMany({
      where: {
        transactions_transaction_id: transactionId,
      },
      select: {
        tags: true,
      },
    });

    let tagsData = [];
    if (Array.isArray(tags)) {
      tagsData = tags.map((tag) => tag.tags);
    }

    return tagsData;
  }, dbClient);

const getFilteredTransactionsByForUser = async (
  userId: bigint,
  page: number,
  pageSize: number,
  searchQuery: string
) => {
  const query = `%${searchQuery}%`;
  const offsetValue = page * pageSize;

  // main query for list of results (limited by pageSize and offsetValue)
  const mainQuery = prisma.$queryRaw`SELECT transaction_id,
                                            transactions.is_essential,
                                            transactions.date_timestamp,
                                            (transactions.amount / 100) as amount,
                                            transactions.type,
                                            transactions.description,
                                            entities.entity_id,
                                            entities.name               as entity_name,
                                            categories_category_id,
                                            categories.name             as category_name,
                                            accounts_account_from_id,
                                            acc_to.name                 as account_to_name,
                                            accounts_account_to_id,
                                            acc_from.name               as account_from_name,
                                            GROUP_CONCAT(tags.name) as tag_names
                                     FROM transactions
                                            LEFT JOIN accounts ON accounts.account_id = transactions.accounts_account_from_id
                                            LEFT JOIN categories
                                                      ON categories.category_id = transactions.categories_category_id
                                            LEFT JOIN entities ON entities.entity_id = transactions.entities_entity_id
                                            LEFT JOIN accounts acc_to
                                                      ON acc_to.account_id = transactions.accounts_account_to_id
                                            LEFT JOIN accounts acc_from
                                                      ON acc_from.account_id = transactions.accounts_account_from_id
                                            LEFT JOIN transaction_has_tags ON transaction_has_tags.transactions_transaction_id = transactions.transaction_id
                                            LEFT JOIN tags ON tags.tag_id = transaction_has_tags.tags_tag_id
                                     WHERE (acc_to.users_user_id = ${userId} OR acc_from.users_user_id = ${userId})
                                       AND (transactions.description LIKE
                                            ${query} OR
                                            acc_from.name LIKE ${query}
                                       OR acc_to.name LIKE ${query}
                                       OR (amount / 100) LIKE ${query}
                                       OR entities.name LIKE ${query}
                                       OR categories.name LIKE ${query}
                                       OR tags.name LIKE ${query})
                                     GROUP BY transaction_id
                                     ORDER BY transactions.date_timestamp
                                         DESC
                                     LIMIT ${pageSize} OFFSET ${offsetValue}`;

  // count of total of filtered results
  const countQuery = prisma.$queryRaw`SELECT count(*) as 'count'
                                      FROM (SELECT transactions.date_timestamp, GROUP_CONCAT(tags.name) as tag_names
                                            from transactions
                                                   LEFT JOIN accounts ON accounts.account_id = transactions.accounts_account_from_id
                                                   LEFT JOIN categories
                                                             ON categories.category_id = transactions.categories_category_id
                                                   LEFT JOIN entities ON entities.entity_id = transactions.entities_entity_id
                                                   LEFT JOIN accounts acc_to
                                                             ON acc_to.account_id = transactions.accounts_account_to_id
                                                   LEFT JOIN accounts acc_from
                                                             ON acc_from.account_id = transactions.accounts_account_from_id
                                                   LEFT JOIN transaction_has_tags ON transaction_has_tags.transactions_transaction_id = transactions.transaction_id
                                                   LEFT JOIN tags ON tags.tag_id = transaction_has_tags.tags_tag_id          
                                            WHERE (acc_to.users_user_id = ${userId} OR acc_from.users_user_id = ${userId})
                                              AND (transactions.description LIKE
                                                   ${query} OR
                                                   acc_from.name LIKE ${query}
                                              OR acc_to.name LIKE ${query}
                                              OR (amount / 100) LIKE ${query}
                                              OR entities.name LIKE ${query}
                                              OR categories.name LIKE
                                                 ${query}
                                              OR tags.name LIKE ${query})
                                            GROUP BY transaction_id) trx`;

  const totalCountQuery = prisma.$queryRaw`SELECT count(*) as 'count'
                                           FROM (SELECT transactions.date_timestamp
                                                 from transactions
                                                        LEFT JOIN accounts ON accounts.account_id = transactions.accounts_account_from_id
                                                        LEFT JOIN categories
                                                                  ON categories.category_id = transactions.categories_category_id
                                                        LEFT JOIN entities ON entities.entity_id = transactions.entities_entity_id
                                                        LEFT JOIN accounts acc_to
                                                                  ON acc_to.account_id = transactions.accounts_account_to_id
                                                        LEFT JOIN accounts acc_from
                                                                  ON acc_from.account_id = transactions.accounts_account_from_id
                                                 WHERE (acc_to.users_user_id = ${userId} OR acc_from.users_user_id = ${userId})
                                                 GROUP BY transaction_id) trx`;

  const [mainQueryResult, countQueryResult, totalCountQueryResult] = await prisma.$transaction([
    mainQuery,
    countQuery,
    totalCountQuery,
  ]);

  // Attach associated tags to transaction
  const promises = [];

  if (Array.isArray(mainQueryResult)) {
    for (const trx of mainQueryResult) {
      trx.tags = await getAllTagsForTransaction(userId, trx.transaction_id);
    }
  }

  await Promise.all(promises);

  return {
    results: mainQueryResult,
    filtered_count: countQueryResult[0].count,
    total_count: totalCountQueryResult[0].count,
  };
};
const createTransactionStep0 = async (userId: bigint, dbClient = undefined) => {
  const [entities, categories, accounts, tags] = await performDatabaseRequest(async (_) => {
    const ents = await EntityService.getAllEntitiesForUser(userId);
    const cats = await CategoryService.getAllCategoriesForUser(userId);
    const accs = await AccountService.getActiveAccountsForUser(userId);
    const tags = await TagService.getAllTagsForUser(userId);

    return [ents, cats, accs, tags];
  }, dbClient);

  return {
    entities: entities,
    categories: categories,
    accounts: accounts,
    tags: tags,
  };
};

export type CreateTransactionType = {
  amount: number;
  type: string;
  description: string;
  entity_id?: bigint;
  account_from_id?: bigint;
  account_to_id?: bigint;
  category_id?: bigint;
  date_timestamp: number;
  is_essential: boolean;
  tags?: Array<string>;
};
const createTransaction = async (
  userId: bigint,
  trx: CreateTransactionType,
  dbClient = undefined
) => {
  //Logger.addStringifiedLog(trx);
  trx.amount = ConvertUtils.convertFloatToBigInteger(trx.amount);
  return performDatabaseRequest(async (prismaTx) => {
    // Add transaction
    const addedTrx = await prismaTx.transactions.create({
      data: {
        date_timestamp: trx.date_timestamp,
        amount: trx.amount,
        type: trx.type,
        description: trx.description,
        entities_entity_id: trx.entity_id,
        accounts_account_from_id: trx.account_from_id,
        accounts_account_to_id: trx.account_to_id,
        categories_category_id: trx.category_id,
        is_essential: trx.is_essential,
      },
    });

    // Set last update timestamp
    await UserService.setupLastUpdateTimestamp(
      userId,
      DateTimeUtils.getCurrentUnixTimestamp(),
      prismaTx
    );

    // Associate tags with transaction
    await Promise.all(
      trx.tags?.map(async (tagName) => {
        const tag = await TagService.addTagToTransactionByName(
          userId,
          addedTrx.transaction_id,
          tagName,
          true,
          prismaTx
        );
        return tag;
      }) || []
    );

    let newBalance;
    switch (trx.type) {
      case MYFIN.TRX_TYPES.INCOME:
        newBalance = await AccountService.recalculateBalanceForAccountIncrementally(
          trx.account_to_id,
          trx.date_timestamp - 1,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.setNewAccountBalance(userId, trx.account_to_id, newBalance, prismaTx);
        break;
      case MYFIN.TRX_TYPES.EXPENSE:
        newBalance = await AccountService.recalculateBalanceForAccountIncrementally(
          trx.account_from_id,
          trx.date_timestamp - 1,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.setNewAccountBalance(
          userId,
          trx.account_from_id,
          newBalance,
          prismaTx
        );
        break;
      case MYFIN.TRX_TYPES.TRANSFER:
      default:
        newBalance = await AccountService.recalculateBalanceForAccountIncrementally(
          trx.account_to_id,
          trx.date_timestamp - 1,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.setNewAccountBalance(userId, trx.account_to_id, newBalance, prismaTx);
        newBalance = await AccountService.recalculateBalanceForAccountIncrementally(
          trx.account_from_id,
          trx.date_timestamp - 1,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.setNewAccountBalance(
          userId,
          trx.account_from_id,
          newBalance,
          prismaTx
        );
        break;
    }

    return addedTrx;
  }, dbClient);
};

const createTransactionsInBulk = async (
  userId: bigint,
  trxList: Array<CreateTransactionType>,
  dbClient = undefined
) =>
  performDatabaseRequest(async (prismaTx) => {
    let importedCnt = 0;
    for (const trx of trxList) {
      if (
        !trx.date_timestamp ||
        !trx.amount ||
        !trx.type ||
        (!trx.account_from_id && !trx.account_to_id)
      ) {
        continue;
      }

      // Both accounts (if defined) need to belong to the user making the request
      if (
        trx.account_from_id &&
        !(await AccountService.doesAccountBelongToUser(userId, trx.account_from_id))
      ) {
        throw APIError.notAuthorized();
      }

      if (
        trx.account_to_id &&
        !(await AccountService.doesAccountBelongToUser(userId, trx.account_to_id))
      ) {
        throw APIError.notAuthorized();
      }

      await createTransaction(userId, trx, prismaTx);
      importedCnt++;
    }

    return importedCnt;
  }, dbClient);

const deleteTransaction = async (userId: bigint, transactionId: number, dbClient = undefined) => {
  await performDatabaseRequest(async (prismaTx) => {
    const trx = await prismaTx.transactions
      .findUniqueOrThrow({
        where: {
          transaction_id: transactionId,
        },
      })
      .catch((err) => {
        throw APIError.notFound(`Transaction could not be found.`);
      });

    const oldTimestamp = trx.date_timestamp;
    const oldType = trx.type;
    const oldAccountTo = trx.accounts_account_to_id;
    const oldAccountFrom = trx.accounts_account_from_id;
    Logger.addStringifiedLog(trx);
    // Make sure account belongs to user
    const accountsCount = await prismaTx.accounts.count({
      where: {
        // @ts-expect-error expected
        account_id: { in: [oldAccountTo || -1, oldAccountFrom || -1] },
        users_user_id: userId,
      },
    });
    if (accountsCount === 0) {
      throw APIError.notFound(`Account could not be found.`);
    }

    // Delete trx references from transaction_has_tags
    await prismaTx.transaction_has_tags.deleteMany({
      where: {
        transactions_transaction_id: transactionId,
      }
    });

    // Delete transaction
    await prismaTx.transactions.delete({
      where: {
        transaction_id: transactionId,
      },
    });

    await UserService.setupLastUpdateTimestamp(
      userId,
      DateTimeUtils.getCurrentUnixTimestamp(),
      prismaTx
    );

    // Rollback the effect of oldAmount
    let newBalance;
    switch (oldType) {
      case MYFIN.TRX_TYPES.INCOME:
        newBalance = await AccountService.recalculateBalanceForAccountIncrementally(
          oldAccountTo,
          oldTimestamp - 1n,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.setNewAccountBalance(userId, oldAccountTo, newBalance, prismaTx);
        break;
      case MYFIN.TRX_TYPES.EXPENSE:
        newBalance = await AccountService.recalculateBalanceForAccountIncrementally(
          oldAccountFrom,
          oldTimestamp - 1n,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.setNewAccountBalance(userId, oldAccountFrom, newBalance, prismaTx);
        break;
      case MYFIN.TRX_TYPES.TRANSFER:
      default:
        newBalance = await AccountService.recalculateBalanceForAccountIncrementally(
          oldAccountTo,
          oldTimestamp - 1n,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.setNewAccountBalance(userId, oldAccountTo, newBalance, prismaTx);
        newBalance = await AccountService.recalculateBalanceForAccountIncrementally(
          oldAccountFrom,
          oldTimestamp - 1n,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.setNewAccountBalance(userId, oldAccountFrom, newBalance, prismaTx);
        break;
    }
  }, undefined);
};

export type UpdatedTrxType = {
  new_amount: number;
  new_type: string;
  new_description: string;
  new_entity_id: bigint;
  new_account_from_id: bigint;
  new_account_to_id: bigint;
  new_category_id: bigint;
  new_date_timestamp: number;
  new_is_essential: boolean;
  transaction_id: bigint;
  tags: Array<string>;
  /* SPLIT TRX */
  is_split: boolean;
  split_amount?: number;
  split_category?: bigint;
  split_entity?: bigint;
  split_type?: string;
  split_account_from?: bigint;
  split_account_to?: bigint;
  split_description?: string;
  split_is_essential?: boolean;
  split_tags: Array<string>;
};
const updateTransaction = async (
  userId: bigint,
  updatedTrx: UpdatedTrxType,
  dbClient = undefined
) => {
  const trx = {
    ...updatedTrx,
    ...{
      new_amount: ConvertUtils.convertFloatToBigInteger(updatedTrx.new_amount),
    },
  };
  /* trx.amount = ConvertUtils.convertFloatToBigInteger(trx.amount); */
  await performDatabaseRequest(async (prismaTx) => {
    const outdatedTrx = await prismaTx.transactions.findUniqueOrThrow({
      where: { transaction_id: trx.transaction_id },
    });

    const oldAmount = Number(outdatedTrx.amount);
    const oldType = outdatedTrx.type;
    const oldTimestamp = outdatedTrx.date_timestamp;
    const oldAccountTo = outdatedTrx.accounts_account_to_id;
    const oldAccountFrom = outdatedTrx.accounts_account_from_id;

    // Make sure account(s) belong to user
    if (trx.new_account_from_id) {
      await AccountService.doesAccountBelongToUser(userId, trx.new_account_from_id, prismaTx).catch(
        (err) => {
          throw APIError.notAuthorized();
        }
      );
    }

    if (trx.new_account_to_id) {
      await AccountService.doesAccountBelongToUser(userId, trx.new_account_to_id, prismaTx).catch(
        (err) => {
          throw APIError.notAuthorized();
        }
      );
    }

    if (trx.split_account_from) {
      await AccountService.doesAccountBelongToUser(userId, trx.split_account_from, prismaTx).catch(
        (err) => {
          throw APIError.notAuthorized();
        }
      );
    }
    if (trx.split_account_to) {
      await AccountService.doesAccountBelongToUser(userId, trx.split_account_to, prismaTx).catch(
        (err) => {
          throw APIError.notAuthorized();
        }
      );
    }

    Logger.addStringifiedLog(trx)

    await prismaTx.transactions.update({
      where: { transaction_id: trx.transaction_id },
      data: {
        date_timestamp: trx.new_date_timestamp,
        amount: trx.new_amount,
        type: trx.new_type,
        description: trx.new_description,
        entities_entity_id: trx.new_entity_id ?? null,
        accounts_account_from_id: trx.new_account_from_id ?? null,
        accounts_account_to_id: trx.new_account_to_id ?? null,
        categories_category_id: trx.new_category_id ?? null,
        is_essential: trx.new_is_essential,
      },
    });

    await UserService.setupLastUpdateTimestamp(
      userId,
      DateTimeUtils.getCurrentUnixTimestamp(),
      prismaTx
    );

    // Remove the effect of outdated amount
    let newBalance;
    switch (oldType) {
      case MYFIN.TRX_TYPES.INCOME:
        await AccountService.changeBalance(userId, oldAccountTo, -oldAmount, prismaTx);
        await AccountService.recalculateBalanceForAccountIncrementally(
          oldAccountTo,
          oldTimestamp - 1n,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        break;
      case MYFIN.TRX_TYPES.EXPENSE:
        await AccountService.changeBalance(userId, oldAccountFrom, -oldAmount, prismaTx);
        await AccountService.recalculateBalanceForAccountIncrementally(
          oldAccountFrom,
          oldTimestamp - 1n,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        break;
      case MYFIN.TRX_TYPES.TRANSFER:
      default:
        await AccountService.changeBalance(userId, oldAccountTo, -oldAmount, prismaTx);
        await AccountService.recalculateBalanceForAccountIncrementally(
          oldAccountTo,
          oldTimestamp - 1n,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.changeBalance(userId, oldAccountTo, -oldAmount, prismaTx);
        await AccountService.recalculateBalanceForAccountIncrementally(
          oldAccountTo,
          oldTimestamp - 1n,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        break;
    }

    // Add the effect of updated amount
    switch (trx.new_type) {
      case MYFIN.TRX_TYPES.INCOME:
        newBalance = await AccountService.recalculateBalanceForAccountIncrementally(
          trx.new_account_to_id,
          Math.min(trx.new_date_timestamp, Number(oldTimestamp)) - 1,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.setNewAccountBalance(
          userId,
          trx.new_account_to_id,
          newBalance,
          prismaTx
        );
        break;
      case MYFIN.TRX_TYPES.EXPENSE:
        newBalance = await AccountService.recalculateBalanceForAccountIncrementally(
          trx.new_account_from_id,
          Math.min(trx.new_date_timestamp, Number(oldTimestamp)) - 1,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.setNewAccountBalance(
          userId,
          trx.new_account_from_id,
          newBalance,
          prismaTx
        );
        break;
      case MYFIN.TRX_TYPES.TRANSFER:
      default:
        newBalance = await AccountService.recalculateBalanceForAccountIncrementally(
          trx.new_account_to_id,
          Math.min(trx.new_date_timestamp, Number(oldTimestamp)) - 1,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.setNewAccountBalance(
          userId,
          trx.new_account_to_id,
          newBalance,
          prismaTx
        );
        newBalance = await AccountService.recalculateBalanceForAccountIncrementally(
          trx.new_account_from_id,
          Math.min(trx.new_date_timestamp, Number(oldTimestamp)) - 1,
          DateTimeUtils.getCurrentUnixTimestamp() + 1,
          prismaTx
        );
        await AccountService.setNewAccountBalance(
          userId,
          trx.new_account_from_id,
          newBalance,
          prismaTx
        );
        break;
    }
  }, dbClient);

  // Remove all tags
  await TagService.deleteAllTagsFromTransaction(userId, updatedTrx.transaction_id, dbClient);

  // Add new tags
  if (Array.isArray(updatedTrx.tags)) {
    const promises = [];
    updatedTrx.tags?.forEach((tagName) => {
      promises.push(
        TagService.addTagToTransactionByName(
          userId,
          updatedTrx.transaction_id,
          tagName,
          true,
          dbClient
        )
      );
    });

    await Promise.all(promises);
  }

  // SPLIT HANDLING
  if (trx.is_split === true) {
    await createTransaction(userId, {
      date_timestamp: trx.new_date_timestamp,
      amount: trx.split_amount,
      type: trx.split_type,
      description: trx.split_description,
      entity_id: trx.split_entity,
      category_id: trx.split_category,
      account_from_id: trx.split_account_from,
      account_to_id: trx.split_account_to,
      is_essential: trx.split_is_essential,
      tags: trx.split_tags,
    });
  }
};

const getAllTransactionsForUserInCategoryAndInMonth = async (
  userId: bigint,
  month: number,
  year: number,
  catId: bigint,
  type: string,
  dbClient = prisma
) => {
  const nextMonth = month < 12 ? month + 1 : 1;
  const nextMonthsYear = month < 12 ? year : year + 1;
  const maxDate = new Date(nextMonthsYear, nextMonth - 1, 1);
  const minDate = new Date(year, month - 1, 1);
  Logger.addLog(`min date: ${DateTimeUtils.getUnixTimestampFromDate(minDate)}`);
  Logger.addLog(`max date: ${DateTimeUtils.getUnixTimestampFromDate(maxDate)}`);
  return dbClient.$queryRaw`SELECT transaction_id,
                                   transactions.date_timestamp,
                                   transactions.is_essential,
                                   (transactions.amount / 100) as amount,
                                   transactions.type,
                                   transactions.description,
                                   entities.entity_id,
                                   entities.name               as entity_name,
                                   categories_category_id,
                                   categories.name             as category_name,
                                   accounts_account_from_id,
                                   acc_to.name                 as account_to_name,
                                   accounts_account_to_id,
                                   acc_from.name               as account_from_name
                            FROM transactions
                                   LEFT JOIN accounts ON accounts.account_id = transactions.accounts_account_from_id
                                   LEFT JOIN categories
                                             ON categories.category_id = transactions.categories_category_id
                                   LEFT JOIN entities ON entities.entity_id = transactions.entities_entity_id
                                   LEFT JOIN accounts acc_to
                                             ON acc_to.account_id = transactions.accounts_account_to_id
                                   LEFT JOIN accounts acc_from
                                             ON acc_from.account_id = transactions.accounts_account_from_id
                            WHERE (acc_to.users_user_id = ${userId}
                              OR acc_from.users_user_id = ${userId})
                              AND categories.category_id = ${catId == -1n ? ' NULL ' : ` ${catId} `}
                              AND (transactions.type = ${type}
                              OR transactions.type = 'T')
                              AND transactions.date_timestamp >= ${DateTimeUtils.getUnixTimestampFromDate(
    minDate
  )}
                              AND transactions.date_timestamp <= ${DateTimeUtils.getUnixTimestampFromDate(
    maxDate
  )}
                            GROUP BY transaction_id
                            ORDER BY transactions.date_timestamp
                                DESC`;
};

const getCountOfUserTransactions = async (userId: bigint, dbClient = prisma) => {
  const rawData = await dbClient.$queryRaw`SELECT count(DISTINCT (transaction_id)) as 'count'
                                           FROM transactions
                                                  LEFT JOIN accounts ON transactions.accounts_account_from_id =
                                                                        accounts.account_id or
                                                                        transactions.accounts_account_to_id =
                                                                        accounts.account_id
                                           WHERE accounts.users_user_id = ${userId}`;
  return rawData[0].count;
};

interface RuleInstructions {
  matching_rule?: bigint;
  date?: number;
  description?: string;
  amount?: number;
  type?: string;
  selectedCategoryID?: bigint;
  selectedEntityID?: bigint;
  selectedAccountFromID?: bigint;
  selectedAccountToID?: bigint;
  isEssential?: boolean;
}

const autoCategorizeTransaction = async (
  userId: bigint,
  description: string,
  amount: number,
  type: string,
  accountsFromId?: bigint,
  accountsToId?: bigint,
  date?: number,
  dbClient = undefined
): Promise<RuleInstructions> =>
  performDatabaseRequest(async (prismaTx) => {
    if (!dbClient) dbClient = prismaTx;
    const matchedRule = await RuleService.getRuleForTransaction(
      userId,
      description,
      amount,
      type,
      accountsFromId,
      accountsToId,
      MYFIN.RULES.MATCHING.IGNORE,
      MYFIN.RULES.MATCHING.IGNORE,
      dbClient
    );
    Logger.addLog('Rule found:');
    Logger.addStringifiedLog(matchedRule);

    return {
      matching_rule: matchedRule?.rule_id,
      date: date,
      description: description,
      amount: amount,
      type: type,
      selectedCategoryID: matchedRule?.assign_category_id,
      selectedEntityID: matchedRule?.assign_entity_id,
      selectedAccountFromID: matchedRule?.assign_account_from_id ?? accountsFromId, //(type == MYFIN.TRX_TYPES.INCOME) ? matchedRule?.assign_account_from_id : accountsFromId,
      selectedAccountToID: matchedRule?.assign_account_to_id ?? accountsToId, //(type == MYFIN.TRX_TYPES.INCOME) ? accountsToId :  matchedRule?.assign_account_to_id,//matchedRule?.assign_account_to_id || accountsToId,
      isEssential: matchedRule?.assign_is_essential,
    };
  }, dbClient) as Promise<RuleInstructions>;

interface TransactionPreRuleInstructions {
  date?: number;
  description?: string;
  amount?: number;
  type?: string;
  accounts_account_from_id?: bigint;
  accounts_account_to_id?: bigint;
}

const autoCategorizeTransactionList = async (
  userId: bigint,
  accountId: bigint,
  trxList: Array<TransactionPreRuleInstructions>,
  dbClient = undefined
) => {
  const promises = [];
  for (const trx of trxList) {
    promises.push(
      autoCategorizeTransaction(
        userId,
        trx.description,
        trx.amount,
        trx.type,
        trx.type == MYFIN.TRX_TYPES.INCOME ? null : accountId,
        trx.type != MYFIN.TRX_TYPES.INCOME ? null : accountId,
        trx.date,
        dbClient
      )
    );
  }

  return Promise.all(promises);
};

const getYearOfFirstTransactionForUser = async (
  userId: bigint,
  dbClient = prisma
): Promise<number> => {
  const result = await dbClient.$queryRaw`SELECT YEAR(FROM_UNIXTIME(date_timestamp)) as 'year'
                                          FROM transactions
                                                 LEFT JOIN accounts account_from
                                                            ON account_from.account_id = transactions.accounts_account_from_id
                                                 LEFT JOIN accounts account_to
                                                            ON account_to.account_id = transactions.accounts_account_to_id
                                          WHERE account_from.users_user_id = ${userId}
                                             OR account_to.users_user_id = ${userId}
                                          ORDER BY date_timestamp ASC
                                          LIMIT 1`;

  return result[0].year;
};

const getDateTimestampOfFirstTransactionForUser = async (
  userId: bigint,
  dbClient = prisma
): Promise<number> => {
  const result = await dbClient.$queryRaw`SELECT date_timestamp
                                          FROM transactions
                                                 LEFT JOIN accounts account_from
                                                            ON account_from.account_id = transactions.accounts_account_from_id
                                                 LEFT JOIN accounts account_to
                                                            ON account_to.account_id = transactions.accounts_account_to_id
                                          WHERE account_from.users_user_id = ${userId}
                                             OR account_to.users_user_id = ${userId}
                                          ORDER BY date_timestamp ASC
                                          LIMIT 1`;
  return result[0]?.date_timestamp ?? 0;
};

const deleteAllTransactionsFromUser = async (userId: bigint, dbClient = prisma) => {
  return dbClient.$queryRaw`DELETE transactions FROM transactions 
LEFT JOIN accounts acc_to ON acc_to.account_id = transactions.accounts_account_to_id 
LEFT JOIN accounts acc_from ON acc_from.account_id = transactions.accounts_account_from_id
WHERE acc_to.users_user_id = ${userId} OR acc_from.users_user_id = ${userId} `;
};

export default {
  getTransactionsForUser,
  getFilteredTransactionsByForUser,
  createTransactionStep0,
  createTransaction,
  deleteTransaction,
  updateTransaction,
  getAllTransactionsForUserInCategoryAndInMonth,
  getCountOfUserTransactions,
  autoCategorizeTransaction,
  autoCategorizeTransactionList,
  createTransactionsInBulk,
  getYearOfFirstTransactionForUser,
  getDateTimestampOfFirstTransactionForUser,
  deleteAllTransactionsFromUser,
  doesTransactionBelongToUser,
};
