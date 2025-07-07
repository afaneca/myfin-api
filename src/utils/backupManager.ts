import { prisma } from "../config/prisma.js";
import { Prisma } from "@prisma/client";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { version } = require("../../package.json");
import { isSameMajorVersion } from "./textUtils.js";
import APIError from "../errorHandling/apiError.js";
import { RestoreUserErrorCodes } from "../controllers/userController.js";
import UserService from "../services/userService.js";
import AccountService from "../services/accountService.js";
import CategoryService from "../services/categoryService.js";
import EntityService from "../services/entityService.js";
import TagService from "../services/tagService.js";
import RuleService from "../services/ruleService.js";
import BudgetService from "../services/budgetService.js";
import Logger from "./Logger.js";
import { MYFIN } from "../consts.js";


export interface BackupData {
  apiVersion: string;
  accounts?: Prisma.accountsGetPayload<{}>[];
  balances_snapshot?: Prisma.balances_snapshotGetPayload<{}>[];
  budgets?: Prisma.budgetsGetPayload<{}>[];
  budgets_has_categories?: Prisma.budgets_has_categoriesGetPayload<{}>[];
  categories?: Prisma.categoriesGetPayload<{}>[];
  entities?: Prisma.entitiesGetPayload<{}>[];
  tags?: Prisma.tagsGetPayload<{}>[];
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
      tags,
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

      // Tags
      dbClient.tags.findMany({
        where: { users_user_id: userId, },
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
            { accounts_transactions_accounts_account_to_idToaccounts: { users_user_id: userId } },
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
      tags,
      invest_asset_evo_snapshot: investAssetEvoSnapshot,
      invest_assets: investAssets,
      invest_desired_allocations: investDesiredAllocations,
      invest_transactions: investTransactions,
      rules,
      transactions,
    };
  }

