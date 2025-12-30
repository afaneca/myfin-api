import { prisma } from '../config/prisma.js';
import Logger from '../utils/Logger.js';
import ConvertUtils from '../utils/convertUtils.js';
import AccountService from './accountService.js';
import EntityService from './entityService.js';
import CategoryService from './categoryService.js';
import { MYFIN } from '../consts.js';
import { getBestFuzzyMatch } from './fuzzyMatchingService.js';

interface Rule {
  rule_id?: bigint | number;
  matcher_description_operator?: string | null;
  matcher_description_value?: string | null;
  matcher_amount_operator?: string | null;
  matcher_amount_value?: bigint | number | null;
  matcher_type_operator?: string | null;
  matcher_type_value?: string | null;
  matcher_account_to_id_operator?: string | null;
  matcher_account_to_id_value?: bigint | number | null;
  matcher_account_from_id_operator?: string | null;
  matcher_account_from_id_value?: bigint | number | null;
  assign_category_id?: bigint | number | null;
  assign_entity_id?: bigint | number | null;
  assign_account_to_id?: bigint | number | null;
  assign_account_from_id?: bigint | number | null;
  assign_type?: string | null;
  assign_is_essential?: boolean;
  users_user_id?: bigint;
}

const getAllRulesForUser = async (userId: bigint) => {
  const rules = await prisma.rules.findMany({
    where: { users_user_id: userId },
  });

  rules.forEach((rule) => {
    (rule.matcher_amount_value as any) = rule.matcher_amount_value
      ? ConvertUtils.convertBigIntegerToFloat(rule.matcher_amount_value)
      : undefined;

    (rule.assign_is_essential as any) = +rule.assign_is_essential;
  });

  const categories = await CategoryService.getAllCategoriesForUser(userId);
  const accounts = await AccountService.getAccountsForUser(userId);
  const entities = await EntityService.getAllEntitiesForUser(userId);

  return {
    rules,
    categories,
    entities,
    accounts,
  };
};

const createRule = async (userId: bigint, rule: Rule, dbClient = prisma) =>
  dbClient.rules.create({
    data: {
      users_user_id: userId,
      matcher_description_operator: rule.matcher_description_operator ?? '',
      matcher_description_value: rule.matcher_description_value ?? '',
      matcher_amount_operator: rule.matcher_amount_operator ?? '',
      matcher_amount_value: rule.matcher_amount_value
        ? ConvertUtils.convertFloatToBigInteger(rule.matcher_amount_value)
        : null,
      matcher_type_operator: rule.matcher_type_operator ?? '',
      matcher_type_value: rule.matcher_type_value ?? '',
      matcher_account_to_id_operator: rule.matcher_account_to_id_operator ?? '',
      matcher_account_to_id_value: rule.matcher_account_to_id_value ?? null,
      matcher_account_from_id_operator: rule.matcher_account_from_id_operator ?? '',
      matcher_account_from_id_value: rule.matcher_account_from_id_value ?? null,
      assign_category_id: rule.assign_category_id ?? null,
      assign_entity_id: rule.assign_entity_id ?? null,
      assign_account_to_id: rule.assign_account_to_id ?? null,
      assign_account_from_id: rule.assign_account_from_id ?? null,
      assign_type: rule.assign_type ?? '',
      assign_is_essential: rule.assign_is_essential ?? false,
    },
  });

const updatedRule = async (rule: Rule, dbClient = prisma) => {
  Logger.addStringifiedLog(rule);
  return dbClient.rules.update({
    where: {
      rule_id_users_user_id: {
        rule_id: Number(rule.rule_id),
        users_user_id: Number(rule.users_user_id),
      },
    },
    data: {
      matcher_description_operator: rule.matcher_description_operator ?? '',
      matcher_description_value: rule.matcher_description_value ?? '',
      matcher_amount_operator: rule.matcher_amount_operator,
      matcher_amount_value: rule.matcher_amount_value
        ? ConvertUtils.convertFloatToBigInteger(rule.matcher_amount_value)
        : null,
      matcher_type_operator: rule.matcher_type_operator ?? '',
      matcher_type_value: rule.matcher_type_value ?? '',
      matcher_account_to_id_operator: rule.matcher_account_to_id_operator ?? '',
      matcher_account_to_id_value: rule.matcher_account_to_id_value ?? null,
      matcher_account_from_id_operator: rule.matcher_account_from_id_operator ?? '',
      matcher_account_from_id_value: rule.matcher_account_from_id_value ?? null,
      assign_category_id: rule.assign_category_id ?? null,
      assign_entity_id: rule.assign_entity_id ?? null,
      assign_account_to_id: rule.assign_account_to_id ?? null,
      assign_account_from_id: rule.assign_account_from_id ?? null,
      assign_type: rule.assign_type ?? '',
      assign_is_essential: rule.assign_is_essential ?? false,
    },
  });
};

