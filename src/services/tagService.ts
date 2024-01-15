import { performDatabaseRequest, prisma } from '../config/prisma.js';
import TransactionService from './transactionService.js';
import APIError from '../errorHandling/apiError.js';
import Logger from '../utils/Logger.js';
import { CalculatedEntityAmounts } from "./entityService.js";
import DateTimeUtils from "../utils/DateTimeUtils.js";

export interface Tag {
  tag_id?: bigint;
  name?: string;
  description?: string;
  users_user_id?: bigint;
}

/**
 * Fetches all tags associated with ***userId***.
 * @param userId - user id
 * @param selectAttributes - tag attributes to be returned. *Undefined* will return them all.
 * @param dbClient - the db client
 */
const getAllTagsForUser = async (
  userId: bigint,
  selectAttributes = undefined,
  dbClient = prisma
): Promise<Array<Tag>> =>
  dbClient.tags.findMany({
    where: { users_user_id: userId },
    select: selectAttributes,
  });

/**
 * Fetches all tags associated with ***userId*** w/ pagination.
 * @param userId - user id
 * @param page - page number
 * @param pageSize - page size
 * @param searchQuery - search query
 * @param dbClient - the db client
 */
const getFilteredTagsForUserByPage = async (
  userId: bigint,
  page: number,
  pageSize: number,
  searchQuery: string,
  dbClient = prisma
) => {
  const query = `%${searchQuery}%`;
  const offsetValue = page * pageSize;

  // main query for list of results (limited by pageSize and offsetValue)
  const mainQuery = dbClient.$queryRaw`SELECT tag_id, name, description
                                        FROM tags
                                        WHERE tags.users_user_id = ${userId}
                                        AND (tags.description LIKE ${query} OR tags.name LIKE ${query})
                                        ORDER BY tags.name ASC
                                        LIMIT ${pageSize} OFFSET ${offsetValue}`;

  // count of total of filtered results
  const countQuery = dbClient.$queryRaw`SELECT count(*) as 'count'
                                        FROM tags
                                        WHERE tags.users_user_id = ${userId}
                                        AND (tags.description LIKE ${query} OR tags.name LIKE ${query})`;

  const totalCountQuery = dbClient.$queryRaw`SELECT count(*) as 'count'
                                        FROM tags
                                        WHERE tags.users_user_id = ${userId}`;

  const [mainQueryResult, countQueryResult, totalCountQueryResult] = await prisma.$transaction([
    mainQuery,
    countQuery,
    totalCountQuery,
  ]);

  return {
    results: mainQueryResult,
    filtered_count: countQueryResult[0].count,
    total_count: totalCountQueryResult[0].count,
  };
};

const createTag = async (tag: Tag, dbClient = prisma) =>
  dbClient.tags.create({
    data: {
      name: tag.name,
      description: tag.description,
      users_user_id: tag.users_user_id,
    },
  });

const deleteTag = async (userId: bigint, tagId: bigint, dbClient = prisma) => {
  return performDatabaseRequest(async (prismaTx) => {
    await prismaTx.transaction_has_tags.deleteMany({
      where: {
        tags_tag_id: tagId,
      },
    });

    return prismaTx.tags.delete({
      where: {
        users_user_id: userId,
        tag_id: tagId,
      },
    });
  });
};

const updateTag = async (userId: bigint, tagId: bigint, updatedTag: Tag, dbClient = prisma) =>
  dbClient.tags.update({
    where: {
      users_user_id: userId,
      tag_id: tagId,
    },
    data: {
      name: updatedTag.name,
      description: updatedTag.description,
    },
  });

const getCountOfUserTags = async (userId, dbClient = prisma) =>
  dbClient.tags.count({
    where: { users_user_id: userId },
  });

const deleteAllTagsFromTransaction = async (userId, transactionId, dbClient = prisma) => {
  const transactionBelongsToUser = await TransactionService.doesTransactionBelongToUser(
    userId,
    transactionId,
    dbClient
  );

  if (!transactionBelongsToUser) {
    throw APIError.notAuthorized();
  }

  return dbClient.transaction_has_tags.deleteMany({
    where: {
      transactions_transaction_id: transactionId,
    },
  });
};

const addTagToTransaction = async (
  userId: bigint,
  transactionId: bigint,
  tagId: bigint,
  dbClient = prisma
) => {
  return performDatabaseRequest(async (prismaTx) => {
    return prismaTx.transaction_has_tags.create({
      data: {
        transactions_transaction_id: transactionId,
        tags_tag_id: tagId,
      },
    });
  }, dbClient);
};

/**
 * Associates the specified tag with the transaction.
 * @param userId
 * @param transactionId
 * @param tagName - the name that identifies the desired tag
 * @param createIfNeeded - should the tag be created if it doesn't already exist?
 * @param dbClient
 */
const addTagToTransactionByName = async (
  userId: bigint,
  transactionId: bigint,
  tagName: string,
  createIfNeeded: boolean,
  dbClient = undefined
) => {
  return performDatabaseRequest(async (prismaTx) => {
    // Check if tag already exists (and add if createIfNeeded=true & it does not exist)
    let tag = null;
    if (createIfNeeded) {
      tag = await prismaTx.tags.upsert({
        where: {
          name_users_user_id: {
            users_user_id: userId,
            name: tagName,
          },
        },
        update: {},
        create: {
          name: tagName,
          description: '',
          users_user_id: userId,
        },
      });
    } else {
      tag = await prismaTx.tags.findFirst({
        where: {
          users_user_id: userId,
          name: tagName,
        },
      });
    }

    if (tag == null) {
      throw APIError.notFound('The specified tag could not be found!');
    }

    // Associate it with the specified transaction
    return addTagToTransaction(userId, transactionId, tag.tag_id, prismaTx);
  }, dbClient);
};