  static async restoreBackup(userId: bigint, data: BackupData, dbClient = prisma) {
    if (!isSameMajorVersion(data.apiVersion, version)) {
      throw APIError.notAcceptable("This backups is not compatible with your API version.", RestoreUserErrorCodes.IncompatibleVersions);
    }

    // We need to map the previous ids to the newly generated ones to maintain the already existing associations between entities
    const accountIdMap: Map<bigint, bigint> = new Map(); // <old id, new id>
    const categoryIdMap: Map<bigint, bigint> = new Map(); // <old id, new id>
    const entityIdMap: Map<bigint, bigint> = new Map(); // <old id, new id>
    const tagIdMap: Map<bigint, bigint> = new Map(); // <old id, new id>
    const assetIdMap: Map<bigint, bigint> = new Map(); // <old id, new id>
    const budgetIdMap: Map<bigint, bigint> = new Map(); // <old id, new id>

    // Delete all previous records
    Logger.addLog(`BackupManager > Restore | Deleting all user data...`);
    await UserService.deleteAllUserData(userId, dbClient);
    Logger.addLog(`BackupManager > Restore | Data successfully deleted!`);

    // region Accounts
    const accountPromises = data.accounts.map(async (account) => {
      if (!Object.values(MYFIN.ACCOUNT_TYPES).includes(account.type)) {
        throw APIError.notAcceptable(`Account type not recognized for account #${account.account_id}`, RestoreUserErrorCodes.MalformedBackup);
      }

      if (!Object.values(MYFIN.ACCOUNT_STATUS).includes(account.status)) {
        throw APIError.notAcceptable(`Account status not recognized for account #${account.account_id}`, RestoreUserErrorCodes.MalformedBackup);
      }

      if (typeof account.exclude_from_budgets !== "boolean") {
        throw APIError.notAcceptable(`Account exclude_from_budgets flag not recognized for account #${account.account_id}`, RestoreUserErrorCodes.MalformedBackup);
      }

      const newAccount = await dbClient.accounts.create({
        data: {
          name: account.name,
          type: account.type,
          description: account.description,
          exclude_from_budgets: account.exclude_from_budgets,
          status: account.status,
          users_user_id: userId,
          current_balance: account.current_balance,
          created_timestamp: account.created_timestamp,
          updated_timestamp: account.updated_timestamp,
          color_gradient: account.color_gradient,
        }
      });

      // Map old ID to new ID
      accountIdMap.set(account.account_id, newAccount.account_id);
      return newAccount;
    });
    // endregion
    // region Categories
    const categoryPromises = data.categories.map(async (category) => {
      if (!Object.values([0, 1]).includes(category.exclude_from_budgets)) {
        throw APIError.notAcceptable(`Category exclude_from_budgets flag not recognized for category #${category.category_id}`, RestoreUserErrorCodes.MalformedBackup);
      }

      if (!Object.values(MYFIN.CATEGORY_STATUS).includes(category.status)) {
        throw APIError.notAcceptable(`Category status not recognized for category #${category.category_id}`, RestoreUserErrorCodes.MalformedBackup);
      }

      const newCategory = await CategoryService.createCategory(
        {
          type: category.type,
          users_user_id: userId,
          name: category.name,
          description: category.description,
          color_gradient: category.color_gradient,
          status: category.status,
          exclude_from_budgets: category.exclude_from_budgets,
        },
        dbClient,
      );
      // Map old ID to new ID
      categoryIdMap.set(category.category_id, newCategory.category_id);
      return newCategory;
    });
    // endregion
    // region Entities
    const entityPromises = data.entities.map(async (entity) => {
      const newEntity = await EntityService.createEntity(
        {
          users_user_id: userId,
          name: entity.name,
        },
        dbClient,
      );

      // Map old ID to new ID
      entityIdMap.set(entity.entity_id, newEntity.entity_id);
      return newEntity;
    });
    // endregion
    // region Tags
    const tagPromises = data.tags.map(async (tag) => {
      const newTag = await TagService.createTag(
        {
          users_user_id: userId,
          name: tag.name,
          description: tag.description,
        },
        dbClient,
      );

      // Map old ID to new ID
      tagIdMap.set(tag.tag_id, newTag.tag_id);
      return newTag;
    });
    // endregion
    // region Rules
    const rulePromises = data.rules.map(async (rule) => {
      if (
        !Object.values(MYFIN.RULES.OPERATOR).includes(rule.matcher_account_from_id_operator)
        || !Object.values(MYFIN.RULES.OPERATOR).includes(rule.matcher_account_to_id_operator)
        || !Object.values(MYFIN.RULES.OPERATOR).includes(rule.matcher_amount_operator)
        || !Object.values(MYFIN.RULES.OPERATOR).includes(rule.matcher_type_operator)
        || !Object.values(MYFIN.RULES.OPERATOR).includes(rule.matcher_description_operator)
      ) {
        throw APIError.notAcceptable(`Rule operator not recognized for rule #${rule.rule_id}`, RestoreUserErrorCodes.MalformedBackup);
      }

      if (typeof rule.assign_is_essential !== 'boolean') {
        throw APIError.notAcceptable(`Rule assign_is_essential flag not recognized for rule #${rule.rule_id}`, RestoreUserErrorCodes.MalformedBackup);
      }


      // check if all values are valid
      const newRule = await RuleService.createRule(
        userId, {
          users_user_id: userId,
          matcher_description_operator: rule.matcher_description_operator,
          matcher_description_value: rule.matcher_description_value,
          matcher_amount_operator: rule.matcher_amount_operator,
          matcher_amount_value: rule.matcher_amount_value,
          matcher_type_operator: rule.matcher_type_operator,
          matcher_type_value: rule.matcher_type_value,
          matcher_account_to_id_operator: rule.matcher_account_to_id_operator,
          matcher_account_to_id_value: rule.matcher_account_to_id_value,
          matcher_account_from_id_operator: rule.matcher_account_from_id_operator,
          matcher_account_from_id_value: rule.matcher_account_from_id_value,
          assign_category_id: rule.assign_category_id,
          assign_entity_id: rule.assign_entity_id,
          assign_account_to_id: rule.assign_account_to_id,
          assign_account_from_id: rule.assign_account_from_id,
          assign_type: rule.assign_type,
          assign_is_essential: rule.assign_is_essential,
        },
        dbClient,
      );
      return newRule;
    });
    // endregion
    // region Invest Assets
    const assetPromises = data.invest_assets.map(async (asset) => {
      if (!Object.values(MYFIN.INVEST.ASSET_TYPE).includes(asset.type)) {
        throw APIError.notAcceptable(`Asset type not recognized for asset #${asset.asset_id}`, RestoreUserErrorCodes.MalformedBackup);
      }

      const newAsset = await dbClient.invest_assets.create({
        data: {
          name: asset.name,
          ticker: asset.ticker,
          units: asset.units,
          type: asset.type,
          broker: asset.broker,
          created_at: asset.created_at,
          updated_at: asset.updated_at,
          users_user_id: userId,
        }
      });

      // Map old ID to new ID
      assetIdMap.set(asset.asset_id, newAsset.asset_id);
      return newAsset;
    });
    // endregion
    // region Budgets
    const budgetPromises = data.budgets.map(async (budget) => {
      const newBudget = await dbClient.budgets.create({
        data: {
          month: budget.month,
          year: budget.year,
          observations: budget.observations,
          is_open: budget.is_open,
          users_user_id: userId,
        },
      });

      // Map old ID to new ID
      budgetIdMap.set(budget.budget_id, newBudget.budget_id);
      return newBudget;
    });
    // endregion
    Logger.addLog(`BackupManager > Restore | Importing core entities...`);
    await Promise.all([
      ...accountPromises,
      ...categoryPromises,
      ...entityPromises,
      ...tagPromises,
      ...rulePromises,
      ...assetPromises,
      ...budgetPromises]);
    Logger.addLog(`BackupManager > Restore | Core entities successfully imported!`);

    //region Transactions
    const trxPromises = data.transactions.map(async (trx) => {
      if (!Object.values(MYFIN.TRX_TYPES).includes(trx.type)) {
        throw APIError.notAcceptable(`Transaction type not recognized for transaction #${trx.transaction_id}`, RestoreUserErrorCodes.MalformedBackup);
      }

      const newTrx = await dbClient.transactions.create({
        data: {
          date_timestamp: trx.date_timestamp,
          description: trx.description,
          amount: trx.amount,
          type: trx.type,
          entities_entity_id: entityIdMap.get(trx.entities_entity_id),
          accounts_account_from_id: accountIdMap.get(trx.accounts_account_from_id),
          accounts_account_to_id: accountIdMap.get(trx.accounts_account_to_id),
          categories_category_id: categoryIdMap.get(trx.categories_category_id),
          is_essential: trx.is_essential,
        }
      });
      return newTrx;
    });
    // endregion
    // region Asset Transactions
    const assetTrxPromises = data.invest_transactions.map(async (trx) => {
      if (!Object.values(MYFIN.INVEST.TRX_TYPE).includes(trx.type)) {
        throw APIError.notAcceptable(`Asset transaction type not recognized for transaction #${trx.transaction_id}`, RestoreUserErrorCodes.MalformedBackup);
      }

      const newTrx = await dbClient.invest_transactions.create({
        data: {
          date_timestamp: trx.date_timestamp,
          units: trx.units,
          fees_taxes: trx.fees_taxes,
          total_price: trx.total_price,
          note: trx.note,
          type: trx.type,
          invest_assets_asset_id: assetIdMap.get(trx.invest_assets_asset_id),
          created_at: trx.created_at,
          updated_at: trx.updated_at,
        }
      });
      return newTrx;
    });
    // endregion

    Logger.addLog(`BackupManager > Restore | Importing transactions...`);
    await Promise.all([
      ...trxPromises,
      ...assetTrxPromises,
    ]);
    Logger.addLog(`BackupManager > Restore | Transactions successfully imported!`);

    // region Asset Evolution Snapshots
    const assetEvoSnapshots = data.invest_asset_evo_snapshot.map(async (snapshot) => {
      const newSnapshot = await dbClient.invest_asset_evo_snapshot.create({
        data: {
          month: snapshot.month,
          year: snapshot.year,
          units: snapshot.units,
          invested_amount: snapshot.invested_amount,
          current_value: snapshot.current_value,
          invest_assets_asset_id: assetIdMap.get(snapshot.invest_assets_asset_id),
          created_at: snapshot.created_at,
          updated_at: snapshot.updated_at,
          withdrawn_amount: snapshot.withdrawn_amount,
        }
      });
      return newSnapshot;
    });
    // endregion

    // region Budget Categories
    const budgetCategoriesPromises = data.budgets_has_categories.map(async (category) => {
      const newBudgetCategory = await dbClient.budgets_has_categories.create({
        data: {
          budgets_budget_id: budgetIdMap.get(category.budgets_budget_id),
          budgets_users_user_id: userId,
          categories_category_id: categoryIdMap.get(category.categories_category_id),
          planned_amount_credit: category.planned_amount_credit,
          planned_amount_debit: category.planned_amount_debit,
          current_amount: category.current_amount,
        }
      });

      return newBudgetCategory;
    });
    // endregion
    Logger.addLog(`BackupManager > Restore | Recalculating balances...`);
    await Promise.all([
      AccountService.recalculateAllUserAccountsBalances(userId, dbClient),
      ...budgetCategoriesPromises,
      ...assetEvoSnapshots,
    ]);
    Logger.addLog(`BackupManager > Restore | Balances successfully recalculated!`);


    return Promise.resolve("ok");
  }
}

export default BackupManager;