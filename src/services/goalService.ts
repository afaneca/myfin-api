import { performDatabaseRequest, prisma } from '../config/prisma.js';
import { MYFIN } from '../consts.js';
import APIError from '../errorHandling/apiError.js';
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
  private static async validateFundingAccountsBelongToUser(
    fundingAccounts: FundingAccount[],
    userId: bigint,
    dbClient: Pick<typeof prisma, 'accounts'> = prisma
  ) {
    const fundingAccountIds = [...new Set(fundingAccounts.map((fa) => BigInt(fa.account_id)))];

    if (fundingAccountIds.length === 0) {
      return;
    }

    const userAccountsCount = await dbClient.accounts.count({
      where: {
        account_id: {
          in: fundingAccountIds,
        },
        users_user_id: userId,
      },
    });

    if (userAccountsCount !== fundingAccountIds.length) {
      throw APIError.notAuthorized();
    }
  }

  static async createGoal(goal: CreateGoalType, userId: bigint, dbClient = prisma) {
    return performDatabaseRequest(async (prismaTx) => {
      await GoalService.validateFundingAccountsBelongToUser(
        goal.funding_accounts || [],
        userId,
        prismaTx
      );

      const timestamp = Date.now();
      const goalObj = {
        name: goal.name,
        description: goal.description || null,
        priority: goal.priority,
        amount: ConvertUtils.convertFloatToBigInteger(goal.amount),
        due_date: goal.due_date ? BigInt(goal.due_date) : null,
        created_at: BigInt(timestamp),
        updated_at: BigInt(timestamp),
        users_user_id: userId,
      };

      const createdGoal = await prismaTx.goals.create({
        data: goalObj,
      });

      if (goal.funding_accounts && goal.funding_accounts.length > 0) {
        const fundingAccountsData = goal.funding_accounts.map((fa) => ({
          goals_goal_id: createdGoal.goal_id,
          accounts_account_id: BigInt(fa.account_id),
          match_type: fa.funding_type,
          match_value: fa.funding_amount,
        }));

        await prismaTx.goal_has_account.createMany({
          data: fundingAccountsData,
        });
      }

      return createdGoal;
    }, dbClient);
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
          orderBy: {
            accounts_account_id: 'asc',
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { goal_id: 'asc' }],
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

    const goalsWithFunding: GoalWithFunding[] = goals.map((goal) => ({
      goal_id: Number(goal.goal_id),
      name: goal.name,
      description: goal.description,
      priority: goal.priority,
      amount: ConvertUtils.convertBigIntegerToFloat(goal.amount),
      due_date: goal.due_date ? Number(goal.due_date) : null,
      is_archived: goal.is_archived,
      currently_funded_amount: 0,
      funding_accounts: goal.goal_has_account.map((gha) => ({
        account_id: Number(gha.accounts_account_id),
        funding_type: gha.match_type as FundingType,
        funding_amount: Number(gha.match_value),
        current_funding: 0,
      })),
      is_underfunded: false,
    }));

    const accountFundingTracking = new Map<bigint, number>();
    const accountGoalIndexes = new Map<bigint, number[]>();
    const getConfiguredFundingAmount = (
      gha: (typeof goals)[number]['goal_has_account'][number]
    ) => {
      const accountBalance = accountBalances.get(gha.accounts_account_id) || 0;

      if (gha.match_type === MYFIN.GOALS.MATCH_TYPE.RELATIVE) {
        return (accountBalance * Number(gha.match_value)) / 100;
      }

      return Number(gha.match_value);
    };
    const getLowerPriorityFundingDemand = (accountId: bigint, currentGoalIndex: number) => {
      let lowerPriorityFundingDemand = 0;

      for (const lowerPriorityGoal of goals.slice(currentGoalIndex + 1)) {
        const lowerPriorityGoalAmount = ConvertUtils.convertBigIntegerToFloat(
          lowerPriorityGoal.amount
        );
        const matchingFundingAccount = lowerPriorityGoal.goal_has_account.find(
          (gha) => gha.accounts_account_id === accountId
        );

        if (matchingFundingAccount) {
          lowerPriorityFundingDemand += Math.min(
            getConfiguredFundingAmount(matchingFundingAccount),
            lowerPriorityGoalAmount
          );
        }
      }

      return lowerPriorityFundingDemand;
    };

    for (const [goalIndex, goal] of goals.entries()) {
      for (const gha of goal.goal_has_account) {
        const goalIndexes = accountGoalIndexes.get(gha.accounts_account_id) || [];
        goalIndexes.push(goalIndex);
        accountGoalIndexes.set(gha.accounts_account_id, goalIndexes);
      }
    }

    for (const [goalIndex, goal] of goals.entries()) {
      const goalWithFunding = goalsWithFunding[goalIndex];
      const fundingEntries = goal.goal_has_account
        .map((gha, fundingAccountIndex) => ({
          fundingAccountIndex,
          gha,
          lowerPriorityFundingDemand: getLowerPriorityFundingDemand(
            gha.accounts_account_id,
            goalIndex
          ),
        }))
        .sort((a, b) => {
          const demandDifference = a.lowerPriorityFundingDemand - b.lowerPriorityFundingDemand;

          if (demandDifference !== 0) {
            return demandDifference;
          }

          return Number(a.gha.accounts_account_id - b.gha.accounts_account_id);
        });

      for (const { fundingAccountIndex, gha } of fundingEntries) {
        const accountBalance = accountBalances.get(gha.accounts_account_id) || 0;
        const alreadyAllocated = accountFundingTracking.get(gha.accounts_account_id) || 0;
        const remainingBalance = Math.max(0, accountBalance - alreadyAllocated);
        const remainingGoalAmount = Math.max(
          0,
          goalWithFunding.amount - goalWithFunding.currently_funded_amount
        );

        const fundingAmount = getConfiguredFundingAmount(gha);
        const actualFunding = Math.min(fundingAmount, remainingBalance, remainingGoalAmount);
        goalWithFunding.currently_funded_amount += actualFunding;

        // Track allocated funds
        accountFundingTracking.set(gha.accounts_account_id, alreadyAllocated + actualFunding);
        goalWithFunding.funding_accounts[fundingAccountIndex].current_funding = actualFunding;
      }
    }

    // Once every eligible goal is funded, any account surplus rolls back to its top priority goal.
    for (const [accountId, goalIndexes] of accountGoalIndexes.entries()) {
      const accountBalance = accountBalances.get(accountId) || 0;
      const alreadyAllocated = accountFundingTracking.get(accountId) || 0;
      const remainingBalance = Math.max(0, accountBalance - alreadyAllocated);

      if (remainingBalance <= 0) {
        continue;
      }

      const areAllEligibleGoalsFunded = goalIndexes.every(
        (goalIndex) =>
          goalsWithFunding[goalIndex].currently_funded_amount >= goalsWithFunding[goalIndex].amount
      );

      if (!areAllEligibleGoalsFunded) {
        continue;
      }

      const highestPriorityGoal = goalsWithFunding[goalIndexes[0]];
      const fundingAccount = highestPriorityGoal.funding_accounts.find(
        (account) => account.account_id === Number(accountId)
      );

      if (fundingAccount) {
        highestPriorityGoal.currently_funded_amount += remainingBalance;
        fundingAccount.current_funding = (fundingAccount.current_funding || 0) + remainingBalance;
        accountFundingTracking.set(accountId, alreadyAllocated + remainingBalance);
      }
    }

    for (const goal of goalsWithFunding) {
      goal.is_underfunded = goal.currently_funded_amount < goal.amount;
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
      await GoalService.validateFundingAccountsBelongToUser(
        goal.funding_accounts || [],
        userId,
        tx
      );

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

  static async getCountOfUserGoals(userId: bigint, dbClient = prisma) {
    return dbClient.goals.count({
      where: { users_user_id: userId },
    });
  }
}

export default GoalService;
