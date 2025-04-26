import { prisma } from "../config/prisma.js";
import { Prisma } from "@prisma/client";
import { version } from "../../package.json";


export interface BackupData {
  apiVersion: string;
  accounts?: Prisma.accountsGetPayload<{}>[];
  balances_snapshot?: Prisma.balances_snapshotGetPayload<{}>[];
  budgets?: Prisma.budgetsGetPayload<{}>[];
  budgets_has_categories?: Prisma.budgets_has_categoriesGetPayload<{}>[];
  categories?: Prisma.categoriesGetPayload<{}>[];
  entities?: Prisma.entitiesGetPayload<{}>[];
  invest_asset_evo_snapshot?: Prisma.invest_asset_evo_snapshotGetPayload<{}>[];
  invest_assets?: Prisma.invest_assetsGetPayload<{}>[];
  invest_desired_allocations?: Prisma.invest_desired_allocationsGetPayload<{}>[];
  invest_transactions?: Prisma.invest_transactionsGetPayload<{}>[];
  rules?: Prisma.rulesGetPayload<{}>[];
  transactions?: Prisma.transactionsGetPayload<{}>[];
}

class BackupManager {
  static async createBackup(userId: bigint, dbClient = prisma): Promise<BackupData> {

    const [
      accounts,
      balancesSnapshot,
      budgets,
      budgetsHasCategories,
      categories,
      entities,
      investAssetEvoSnapshot,
      investAssets,
      investDesiredAllocations,
      investTransactions,
      rules,
      transactions,
    ] = await Promise.all([
      // Accounts
      dbClient.accounts.findMany({
        where: { users_user_id: userId },
      }),

      // Balances snapshots
      dbClient.balances_snapshot.findMany({
        where: {
          accounts: { users_user_id: userId },
        },
      }),

      // Budgets
      dbClient.budgets.findMany({
        where: { users_user_id: userId },
      }),

      // Budget has categories
      dbClient.budgets_has_categories.findMany({
        where: { budgets_users_user_id: userId },
      }),

      // Categories
      dbClient.categories.findMany({
        where: { users_user_id: userId },
      }),

      // Entities
      dbClient.entities.findMany({
        where: { users_user_id: userId },
      }),

      // Investment snapshots
      dbClient.invest_asset_evo_snapshot.findMany({
        where: {
          invest_assets: { users_user_id: userId },
        },
      }),

      // Invest assets
      dbClient.invest_assets.findMany({
        where: { users_user_id: userId },
      }),

      // Desired allocations
      dbClient.invest_desired_allocations.findMany({
        where: { users_user_id: userId },
      }),

      // Investment transactions
      dbClient.invest_transactions.findMany({
        where: {
          invest_assets: { users_user_id: userId },
        },
      }),

      // Rules
      dbClient.rules.findMany({
        where: { users_user_id: userId },
      }),

      // Transactions
      dbClient.transactions.findMany({
        where: {
          OR: [
            { accounts_transactions_accounts_account_from_idToaccounts: { users_user_id: userId } },
            { accounts_transactions_accounts_account_to_idToaccounts:   { users_user_id: userId } },
          ],
        },
      }),
    ]);

    return {
      apiVersion: version,
      accounts,
      balances_snapshot: balancesSnapshot,
      budgets,
      budgets_has_categories: budgetsHasCategories,
      categories,
      entities,
      invest_asset_evo_snapshot: investAssetEvoSnapshot,
      invest_assets: investAssets,
      invest_desired_allocations: investDesiredAllocations,
      invest_transactions: investTransactions,
      rules,
      transactions,
    };
  }
}

export default BackupManager;