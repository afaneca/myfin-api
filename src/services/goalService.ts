import { prisma } from '../config/prisma.js';
import { MYFIN } from '../consts.js';
import ConvertUtils from '../utils/convertUtils.js';

export type FundingType = 'absolute' | 'relative';

export type FundingAccount = {
  account_id: number;
  funding_type: FundingType;
  funding_amount: number;
  current_funding?: number;
};

export type CreateGoalType = {
  name: string;
  description?: string;
  priority: number;
  amount: number;
  due_date?: number;
  funding_accounts: FundingAccount[];
};

export type UpdateGoalType = {
  goal_id: bigint;
  name: string;
  description?: string;
  priority: number;
  amount: number;
  due_date?: number;
  is_archived: boolean;
  funding_accounts: FundingAccount[];
};

export type GoalWithFunding = {
  goal_id: number;
  name: string;
  description: string | null;
  priority: number;
  amount: number;
  due_date: number | null;
  is_archived: boolean;
  currently_funded_amount: number;
  funding_accounts: FundingAccount[];
  is_underfunded: boolean;
};

class GoalService {
  static async createGoal(goal: CreateGoalType, userId: bigint, dbClient = prisma) {
    const timestamp = Date.now();
    const goalObj = {
      name: goal.name,
      description: goal.description || null,
      priority: goal.priority,
      amount: ConvertUtils.convertFloatToBigInteger(goal.amount),
      due_date: goal.due_date ? BigInt(goal.due_date) : null,
      created_at: BigInt(timestamp),
      updated_at: null,
      users_user_id: userId,
    };

    return dbClient.$transaction(async (tx) => {
      const createdGoal = await tx.goals.create({
        data: goalObj,
      });

      if (goal.funding_accounts && goal.funding_accounts.length > 0) {
        const fundingAccountsData = goal.funding_accounts.map((fa) => ({
          goals_goal_id: createdGoal.goal_id,
          accounts_account_id: BigInt(fa.account_id),
          match_type: fa.funding_type,
          match_value: fa.funding_amount,
        }));

        await tx.goal_has_account.createMany({
          data: fundingAccountsData,
        });
      }

      return createdGoal;
    });
  }

  static async getGoalsForUser(
    userId: bigint,
    onlyActive = false,
    dbClient = prisma
  ): Promise<GoalWithFunding[]> {
    const whereClause: { users_user_id: bigint; is_archived?: boolean } = {
      users_user_id: userId,
    };

    if (onlyActive) {
      whereClause.is_archived = false;
    }

    const goals = await dbClient.goals.findMany({
      where: whereClause,
      include: {
        goal_has_account: {
          include: {
            accounts: true,
          },
        },
      },
      orderBy: {
        priority: 'desc',
      },
    });

    // Get all accounts for the user to calculate funding
    const accounts = await dbClient.accounts.findMany({
      where: {
        users_user_id: userId,
      },
    });

    const accountBalances = new Map<bigint, number>();
    for (const account of accounts) {
      accountBalances.set(
        account.account_id,
        ConvertUtils.convertBigIntegerToFloat(account.current_balance || BigInt(0))
      );
    }

    // Calculate funding for each goal
    const goalsWithFunding: GoalWithFunding[] = [];
    const accountFundingTracking = new Map<bigint, number>();

    for (const goal of goals) {
      const fundingAccounts: FundingAccount[] = [];
      let totalFunded = 0;
      let isUnderfunded = false;

      for (const gha of goal.goal_has_account) {
        const accountBalance = accountBalances.get(gha.accounts_account_id) || 0;
        const alreadyAllocated = accountFundingTracking.get(gha.accounts_account_id) || 0;
        const remainingBalance = Math.max(0, accountBalance - alreadyAllocated);

        let fundingAmount = 0;
        if (gha.match_type === MYFIN.GOALS.MATCH_TYPE.RELATIVE) {
          // Percentage of current balance
          fundingAmount = (accountBalance * Number(gha.match_value)) / 100;
        } else {
          // Absolute amount
          fundingAmount = Number(gha.match_value);
        }

        // Apply remaining balance constraint
        const actualFunding = Math.min(fundingAmount, remainingBalance);
        totalFunded += actualFunding;

        // Check if this account couldn't provide what was expected due to over-allocation
        if (actualFunding < fundingAmount) {
          isUnderfunded = true;
        }

        // Track allocated funds
        accountFundingTracking.set(gha.accounts_account_id, alreadyAllocated + actualFunding);

        fundingAccounts.push({
          account_id: Number(gha.accounts_account_id),
          funding_type: gha.match_type as FundingType,
          funding_amount: Number(gha.match_value),
          current_funding: actualFunding,
        });
      }

      const goalAmount = ConvertUtils.convertBigIntegerToFloat(goal.amount);

      goalsWithFunding.push({
        goal_id: Number(goal.goal_id),
        name: goal.name,
        description: goal.description,
        priority: goal.priority,
        amount: goalAmount,
        due_date: goal.due_date ? Number(goal.due_date) : null,
        is_archived: goal.is_archived,
        currently_funded_amount: totalFunded,
        funding_accounts: fundingAccounts,
        is_underfunded: isUnderfunded,
      });
    }

    return goalsWithFunding;
  }

  static async doesGoalBelongToUser(userId: bigint, goalId: bigint, dbClient = prisma) {
    const result = await dbClient.goals.findUnique({
      where: {
        goal_id: goalId,
        users_user_id: userId,
      },
    });

    return result !== null;
  }

  static async deleteGoal(goalId: bigint, dbClient = prisma) {
    return dbClient.$transaction(async (tx) => {
      // Delete funding accounts first
      await tx.goal_has_account.deleteMany({
        where: { goals_goal_id: goalId },
      });

      // Delete the goal
      await tx.goals.delete({
        where: { goal_id: goalId },
      });
    });
  }

  static async updateGoal(goal: UpdateGoalType, userId: bigint, dbClient = prisma) {
    const timestamp = Date.now();
    const goalObj = {
      name: goal.name,
      description: goal.description || null,
      priority: goal.priority,
      amount: ConvertUtils.convertFloatToBigInteger(goal.amount),
      due_date: goal.due_date ? BigInt(goal.due_date) : null,
      is_archived: goal.is_archived ?? false,
      updated_at: BigInt(timestamp),
    };

    return dbClient.$transaction(async (tx) => {
      // Update the goal
      const updatedGoal = await tx.goals.update({
        where: { goal_id: goal.goal_id },
        data: goalObj,
      });

      // Delete existing funding accounts
      await tx.goal_has_account.deleteMany({
        where: { goals_goal_id: goal.goal_id },
      });

      // Create new funding accounts
      if (goal.funding_accounts && goal.funding_accounts.length > 0) {
        const fundingAccountsData = goal.funding_accounts.map((fa) => ({
          goals_goal_id: goal.goal_id,
          accounts_account_id: BigInt(fa.account_id),
          match_type: fa.funding_type,
          match_value: fa.funding_amount,
        }));

        await tx.goal_has_account.createMany({
          data: fundingAccountsData,
        });
      }

      return updatedGoal;
    });
  }
}

export default GoalService;
