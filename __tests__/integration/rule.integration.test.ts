import { beforeEach, describe, expect, test } from 'vitest';
import UserService from '../../src/services/userService.js';
import RuleService from '../../src/services/ruleService.js';
import { MYFIN } from '../../src/consts.js';
import EntityService, { Entity } from '../../src/services/entityService.js';
import TransactionService from '../../src/services/transactionService.js';

describe('Rule tests', () => {
  let user: { user_id: bigint; username: string };
  let matchedEntity: Entity;
  beforeEach(async () => {
    user = await UserService.createUser({
      username: 'demo',
      password: '123',
      email: 'demo@afaneca.com',
    });

    matchedEntity = await EntityService.createEntity({
      name: 'Matched Entity',
      users_user_id: user.user_id,
    });
  });

  describe('Description matching', () => {
    test('When EQUAL matching is required, only an exact match will be made', async () => {
      const exactMatchDescription = 'exact match';
      const partialMatchDescription = 'match';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: exactMatchDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
      });

      // Exact match - should match
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        exactMatchDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      // should not alter any transaction attribute apart from the assigned category
      expect(result).not.toBeNull();
      expect(result.description).toBe(exactMatchDescription);
      expect(result.amount).toBeCloseTo(transactionAmount);
      expect(result.type).toBe(transactionType);
      expect(result.selectedAccountFromID).toBe(accountFromId);
      expect(result.selectedAccountToID).toBe(accountToId);
      expect(result.date).toBe(date);
      expect(result.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result.selectedEntityID).toBe(rule1.assign_entity_id);

      // Partial match - should not match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        partialMatchDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      // should not alter any transaction attribute
      expect(result2).not.toBeNull();
      expect(result2.description).toBe(partialMatchDescription);
      expect(result2.amount).toBeCloseTo(transactionAmount);
      expect(result2.type).toBe(transactionType);
      expect(result2.selectedAccountFromID).toBe(accountFromId);
      expect(result2.selectedAccountToID).toBe(accountToId);
      expect(result2.date).toBe(date);
      expect(result2.selectedCategoryID).toBe(undefined);
      expect(result2.selectedEntityID).toBe(undefined);
    });

    test('When CONTAINS matching is required, a partial match will be made', async () => {
      const partialMatchDescription = 'match';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: partialMatchDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
        assign_account_from_id: 3n,
        assign_account_to_id: 4n,
      });

      // Partial match - should match
      const transactionDescription = `some text ${partialMatchDescription} and some more text`;
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      // there's a match - should not alter any transaction attribute apart from the ones defined by the matching rule
      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(transactionAmount);
      expect(result.type).toBe(transactionType);
      expect(result.date).toBe(date);
      expect(result.selectedAccountFromID).toBe(rule1.assign_account_from_id);
      expect(result.selectedAccountToID).toBe(rule1.assign_account_to_id);
      expect(result.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result.selectedEntityID).toBe(rule1.assign_entity_id);
    });

    test('When NOT EQUALS matching is required, a match will only be made if attribute is not equal', async () => {
      const matchDescription = 'exact match';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.NOT_EQUALS,
        matcher_description_value: matchDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
        assign_account_from_id: 3n,
        assign_account_to_id: 4n,
      });

      // Partial match - should match
      const transactionDescription = `some text ${matchDescription} and some more text`;
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      // there's a match - should not alter any transaction attribute apart from the ones defined by the matching rule
      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(transactionAmount);
      expect(result.type).toBe(transactionType);
      expect(result.date).toBe(date);
      expect(result.selectedAccountFromID).toBe(rule1.assign_account_from_id);
      expect(result.selectedAccountToID).toBe(rule1.assign_account_to_id);
      expect(result.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result.selectedEntityID).toBe(rule1.assign_entity_id);

      // Exact match - should NOT match

      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        matchDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      // there's NOT a match - should not alter any transaction attributes
      expect(result2).not.toBeNull();
      expect(result2.description).toBe(matchDescription);
      expect(result2.amount).toBeCloseTo(transactionAmount);
      expect(result2.type).toBe(transactionType);
      expect(result2.date).toBe(date);
      expect(result2.selectedAccountFromID).toBe(accountFromId);
      expect(result2.selectedAccountToID).toBe(accountToId);
      expect(result2.selectedCategoryID).toBe(undefined);
      expect(result2.selectedEntityID).toBe(undefined);
    });

    test('When NOT CONTAINS matching is required, a match will only be made if attribute is not contained', async () => {
      const matchDescription = 'exact match';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.NOT_CONTAINS,
        matcher_description_value: matchDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
        assign_account_from_id: 3n,
        assign_account_to_id: 4n,
      });

      // Entirely different description - should match
      const transactionDescription = `some text and some more text`;
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      // there's a match - should not alter any transaction attribute apart from the ones defined by the matching rule
      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(transactionAmount);
      expect(result.type).toBe(transactionType);
      expect(result.date).toBe(date);
      expect(result.selectedAccountFromID).toBe(rule1.assign_account_from_id);
      expect(result.selectedAccountToID).toBe(rule1.assign_account_to_id);
      expect(result.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result.selectedEntityID).toBe(rule1.assign_entity_id);

      // Exact match - should NOT match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        matchDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      // there's NOT a match - should not alter any transaction attributes
      expect(result2).not.toBeNull();
      expect(result2.description).toBe(matchDescription);
      expect(result2.amount).toBeCloseTo(transactionAmount);
      expect(result2.type).toBe(transactionType);
      expect(result2.date).toBe(date);
      expect(result2.selectedAccountFromID).toBe(accountFromId);
      expect(result2.selectedAccountToID).toBe(accountToId);
      expect(result2.selectedCategoryID).toBe(undefined);
      expect(result2.selectedEntityID).toBe(undefined);

      // Partial match - should NOT match
      const partialMatchDescription = `some text ${matchDescription} and some more text`;
      const result3 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        partialMatchDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      // there's NOT a match - should not alter any transaction attributes
      expect(result3).not.toBeNull();
      expect(result3.description).toBe(partialMatchDescription);
      expect(result3.amount).toBeCloseTo(transactionAmount);
      expect(result3.type).toBe(transactionType);
      expect(result3.date).toBe(date);
      expect(result3.selectedAccountFromID).toBe(accountFromId);
      expect(result3.selectedAccountToID).toBe(accountToId);
      expect(result3.selectedCategoryID).toBe(undefined);
      expect(result3.selectedEntityID).toBe(undefined);
    });
  });

  describe('Amount matching', () => {
    test('When EQUAL matching is required, only an exact match will be made', async () => {
      const exactMatchAmount = 1990;
      const partialMatchAmount = 1991;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_amount_value: exactMatchAmount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
      });

      // Exact match - should match
      const transactionDescription = 'description';
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        exactMatchAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      // should not alter any transaction attribute apart from the assigned category
      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(exactMatchAmount);
      expect(result.type).toBe(transactionType);
      expect(result.selectedAccountFromID).toBe(accountFromId);
      expect(result.selectedAccountToID).toBe(accountToId);
      expect(result.date).toBe(date);
      expect(result.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result.selectedEntityID).toBe(rule1.assign_entity_id);

      // Partial match - should not match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        partialMatchAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      // should not alter any transaction attribute
      expect(result2).not.toBeNull();
      expect(result2.description).toBe(transactionDescription);
      expect(result2.amount).toBeCloseTo(partialMatchAmount);
      expect(result2.type).toBe(transactionType);
      expect(result2.selectedAccountFromID).toBe(accountFromId);
      expect(result2.selectedAccountToID).toBe(accountToId);
      expect(result2.date).toBe(date);
      expect(result2.selectedCategoryID).toBe(undefined);
      expect(result2.selectedEntityID).toBe(undefined);
    });
  });

  describe('Multiple attributes matching', () => {
    test('When matching is required for multiple attributes, only a match to all of them will be made', async () => {
      const matchDescription = 'match';
      const unmatchDescription = 'no m*tch';
      const matchAmount = 1990;
      const unmatchAmount = matchAmount + 0.01;
      const matchType = MYFIN.TRX_TYPES.INCOME;
      const unmatchType = MYFIN.TRX_TYPES.EXPENSE;
      const matchAccountFromId = 1n;
      const unmatchAccountFromId = 2n;
      const matchAccountToId = 3n;
      const unmatchAccountToId = 4n;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: matchDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_amount_value: matchAmount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_type_value: matchType,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_account_to_id_value: matchAccountToId,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_account_from_id_value: matchAccountFromId,
        assign_entity_id: matchedEntity.entity_id,
      });

      // Exact match - should match
      const transactionDescription = `this will be a partial match: ${matchDescription}`;
      const date = 1;

      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        matchAmount,
        matchType,
        matchAccountFromId,
        matchAccountToId,
        date
      );

      // there's a match - should not alter any transaction attribute apart from the ones defined by the matching rule
      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(matchAmount);
      expect(result.type).toBe(matchType);
      expect(result.selectedAccountFromID).toBe(matchAccountFromId);
      expect(result.selectedAccountToID).toBe(matchAccountToId);
      expect(result.date).toBe(date);
      expect(result.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result.selectedEntityID).toBe(rule1.assign_entity_id);

      // All match except description - should not match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        unmatchDescription,
        matchAmount,
        matchType,
        matchAccountFromId,
        matchAccountToId,
        date
      );

      // should not alter any transaction attribute
      expect(result2).not.toBeNull();
      expect(result2.description).toBe(unmatchDescription);
      expect(result2.amount).toBeCloseTo(matchAmount);
      expect(result2.type).toBe(matchType);
      expect(result2.selectedAccountFromID).toBe(matchAccountFromId);
      expect(result2.selectedAccountToID).toBe(matchAccountToId);
      expect(result2.date).toBe(date);
      expect(result2.selectedCategoryID).toBe(undefined);
      expect(result2.selectedEntityID).toBe(undefined);

      // All match except amount - should not match
      const result3 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        unmatchAmount,
        matchType,
        matchAccountFromId,
        matchAccountToId,
        date
      );

      // should not alter any transaction attribute
      expect(result3).not.toBeNull();
      expect(result3.description).toBe(transactionDescription);
      expect(result3.amount).toBeCloseTo(unmatchAmount);
      expect(result3.type).toBe(matchType);
      expect(result3.selectedAccountFromID).toBe(matchAccountFromId);
      expect(result3.selectedAccountToID).toBe(matchAccountToId);
      expect(result3.date).toBe(date);
      expect(result3.selectedCategoryID).toBe(undefined);
      expect(result3.selectedEntityID).toBe(undefined);

      // All match except type - should not match
      const result4 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        matchAmount,
        unmatchType,
        matchAccountFromId,
        matchAccountToId,
        date
      );

      // should not alter any transaction attribute
      expect(result4).not.toBeNull();
      expect(result4.description).toBe(transactionDescription);
      expect(result4.amount).toBeCloseTo(matchAmount);
      expect(result4.type).toBe(unmatchType);
      expect(result4.selectedAccountFromID).toBe(matchAccountFromId);
      expect(result4.selectedAccountToID).toBe(matchAccountToId);
      expect(result4.date).toBe(date);
      expect(result4.selectedCategoryID).toBe(undefined);
      expect(result4.selectedEntityID).toBe(undefined);

      // All match except account from - should not match
      const result5 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        matchAmount,
        matchType,
        unmatchAccountFromId,
        matchAccountToId,
        date
      );

      // should not alter any transaction attribute
      expect(result5).not.toBeNull();
      expect(result5.description).toBe(transactionDescription);
      expect(result5.amount).toBeCloseTo(matchAmount);
      expect(result5.type).toBe(matchType);
      expect(result5.selectedAccountFromID).toBe(unmatchAccountFromId);
      expect(result5.selectedAccountToID).toBe(matchAccountToId);
      expect(result5.date).toBe(date);
      expect(result5.selectedCategoryID).toBe(undefined);
      expect(result5.selectedEntityID).toBe(undefined);

      // All match except account to - should not match
      const result6 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        matchAmount,
        matchType,
        matchAccountFromId,
        unmatchAccountToId,
        date
      );

      // should not alter any transaction attribute
      expect(result6).not.toBeNull();
      expect(result6.description).toBe(transactionDescription);
      expect(result6.amount).toBeCloseTo(matchAmount);
      expect(result6.type).toBe(matchType);
      expect(result6.selectedAccountFromID).toBe(matchAccountFromId);
      expect(result6.selectedAccountToID).toBe(unmatchAccountToId);
      expect(result6.date).toBe(date);
      expect(result6.selectedCategoryID).toBe(undefined);
      expect(result6.selectedEntityID).toBe(undefined);
    });
  });
});