const deleteRule = async (userId: bigint, ruleId: bigint) =>
  prisma.rules.delete({
    where: {
      rule_id_users_user_id: {
        rule_id: ruleId,
        users_user_id: userId,
      },
    },
  });

const getCountOfUserRules = async (userId, dbClient = prisma) =>
  dbClient.rules.count({
    where: { users_user_id: userId },
  });

// Fuzzy matching threshold for entity/category inference (0-100)
const FUZZY_THRESHOLD = 80;

enum RuleMatcherResult {
  MATCHED = 0,
  FAILED = 1,
  IGNORE = 2,
}

type RuleMatchResult = {
  result: RuleMatcherResult;
  score?: number;
};

/* Match type weights - higher is more specific
These are multiplied by specificity length, so they act as multipliers */
const MATCH_TYPE_WEIGHTS = {
  [MYFIN.RULES.OPERATOR.EQUALS]: 1000,
  [MYFIN.RULES.OPERATOR.CONTAINS]: 100,
  [MYFIN.RULES.OPERATOR.NOT_EQUALS]: 10,
  [MYFIN.RULES.OPERATOR.NOT_CONTAINS]: 1,
  [MYFIN.RULES.OPERATOR.IGNORE]: 0,
};

const calculateMatchScore = (
  attribute: string | number | bigint,
  ruleValue: string | number | bigint,
  ruleOperator: string
): number => {
  let typeMultiplier = MATCH_TYPE_WEIGHTS[ruleOperator] || 0;
  let specificityLength = 0;

  // Handle ignore case
  if (ruleOperator === MYFIN.RULES.OPERATOR.IGNORE || typeMultiplier === 0) {
    return 0;
  }

  const isString = typeof attribute === 'string' && typeof ruleValue === 'string';
  const isNumeric =
    (typeof attribute === 'number' || typeof attribute === 'bigint') &&
    (typeof ruleValue === 'number' || typeof ruleValue === 'bigint');

  if (!isString && !isNumeric) return 0;

  switch (ruleOperator) {
    case MYFIN.RULES.OPERATOR.EQUALS:
      specificityLength = isString ? ruleValue.length : 100;
      break;

    case MYFIN.RULES.OPERATOR.CONTAINS:
      specificityLength = isString ? ruleValue.length : 0;
      break;

    case MYFIN.RULES.OPERATOR.NOT_EQUALS:
    case MYFIN.RULES.OPERATOR.NOT_CONTAINS:
      specificityLength = 1;
      break;

    default:
      specificityLength = 0;
      break;
  }

  // Calculate final score: multiply type weight by specificity
  return typeMultiplier * specificityLength;
};

const checkStringMatcher = (
  rule: Rule,
  attribute: string,
  ruleOperator: string,
  ruleValue
): RuleMatchResult => {
  if (!(ruleOperator && ruleValue != null && attribute !== MYFIN.RULES.MATCHING.IGNORE)) {
    return { result: RuleMatcherResult.IGNORE };
  }
  switch (ruleOperator) {
    case MYFIN.RULES.OPERATOR.CONTAINS:
      if (!attribute.toUpperCase().includes(ruleValue.toUpperCase())) {
        // Fails the validation -> try the next rule
        return { result: RuleMatcherResult.FAILED };
      }
      break;
    case MYFIN.RULES.OPERATOR.NOT_CONTAINS:
      if (attribute.toUpperCase().includes(ruleValue.toUpperCase())) {
        // Fails the validation -> try the next rule
        return { result: RuleMatcherResult.FAILED };
      }
      break;
    case MYFIN.RULES.OPERATOR.EQUALS:
      if (attribute.toUpperCase() !== ruleValue.toUpperCase()) {
        // Fails the validation -> try the next rule
        return { result: RuleMatcherResult.FAILED };
      }
      break;
    case MYFIN.RULES.OPERATOR.NOT_EQUALS:
      if (attribute.toUpperCase() === ruleValue.toUpperCase()) {
        // Fails the validation -> try the next rule
        return { result: RuleMatcherResult.FAILED };
      }
      break;
    default:
      return { result: RuleMatcherResult.IGNORE };
  }

  return {
    result: RuleMatcherResult.MATCHED,
    score: calculateMatchScore(attribute, ruleValue, ruleOperator),
  };
};

