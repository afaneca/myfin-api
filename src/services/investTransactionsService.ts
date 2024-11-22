import {performDatabaseRequest, prisma} from '../config/prisma.js';
import APIError from '../errorHandling/apiError.js';
import InvestAssetService from './investAssetService.js';
import DateTimeUtils from '../utils/DateTimeUtils.js';
import ConvertUtils from '../utils/convertUtils.js';
import {invest_transactions_type} from '@prisma/client';
import Logger from '../utils/Logger.js';
import {date} from "joi";

const getAllTransactionsForUser = async (userId: bigint, dbClient = prisma) =>
    dbClient.$queryRaw`SELECT transaction_id, date_timestamp, invest_transactions.type as 'trx_type', invest_assets.type as 'asset_type', note, (total_price/100) as 'total_price', invest_transactions.units, invest_assets_asset_id, name, ticker, broker, invest_assets.asset_id, (fees_taxes / 100) as 'fees_taxes' 
  FROM invest_transactions INNER JOIN invest_assets ON invest_assets.asset_id = invest_assets_asset_id
  WHERE users_user_id = ${userId} ORDER BY date_timestamp DESC;`;

const getFilteredTrxByPage = async (userId: bigint, page: number, pageSize: number, searchQuery: string) => {
    const query = `%${searchQuery}%`;
    const offsetValue = page * pageSize;

    // main query for list of results (limited by pageSize and offsetValue)
    const mainQuery = prisma.$queryRaw`SELECT transaction_id, date_timestamp, invest_transactions.type as 'trx_type', 
                                        invest_assets.type as 'asset_type', note, (total_price/100) as 'total_price', invest_transactions.units, 
                                        invest_assets_asset_id, name, ticker, broker, invest_assets.asset_id, (fees_taxes / 100) as 'fees_taxes' 
                                     FROM invest_transactions
                                            INNER JOIN invest_assets ON invest_assets.asset_id = invest_assets_asset_id
                                     WHERE users_user_id = ${userId}
                                       AND (note LIKE
                                            ${query} OR
                                            invest_assets.type LIKE ${query}
                                       OR invest_transactions.type LIKE ${query}
                                       OR total_price LIKE ${query}
                                       OR (total_price/100) LIKE ${query}
                                       OR name LIKE ${query}
                                       OR ticker LIKE ${query}
                                       OR broker LIKE ${query}
                                       OR fees_taxes LIKE ${query}
                                       OR (fees_taxes / 100) LIKE ${query})
                                     GROUP BY transaction_id
                                     ORDER BY date_timestamp
                                         DESC
                                     LIMIT ${pageSize} OFFSET ${offsetValue}`;

    // count of total of filtered results
    const countQuery = prisma.$queryRaw`SELECT count(*) as 'count'
                                      FROM (SELECT transaction_id, date_timestamp, invest_transactions.type as 'trx_type', 
                                        invest_assets.type as 'asset_type', note, (total_price/100) as 'total_price', invest_transactions.units, 
                                        invest_assets_asset_id, name, ticker, broker, invest_assets.asset_id, (fees_taxes / 100) as 'fees_taxes' 
                                     FROM invest_transactions
                                            INNER JOIN invest_assets ON invest_assets.asset_id = invest_assets_asset_id
                                     WHERE users_user_id = ${userId}
                                       AND (note LIKE
                                            ${query} OR
                                            invest_assets.type LIKE ${query}
                                       OR invest_transactions.type LIKE ${query}
                                       OR total_price LIKE ${query}
                                       OR (total_price/100) LIKE ${query}
                                       OR name LIKE ${query}
                                       OR ticker LIKE ${query}
                                       OR broker LIKE ${query}
                                       OR fees_taxes LIKE ${query}
                                       OR (fees_taxes / 100) LIKE ${query})
                                     GROUP BY transaction_id) trx`;

    const totalCountQuery = prisma.$queryRaw`SELECT count(*) as 'count'
                                           FROM (SELECT transaction_id, date_timestamp, invest_transactions.type as 'trx_type', 
                                        invest_assets.type as 'asset_type', note, (total_price/100) as 'total_price', invest_transactions.units, 
                                        invest_assets_asset_id, name, ticker, broker, invest_assets.asset_id, (fees_taxes / 100) as 'fees_taxes' 
                                     FROM invest_transactions
                                            INNER JOIN invest_assets ON invest_assets.asset_id = invest_assets_asset_id
                                     WHERE users_user_id = ${userId}
                                     GROUP BY transaction_id) trx`;

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

const getTransactionForUser = async (userId: bigint, trxId: bigint, dbClient = prisma) =>
    performDatabaseRequest(async (prismaTx) => {
        const result = await prismaTx.$queryRaw`SELECT * FROM invest_transactions 
INNER JOIN invest_assets ON invest_assets_asset_id = invest_assets.asset_id
WHERE  transaction_id = ${trxId} AND users_user_id = ${userId}`;

        if (!result || !Array.isArray(result) || (result as Array<any>).length < 1) return null;
        return result[0];
    }, dbClient);

const updateTransaction = async (
    userId: bigint,
    trxId: bigint,
    assetId: bigint,
    dateTimestamp: bigint,
    note: string,
    totalPrice: number,
    units: number,
    fees: number,
    type: invest_transactions_type,
    dbClient = undefined
) => {
    await performDatabaseRequest(async (prismaTx) => {
        if (
            !(await InvestAssetService.doesAssetBelongToUser(userId, assetId, prismaTx)) ||
            !(await getTransactionForUser(userId, trxId, prismaTx))
        ) {
            throw APIError.notAuthorized();
        }

        await prismaTx.invest_transactions.update({
            where: {transaction_id: trxId},
            data: {
                date_timestamp: dateTimestamp,
                units,
                fees_taxes: ConvertUtils.convertFloatToBigInteger(fees),
                total_price: ConvertUtils.convertFloatToBigInteger(totalPrice),
                note,
                type,
                invest_assets_asset_id: assetId,
                updated_at: DateTimeUtils.getCurrentUnixTimestamp(),
            },
        });
    }, dbClient);

    // Recalculate snapshot
    const latestSnapshot = await InvestAssetService.recalculateSnapshotForAssetsIncrementally(
        assetId,
        Number(dateTimestamp) - 1,
        DateTimeUtils.getCurrentUnixTimestamp() + 1,
        prisma
    );

    await prisma.invest_assets.update({
        where: {
            asset_id: assetId,
        },
        data: {
            units: latestSnapshot.units,
        },
    });
};

const createTransaction = async (
    userId: bigint,
    assetId: bigint,
    dateTimestamp: bigint,
    note: string,
    totalPrice: number,
    units: number,
    fees: number,
    type: invest_transactions_type,
    isSplit: boolean,
    splitData?: { totalPrice?: number, units?: number, type?: invest_transactions_type, note?: string },
    dbClient = undefined
) => performDatabaseRequest(async (prismaTx) => {
    if (!(await InvestAssetService.doesAssetBelongToUser(userId, assetId, prismaTx))) {
        throw APIError.notAuthorized();
    }

    await prismaTx.invest_transactions.create({
        data: {
            date_timestamp: dateTimestamp,
            units,
            fees_taxes: ConvertUtils.convertFloatToBigInteger(fees),
            total_price: ConvertUtils.convertFloatToBigInteger(totalPrice),
            note,
            type,
            invest_assets_asset_id: assetId,
            created_at: DateTimeUtils.getCurrentUnixTimestamp(),
            updated_at: DateTimeUtils.getCurrentUnixTimestamp(),
        },
    });

    // Recalculate snapshot - create separate transaction, since it depends on the execution of the previous operations
    const latestSnapshot = await InvestAssetService.recalculateSnapshotForAssetsIncrementally(
      assetId,
      Number(dateTimestamp) - 1,
      DateTimeUtils.getCurrentUnixTimestamp() + 1,
      prismaTx
    );
    //Logger.addLog(`Latest snapshot: ${JSON.stringify(latestSnapshot)}`);
    await prismaTx.invest_assets.update({
        where: {
            asset_id: assetId,
        },
        data: {
            units: latestSnapshot.units,
        },
    });

    // SPLIT HANDLING
    if (isSplit) {
        await createTransaction(userId, assetId, dateTimestamp, splitData.note, splitData.totalPrice, splitData.units, 0, splitData.type, false, null, prismaTx);
    }
}, dbClient);


const deleteTransaction = async (userId: bigint, trxId: bigint, dbClient = undefined) => {
    const transaction = await performDatabaseRequest(async (prismaTx) => {
        const trx = await getTransactionForUser(userId, trxId, prismaTx);
        if (!trx) {
            throw APIError.notAuthorized();
        }

        await prismaTx.invest_transactions.delete({
            where: {
                transaction_id: trxId,
            },
        });

        return trx;
    }, dbClient);

    // Recalculate snapshot
    const latestSnapshot = await InvestAssetService.recalculateSnapshotForAssetsIncrementally(
        transaction.invest_assets_asset_id,
        Number(transaction.date_timestamp) - 1,
        DateTimeUtils.getCurrentUnixTimestamp() + 1,
        prisma
    );
    //Logger.addLog(`Latest snapshot: ${JSON.stringify(latestSnapshot)}`);
    await prisma.invest_assets.update({
        where: {
            asset_id: transaction.invest_assets_asset_id,
        },
        data: {
            units: latestSnapshot.units,
        },
    });
};

const deleteAllTransactionsForUser = async (userId: bigint, dbClient = prisma) => {
    return dbClient.$queryRaw`DELETE invest_transactions FROM invest_transactions 
LEFT JOIN invest_assets ON invest_assets.asset_id = invest_transactions.invest_assets_asset_id
WHERE users_user_id = ${userId}`;
};

export default {
    getAllTransactionsForUser,
    getFilteredTrxByPage,
    updateTransaction,
    createTransaction,
    deleteTransaction,
    deleteAllTransactionsForUser,
};
