import { performDatabaseRequest, prisma } from '../config/prisma.js';
import TransactionService from './transactionService.js';
import APIError from '../errorHandling/apiError.js';
import Logger from '../utils/Logger.js';

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
};