const checkNumberMatcher = (
  rule: Rule,
  attribute: number | bigint,
  ruleOperator: string,
  ruleValue: number | bigint
): RuleMatchResult => {
  switch (ruleOperator) {
    case MYFIN.RULES.OPERATOR.CONTAINS:
    case MYFIN.RULES.OPERATOR.EQUALS:
      if (ruleValue != attribute) {
        // Fails the validation -> try the next rule
        return { result: RuleMatcherResult.FAILED };
      }
      break;
    case MYFIN.RULES.OPERATOR.NOT_CONTAINS:
    case MYFIN.RULES.OPERATOR.NOT_EQUALS:
      if (ruleValue == attribute) {
        // Fails the validation -> try the next rule
        return { result: RuleMatcherResult.FAILED };
      }
      break;
    default:
      return { result: RuleMatcherResult.IGNORE };
  }

  return {
    result: RuleMatcherResult.MATCHED,
    score: calculateMatchScore(attribute, ruleValue, ruleOperator),
  };
};

const guessEntityIdForDescription = async (
  userId: bigint,
  description: string,
  dbClient = prisma
): Promise<bigint | null> => {
  const entities = (await EntityService.getAllEntitiesForUser(
    userId,
    { entity_id: true, name: true },
    dbClient
  )) as Array<{ entity_id: bigint; name: string }>;

  const candidates = entities
    .filter((e) => !!e?.entity_id && !!e?.name)
    .map((e) => ({ id: e.entity_id, name: e.name }));

  const best = getBestFuzzyMatch(description, candidates, FUZZY_THRESHOLD);
  if (!best) return null;

  Logger.addLog(`Fuzzy entity suggestion: '${best.name}' (score=${best.score})`);
  return best.id;
};

const guessCategoryIdForDescription = async (
  userId: bigint,
  description: string,
  dbClient = prisma
): Promise<bigint | null> => {
  const categories = (await CategoryService.getAllCategoriesForUser(
    userId,
    { category_id: true, name: true },
    dbClient
  )) as Array<{ category_id: bigint; name: string }>;

  const candidates = categories
    .filter((c) => !!c?.category_id && !!c?.name)
    .map((c) => ({ id: c.category_id, name: c.name }));

  const best = getBestFuzzyMatch(description, candidates, FUZZY_THRESHOLD);
  if (!best) return null;

  Logger.addLog(`Fuzzy category suggestion: '${best.name}' (score=${best.score})`);
  return best.id;
};