const buildSqlForExcludedAccountsList = (excludedAccs) => {
  if (!excludedAccs || excludedAccs.length === 0) {
    return ' 1 == 1';
  }
  let sql = ' (';
  for (let cnt = 0; cnt < excludedAccs.length; cnt++) {
    const acc = excludedAccs[cnt].account_id;
    sql += ` '${acc}' `;

    if (cnt !== excludedAccs.length - 1) {
      sql += ', ';
    }
  }
  sql += ') ';
  return sql;
};

export interface CalculatedTagAmounts {
  tag_balance_credit: number;
  tag_balance_debit: number;
}

const getAmountForTagInPeriod = async(
  tagId: bigint,
  fromDate: number,
  toDate: number,
  includeTransfers = true,
  dbClient = prisma
) : Promise<CalculatedTagAmounts> => {
  let accsExclusionSqlExcerptAccountsTo = '';
  let accsExclusionSqlExcerptAccountsFrom = '';
  let accountsToExcludeListInSQL = '';

  const listOfAccountsToExclude = await dbClient.accounts.findMany({
    where: {exclude_from_budgets: true},
  });
  if (!listOfAccountsToExclude || listOfAccountsToExclude.length < 1) {
    accsExclusionSqlExcerptAccountsTo = ' 1 = 1 ';
    accsExclusionSqlExcerptAccountsFrom = ' 1 = 1 ';
  } else {
    accountsToExcludeListInSQL = buildSqlForExcludedAccountsList(listOfAccountsToExclude);
    accsExclusionSqlExcerptAccountsTo = `accounts_account_to_id NOT IN ${accountsToExcludeListInSQL} `;
    accsExclusionSqlExcerptAccountsFrom = `accounts_account_from_id NOT IN ${accountsToExcludeListInSQL} `;
  }

  if (includeTransfers) {
    return dbClient.$queryRaw`SELECT sum(if(type = 'I' OR
                                                (type = 'T' AND ${accsExclusionSqlExcerptAccountsTo}),
                                                amount,
                                                0)) as 'tag_balance_credit',
                                         sum(if(type = 'E' OR
                                                (type = 'T' AND ${accsExclusionSqlExcerptAccountsFrom}),
                                                amount,
                                                0)) as 'tag_balance_debit'
                                  FROM (SELECT amount, type, accounts_account_from_id, accounts_account_to_id
                                        FROM transactions
                                                 INNER JOIN transaction_has_tags
                                                            ON transactions.transaction_id = transaction_has_tags.transactions_transaction_id
                                        WHERE transaction_has_tags.tags_tag_id = ${tagId}
                                          AND date_timestamp between ${fromDate} AND ${toDate}) as transactions_tags`;
  }

  return dbClient.$queryRaw`SELECT sum(if(type = 'I', amount, 0)) as 'tag_balance_credit',
                                         sum(if(type = 'E', amount, 0)) as 'tag_balance_debit'
                                  FROM (SELECT amount, type, accounts_account_from_id, accounts_account_to_id
                                        FROM transactions
                                                 INNER JOIN transaction_has_tags
                                                            ON transactions.transaction_id = transaction_has_tags.transactions_transaction_id
                                        WHERE transaction_has_tags.tags_tag_id = ${tagId}
                                          AND date_timestamp between ${fromDate} AND ${toDate}) as transactions_tags`;
}

const getAmountForTagInMonth = async (
  tagId: bigint,
  month: number,
  year: number,
  includeTransfers = true,
  dbClient = prisma
) : Promise<CalculatedEntityAmounts> => {
  const nextMonth = month < 12 ? month + 1 : 1;
  const nextMonthsYear = month < 12 ? year : year + 1;
  const maxDate = DateTimeUtils.getUnixTimestampFromDate(
    new Date(nextMonthsYear, nextMonth - 1, 1)
  );
  const minDate = DateTimeUtils.getUnixTimestampFromDate(new Date(year, month - 1, 1));
  /* Logger.addLog(`cat id: ${categoryId} | month: ${month} | year: ${year} | minDate: ${minDate} | maxDate: ${maxDate}`); */
  const amounts = await getAmountForTagInPeriod(
    tagId,
    minDate,
    maxDate,
    includeTransfers,
    dbClient
  );
  return amounts[0];
}

const getAmountForTagInYear = async (
  tagId: bigint,
  year: number,
  includeTransfers = true,
  dbClient = prisma
): Promise<CalculatedEntityAmounts> => {
  const maxDate = DateTimeUtils.getUnixTimestampFromDate(new Date(year, 11, 31));
  const minDate = DateTimeUtils.getUnixTimestampFromDate(new Date(year, 0, 1));

  /* Logger.addLog(`cat id: ${categoryId} | month: ${month} | year: ${year} | minDate: ${minDate} | maxDate: ${maxDate}`); */
  const amounts = await getAmountForTagInPeriod(
    tagId,
    minDate,
    maxDate,
    includeTransfers,
    dbClient
  );
  return amounts[0];
};

export default {
  getAllTagsForUser,
  getFilteredTagsForUserByPage,
  createTag,
  deleteTag,
  updateTag,
  getCountOfUserTags,
  deleteAllTagsFromTransaction,
  addTagToTransaction,
  addTagToTransactionByName,
  getAmountForTagInMonth,
  getAmountForTagInYear,
};