const getRuleForTransaction = async (
  userId: bigint,
  description: string,
  amount: number,
  type: string,
  accountsFromId: bigint,
  accountsToId: bigint,
  selectedCategoryId: bigint | string,
  selectedEntityId: bigint | string,
  dbClient = prisma
): Promise<Rule | undefined> => {
  const userRules = await dbClient.rules.findMany({
    where: { users_user_id: userId },
  });

  type MatchedAttribute = { ruleId: bigint | number; matchScore: number };
  type WeightedRule = { rule: Rule; matchedAttributes: MatchedAttribute[] };

  const matchedRules: WeightedRule[] = [];
  for (const rule of userRules) {
    let matchedAttributes: MatchedAttribute[] = [];
    Logger.addLog('--------- RULE ---------');
    Logger.addStringifiedLog(rule);
    Logger.addLog('--');
    Logger.addLog(
      `description: ${description} | amount: ${amount} | type: ${type} | accountFromId: ${accountsFromId} | accountToId: ${accountsToId} | selectedCategoryId: ${selectedCategoryId} | selectedEntityId: ${selectedEntityId}`
    );
    Logger.addLog('------------------------');
    /* description matcher */
    const descriptionMatcher = checkStringMatcher(
      rule,
      description,
      rule.matcher_description_operator,
      rule.matcher_description_value
    );
    /* Logger.addLog(`Description Matcher: ${descriptionMatcher}`); */
    switch (descriptionMatcher.result) {
      case RuleMatcherResult.MATCHED:
        matchedAttributes.push({ ruleId: rule.rule_id, matchScore: descriptionMatcher.score });
        break;
      case RuleMatcherResult.FAILED:
        // Fails the validation -> try the next rule
        continue;
      case RuleMatcherResult.IGNORE:
        break;
    }

    /* amount matcher */
    const amountMatcher = checkNumberMatcher(
      rule,
      ConvertUtils.convertFloatToBigInteger(amount),
      rule.matcher_amount_operator,
      rule.matcher_amount_value
    );
    /* Logger.addLog(`Amount Matcher: ${amountMatcher}`); */
    switch (amountMatcher.result) {
      case RuleMatcherResult.MATCHED:
        matchedAttributes.push({ ruleId: rule.rule_id, matchScore: amountMatcher.score });
        break;
      case RuleMatcherResult.FAILED:
        // Fails the validation -> try the next rule
        continue;
      case RuleMatcherResult.IGNORE:
        break;
    }

    /* type matcher */
    const typeMatcher = checkStringMatcher(
      rule,
      type,
      rule.matcher_type_operator,
      rule.matcher_type_value
    );
    /* Logger.addLog(`Type Matcher: ${typeMatcher}`); */
    switch (typeMatcher.result) {
      case RuleMatcherResult.MATCHED:
        matchedAttributes.push({ ruleId: rule.rule_id, matchScore: typeMatcher.score });
        break;
      case RuleMatcherResult.FAILED:
        // Fails the validation -> try the next rule
        continue;
      case RuleMatcherResult.IGNORE:
        break;
    }

    /* account_to_id matcher */
    const accountToMatcher = checkNumberMatcher(
      rule,
      accountsToId,
      rule.matcher_account_to_id_operator,
      rule.matcher_account_to_id_value
    );
    /* Logger.addLog(`Account To Matcher: ${accountToMatcher}`); */
    switch (accountToMatcher.result) {
      case RuleMatcherResult.MATCHED:
        matchedAttributes.push({ ruleId: rule.rule_id, matchScore: accountToMatcher.score });
        break;
      case RuleMatcherResult.FAILED:
        // Fails the validation -> try the next rule
        continue;
      case RuleMatcherResult.IGNORE:
        break;
    }

    /* account_from_id matcher */
    const accountFromMatcher = checkNumberMatcher(
      rule,
      accountsFromId,
      rule.matcher_account_from_id_operator,
      rule.matcher_account_from_id_value
    );
    /*Logger.addLog(`Account From Matcher: ${accountFromMatcher}`);*/
    switch (accountFromMatcher.result) {
      case RuleMatcherResult.MATCHED:
        matchedAttributes.push({ ruleId: rule.rule_id, matchScore: accountFromMatcher.score });
        break;
      case RuleMatcherResult.FAILED:
        // Fails the validation -> try the next rule
        continue;
      case RuleMatcherResult.IGNORE:
        break;
    }

    if (matchedAttributes.length > 0) {
      matchedRules.push({ rule: rule, matchedAttributes: matchedAttributes });
    }
  }

  Logger.addStringifiedLog(matchedRules);

  // loop through matched rules and choose the best match based on priority: 1. most matched attributes, 2. highest total score
  let bestRule: Rule | null = null;
  let bestScore = -1;
  let bestMatchedCount = -1;
  for (const weightedRule of matchedRules) {
    const totalScore = weightedRule.matchedAttributes.reduce(
      (sum, attr) => sum + attr.matchScore,
      0
    );
    const matchedCount = weightedRule.matchedAttributes.length;

    if (
      matchedCount > bestMatchedCount ||
      (matchedCount === bestMatchedCount && totalScore > bestScore)
    ) {
      bestRule = weightedRule.rule;
      bestScore = totalScore;
      bestMatchedCount = matchedCount;
    }
  }

  if (bestRule) {
    Logger.addLog('Best matching rule found:');
    Logger.addStringifiedLog(bestRule);
    return bestRule;
  }

  // Fallback: when no rule matches, try to infer entity/category by fuzzy matching
  const guessedEntityId = await guessEntityIdForDescription(userId, description, dbClient);
  if (guessedEntityId) {
    return {
      rule_id: -1,
      assign_entity_id: guessedEntityId,
    };
  }

  const guessedCategoryId = await guessCategoryIdForDescription(userId, description, dbClient);
  if (guessedCategoryId) {
    return {
      rule_id: -1,
      assign_category_id: guessedCategoryId,
    };
  }

  Logger.addLog('No matching rule found.');
  return undefined;
};

export default {
  getAllRulesForUser,
  createRule,
  deleteRule,
  updatedRule,
  getCountOfUserRules,
  getRuleForTransaction,
};
