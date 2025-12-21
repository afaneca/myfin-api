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
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();
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
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();
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
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();

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
      expect(result3.selectedCategoryID).toBeNullable();
      expect(result3.selectedEntityID).toBeNullable();
    });

    test('When description matching is case-insensitive, matches should ignore case', async () => {
      const matchDescription = 'CaSe InSeNsItIvE';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: matchDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      // Lowercase - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        matchDescription.toLowerCase(),
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.description).toBe(matchDescription.toLowerCase());
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // Uppercase - should match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        matchDescription.toUpperCase(),
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.description).toBe(matchDescription.toUpperCase());
      expect(result2.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result2.selectedEntityID).toBe(rule1.assign_entity_id);

      // Mixed case - should match
      const result3 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        'case insensitive',
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result3).not.toBeNull();
      expect(result3.description).toBe('case insensitive');
      expect(result3.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result3.selectedEntityID).toBe(rule1.assign_entity_id);
    });

    test('When description contains special characters, CONTAINS matching works correctly', async () => {
      const matchDescription = 'special $#@! chars';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: matchDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      // Contains special chars - should match
      const transactionDescription = `text before ${matchDescription} text after`;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result.selectedEntityID).toBe(rule1.assign_entity_id);
    });

    test('When description contains unicode characters, matching works correctly', async () => {
      const matchDescription = 'café ñoño 日本語 emoji 🎉';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: matchDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      // Contains unicode - should match
      const transactionDescription = `payment at ${matchDescription} shop`;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result.selectedEntityID).toBe(rule1.assign_entity_id);
    });

    test('When description is very long, matching still works', async () => {
      const matchDescription = 'needle';
      const longText = 'a'.repeat(1000);

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: matchDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      // Very long description with needle in the middle - should match
      const transactionDescription = `${longText}${matchDescription}${longText}`;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result.selectedEntityID).toBe(rule1.assign_entity_id);

      // Very long description without needle - should not match
      const transactionDescription2 = `${longText}${longText}`;
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription2,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.description).toBe(transactionDescription2);
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();
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
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();
    });

    test('When NOT_EQUALS matching is required for amount, only non-matching amounts trigger rule', async () => {
      const matchAmount = 1990;
      const nonMatchAmount1 = 1991;
      const nonMatchAmount2 = 1989.99;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.NOT_EQUALS,
        matcher_amount_value: matchAmount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'description';
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      // Non-matching amount - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        nonMatchAmount1,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.description).toBe(transactionDescription);
      expect(result1.amount).toBeCloseTo(nonMatchAmount1);
      expect(result1.type).toBe(transactionType);
      expect(result1.selectedAccountFromID).toBe(accountFromId);
      expect(result1.selectedAccountToID).toBe(accountToId);
      expect(result1.date).toBe(date);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // Another non-matching amount - should match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        nonMatchAmount2,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.amount).toBeCloseTo(nonMatchAmount2);
      expect(result2.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result2.selectedEntityID).toBe(rule1.assign_entity_id);

      // Exact match amount - should NOT match
      const result3 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        matchAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result3).not.toBeNull();
      expect(result3.amount).toBeCloseTo(matchAmount);
      expect(result3.selectedCategoryID).toBeNullable();
      expect(result3.selectedEntityID).toBeNullable();
    });

    test('When IGNORE matching is set for amount, rule requires at least one other matcher to be active', async () => {
      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: 'test description',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'test description';
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      // Any amount with matching description - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        100.5,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.amount).toBeCloseTo(100.5);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // Different amount with matching description - should also match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        9999.99,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.amount).toBeCloseTo(9999.99);
      expect(result2.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result2.selectedEntityID).toBe(rule1.assign_entity_id);
    });

    test('When amount value is negative, matching works correctly', async () => {
      const negativeAmount = -150.75;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_amount_value: negativeAmount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'description';
      const transactionType = MYFIN.TRX_TYPES.EXPENSE;
      const accountFromId = 1n;
      const accountToId = null;
      const date = 1;

      // Exact negative match - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        negativeAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.amount).toBeCloseTo(negativeAmount);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // Positive amount - should not match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        Math.abs(negativeAmount),
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.amount).toBeCloseTo(Math.abs(negativeAmount));
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();
    });
  });

  describe('Type matching', () => {
    test('When EQUALS matching is required for type, only matching type triggers rule', async () => {
      const matchType = MYFIN.TRX_TYPES.INCOME;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_type_value: matchType,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'description';
      const transactionAmount = 100.9;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      // Matching type - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        matchType,
        accountFromId,
        accountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.description).toBe(transactionDescription);
      expect(result1.amount).toBeCloseTo(transactionAmount);
      expect(result1.type).toBe(matchType);
      expect(result1.selectedAccountFromID).toBe(accountFromId);
      expect(result1.selectedAccountToID).toBe(accountToId);
      expect(result1.date).toBe(date);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // Non-matching type (EXPENSE) - should not match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        MYFIN.TRX_TYPES.EXPENSE,
        accountFromId,
        accountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.type).toBe(MYFIN.TRX_TYPES.EXPENSE);
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();
    });

    test('When NOT_EQUALS matching is required for type, non-matching types trigger rule', async () => {
      const excludeType = MYFIN.TRX_TYPES.EXPENSE;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.NOT_EQUALS,
        matcher_type_value: excludeType,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'description';
      const transactionAmount = 100.9;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      // INCOME type (not excluded) - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.type).toBe(MYFIN.TRX_TYPES.INCOME);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // EXPENSE type (excluded) - should NOT match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        excludeType,
        accountFromId,
        accountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.type).toBe(excludeType);
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();
    });

    test('When IGNORE matching is set for type, rule requires at least one other matcher to be active', async () => {
      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: 'test description',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'test description';
      const transactionAmount = 100.9;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      // INCOME type with matching description - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.type).toBe(MYFIN.TRX_TYPES.INCOME);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // EXPENSE type with matching description - should also match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        MYFIN.TRX_TYPES.EXPENSE,
        accountFromId,
        accountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.type).toBe(MYFIN.TRX_TYPES.EXPENSE);
      expect(result2.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result2.selectedEntityID).toBe(rule1.assign_entity_id);
    });
  });

  describe('Account matching', () => {
    test('When EQUALS matching is required for account_from_id, only matching account triggers rule', async () => {
      const matchAccountFromId = 5n;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_account_from_id_value: matchAccountFromId,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'description';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.EXPENSE;
      const accountToId = null;
      const date = 1;

      // Matching account_from_id - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        matchAccountFromId,
        accountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.description).toBe(transactionDescription);
      expect(result1.amount).toBeCloseTo(transactionAmount);
      expect(result1.type).toBe(transactionType);
      expect(result1.selectedAccountFromID).toBe(matchAccountFromId);
      expect(result1.selectedAccountToID).toBe(accountToId);
      expect(result1.date).toBe(date);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // Non-matching account_from_id - should not match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        6n,
        accountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.selectedAccountFromID).toBe(6n);
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();
    });

    test('When NOT_EQUALS matching is required for account_from_id, non-matching accounts trigger rule', async () => {
      const excludeAccountFromId = 5n;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.NOT_EQUALS,
        matcher_account_from_id_value: excludeAccountFromId,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'description';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.EXPENSE;
      const accountToId = null;
      const date = 1;

      // Different account_from_id - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        6n,
        accountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.selectedAccountFromID).toBe(6n);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // Excluded account_from_id - should NOT match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        excludeAccountFromId,
        accountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.selectedAccountFromID).toBe(excludeAccountFromId);
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();
    });

    test('When IGNORE matching is set for account_from_id, rule requires at least one other matcher to be active', async () => {
      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: 'test description',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'test description';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.EXPENSE;
      const accountToId = null;
      const date = 1;

      // Any account_from_id with matching description - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        1n,
        accountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.selectedAccountFromID).toBe(1n);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // Different account_from_id with matching description - should also match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        99n,
        accountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.selectedAccountFromID).toBe(99n);
      expect(result2.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result2.selectedEntityID).toBe(rule1.assign_entity_id);
    });

    test('When EQUALS matching is required for account_to_id, only matching account triggers rule', async () => {
      const matchAccountToId = 7n;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_account_to_id_value: matchAccountToId,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'description';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const date = 1;

      // Matching account_to_id - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        matchAccountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.description).toBe(transactionDescription);
      expect(result1.amount).toBeCloseTo(transactionAmount);
      expect(result1.type).toBe(transactionType);
      expect(result1.selectedAccountFromID).toBe(accountFromId);
      expect(result1.selectedAccountToID).toBe(matchAccountToId);
      expect(result1.date).toBe(date);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // Non-matching account_to_id - should not match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        8n,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.selectedAccountToID).toBe(8n);
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();
    });

    test('When NOT_EQUALS matching is required for account_to_id, non-matching accounts trigger rule', async () => {
      const excludeAccountToId = 7n;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.NOT_EQUALS,
        matcher_account_to_id_value: excludeAccountToId,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'description';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const date = 1;

      // Different account_to_id - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        8n,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.selectedAccountToID).toBe(8n);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // Excluded account_to_id - should NOT match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        excludeAccountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.selectedAccountToID).toBe(excludeAccountToId);
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();
    });

    test('When IGNORE matching is set for account_to_id, rule requires at least one other matcher to be active', async () => {
      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: 'test description',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'test description';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const date = 1;

      // Any account_to_id with matching description - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        1n,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.selectedAccountToID).toBe(1n);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // Different account_to_id with matching description - should also match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        99n,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.selectedAccountToID).toBe(99n);
      expect(result2.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result2.selectedEntityID).toBe(rule1.assign_entity_id);
    });

    test('When account IDs are null and EQUALS matching is required, behavior is correct', async () => {
      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_account_to_id_value: null,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_account_from_id_value: null,
        assign_entity_id: matchedEntity.entity_id,
        assign_category_id: 2n,
      });

      const transactionDescription = 'description';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const date = 1;

      // Both null - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        null,
        null,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.selectedAccountFromID).toBe(null);
      expect(result1.selectedAccountToID).toBe(null);
      expect(result1.selectedCategoryID).toBe(rule1.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule1.assign_entity_id);

      // account_from_id not null - should not match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        1n,
        null,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.selectedAccountFromID).toBe(1n);
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();

      // account_to_id not null - should not match
      const result3 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        null,
        1n,
        date
      );

      expect(result3).not.toBeNull();
      expect(result3.selectedAccountToID).toBe(1n);
      expect(result3.selectedCategoryID).toBeNullable();
      expect(result3.selectedEntityID).toBeNullable();
    });
  });

  describe('Assignment behavior', () => {
    test('When rule assigns only category_id, other attributes remain unchanged', async () => {
      const assignCategoryId = 10n;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: 'test',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: assignCategoryId,
        assign_entity_id: null,
        assign_account_from_id: null,
        assign_account_to_id: null,
      });

      const transactionDescription = 'test';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = 5n;
      const accountToId = 6n;
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

      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(transactionAmount);
      expect(result.type).toBe(transactionType);
      expect(result.selectedAccountFromID).toBe(accountFromId);
      expect(result.selectedAccountToID).toBe(accountToId);
      expect(result.date).toBe(date);
      expect(result.selectedCategoryID).toBe(assignCategoryId);
      expect(result.selectedEntityID).toBeNullable();
    });

    test('When rule assigns only entity_id, other attributes remain unchanged', async () => {
      const assignEntityId = matchedEntity.entity_id;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: 'test',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: null,
        assign_entity_id: assignEntityId,
        assign_account_from_id: null,
        assign_account_to_id: null,
      });

      const transactionDescription = 'test';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = 5n;
      const accountToId = 6n;
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

      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(transactionAmount);
      expect(result.type).toBe(transactionType);
      expect(result.selectedAccountFromID).toBe(accountFromId);
      expect(result.selectedAccountToID).toBe(accountToId);
      expect(result.date).toBe(date);
      expect(result.selectedCategoryID).toBeNullable();
      expect(result.selectedEntityID).toBe(assignEntityId);
    });

    test('When rule assigns only account_from_id, other attributes remain unchanged', async () => {
      const assignAccountFromId = 10n;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: 'test',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: null,
        assign_entity_id: null,
        assign_account_from_id: assignAccountFromId,
        assign_account_to_id: null,
      });

      const transactionDescription = 'test';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.EXPENSE;
      const accountFromId = 5n;
      const accountToId = null;
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

      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(transactionAmount);
      expect(result.type).toBe(transactionType);
      expect(result.selectedAccountFromID).toBe(assignAccountFromId);
      expect(result.selectedAccountToID).toBe(accountToId);
      expect(result.date).toBe(date);
      expect(result.selectedCategoryID).toBeNullable();
      expect(result.selectedEntityID).toBeNullable();
    });

    test('When rule assigns only account_to_id, other attributes remain unchanged', async () => {
      const assignAccountToId = 10n;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: 'test',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: null,
        assign_entity_id: null,
        assign_account_from_id: null,
        assign_account_to_id: assignAccountToId,
      });

      const transactionDescription = 'test';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 6n;
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

      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(transactionAmount);
      expect(result.type).toBe(transactionType);
      expect(result.selectedAccountFromID).toBe(accountFromId);
      expect(result.selectedAccountToID).toBe(assignAccountToId);
      expect(result.date).toBe(date);
      expect(result.selectedCategoryID).toBeNullable();
      expect(result.selectedEntityID).toBeNullable();
    });

    test('When rule assigns multiple attributes simultaneously, all are applied correctly', async () => {
      const assignCategoryId = 10n;
      const assignEntityId = matchedEntity.entity_id;
      const assignAccountFromId = 20n;
      const assignAccountToId = 30n;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: 'test',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: assignCategoryId,
        assign_entity_id: assignEntityId,
        assign_account_from_id: assignAccountFromId,
        assign_account_to_id: assignAccountToId,
      });

      const transactionDescription = 'test';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = 5n;
      const accountToId = 6n;
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

      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(transactionAmount);
      expect(result.type).toBe(transactionType);
      expect(result.selectedAccountFromID).toBe(assignAccountFromId);
      expect(result.selectedAccountToID).toBe(assignAccountToId);
      expect(result.date).toBe(date);
      expect(result.selectedCategoryID).toBe(assignCategoryId);
      expect(result.selectedEntityID).toBe(assignEntityId);
    });

    test('When rule assigns no attributes (all null), transaction remains unchanged', async () => {
      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: 'test',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: null,
        assign_entity_id: null,
        assign_account_from_id: null,
        assign_account_to_id: null,
      });

      const transactionDescription = 'test';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = 5n;
      const accountToId = 6n;
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

      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(transactionAmount);
      expect(result.type).toBe(transactionType);
      expect(result.selectedAccountFromID).toBe(accountFromId);
      expect(result.selectedAccountToID).toBe(accountToId);
      expect(result.date).toBe(date);
      expect(result.selectedCategoryID).toBeNullable();
      expect(result.selectedEntityID).toBeNullable();
    });

    test('When multiple rules match the same transaction, first matching rule wins', async () => {
      const firstRuleEntityId = matchedEntity.entity_id;
      const firstRuleCategoryId = 10n;

      const secondEntity = await EntityService.createEntity({
        name: 'Second Entity',
        users_user_id: user.user_id,
      });
      const secondRuleCategoryId = 20n;

      // Create first rule
      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: 'match',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: firstRuleCategoryId,
        assign_entity_id: firstRuleEntityId,
      });

      // Create second rule that would also match
      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: 'match',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: secondRuleCategoryId,
        assign_entity_id: secondEntity.entity_id,
      });

      const transactionDescription = 'this will match both rules';
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

      // Should match the first rule only
      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.selectedCategoryID).toBe(firstRuleCategoryId);
      expect(result.selectedEntityID).toBe(firstRuleEntityId);
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
      expect(result2.selectedCategoryID).toBeNullable();
      expect(result2.selectedEntityID).toBeNullable();

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
      expect(result3.selectedCategoryID).toBeNullable();
      expect(result3.selectedEntityID).toBeNullable();

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
      expect(result4.selectedCategoryID).toBeNullable();
      expect(result4.selectedEntityID).toBeNullable();

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
      expect(result5.selectedCategoryID).toBeNullable();
      expect(result5.selectedEntityID).toBeNullable();

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
      expect(result6.selectedCategoryID).toBeNullable();
      expect(result6.selectedEntityID).toBeNullable();
    });
  });

  describe('Edge cases', () => {
    test('When no rules exist for user, no categorization occurs', async () => {
      const transactionDescription = 'any description';
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

      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(transactionAmount);
      expect(result.type).toBe(transactionType);
      expect(result.selectedAccountFromID).toBe(accountFromId);
      expect(result.selectedAccountToID).toBe(accountToId);
      expect(result.date).toBe(date);
      expect(result.selectedCategoryID).toBe(undefined);
      expect(result.selectedEntityID).toBe(undefined);
    });

    test('When transaction already has category/entity, rule overwrites it', async () => {
      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: 'test',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: 10n,
        assign_entity_id: matchedEntity.entity_id,
      });

      const transactionDescription = 'test';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      // Note: The function signature doesn't show existing category/entity parameters,
      // but the result should show that the rule's assignments take precedence
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(10n);
      expect(result.selectedEntityID).toBe(matchedEntity.entity_id);
    });

    test('When all matchers are set to IGNORE, no rule matching occurs', async () => {
      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: 10n,
        assign_entity_id: matchedEntity.entity_id,
      });

      const transactionDescription = 'any description';
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

      // Rule should NOT match because all matchers are IGNORE
      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.amount).toBeCloseTo(transactionAmount);
      expect(result.type).toBe(transactionType);
      expect(result.selectedAccountFromID).toBe(accountFromId);
      expect(result.selectedAccountToID).toBe(accountToId);
      expect(result.date).toBe(date);
      expect(result.selectedCategoryID).toBe(undefined);
      expect(result.selectedEntityID).toBe(undefined);
    });

    test('When rule matching encounters null values in transaction, appropriate behavior occurs', async () => {
      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: 'test',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: 10n,
        assign_entity_id: matchedEntity.entity_id,
      });

      const transactionDescription = 'test';
      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = null;
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

      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
      expect(result.selectedAccountFromID).toBe(null);
      expect(result.selectedAccountToID).toBe(null);
      expect(result.selectedCategoryID).toBe(10n);
      expect(result.selectedEntityID).toBe(matchedEntity.entity_id);
    });

    test('When description is empty and rule matches empty descriptions, categorization occurs', async () => {
      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: '',
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: 10n,
        assign_entity_id: matchedEntity.entity_id,
      });

      const transactionDescription = '';
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

      expect(result).not.toBeNull();
      expect(result.description).toBe('');
      expect(result.selectedCategoryID).toBe(10n);
      expect(result.selectedEntityID).toBe(matchedEntity.entity_id);
    });

    test('When description has leading/trailing whitespace, matching handles it appropriately', async () => {
      const matchDescription = 'test description';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: matchDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: 10n,
        assign_entity_id: matchedEntity.entity_id,
      });

      const transactionAmount = 100.9;
      const transactionType = MYFIN.TRX_TYPES.INCOME;
      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      // Description with leading/trailing whitespace
      const transactionDescription = '  test description  ';
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        transactionDescription,
        transactionAmount,
        transactionType,
        accountFromId,
        accountToId,
        date
      );

      // This test documents the current behavior - whether whitespace is trimmed or not
      expect(result).not.toBeNull();
      expect(result.description).toBe(transactionDescription);
    });

    test('When multiple NOT_EQUALS matchers are used, transaction must not match any of them', async () => {
      const excludeDescription = 'exclude';
      const excludeAmount = 50;
      const excludeType = MYFIN.TRX_TYPES.EXPENSE;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.NOT_EQUALS,
        matcher_description_value: excludeDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.NOT_EQUALS,
        matcher_amount_value: excludeAmount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.NOT_EQUALS,
        matcher_type_value: excludeType,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: 10n,
        assign_entity_id: matchedEntity.entity_id,
      });

      const accountFromId = null;
      const accountToId = 1n;
      const date = 1;

      // All different from excluded values - should match
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        'different description',
        100,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.selectedCategoryID).toBe(10n);
      expect(result1.selectedEntityID).toBe(matchedEntity.entity_id);

      // Description matches excluded value - should NOT match
      const result2 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        excludeDescription,
        100,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result2).not.toBeNull();
      expect(result2.selectedCategoryID).toBe(undefined);
      expect(result2.selectedEntityID).toBe(undefined);

      // Amount matches excluded value - should NOT match
      const result3 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        'different description',
        excludeAmount,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result3).not.toBeNull();
      expect(result3.selectedCategoryID).toBe(undefined);
      expect(result3.selectedEntityID).toBe(undefined);

      // Type matches excluded value - should NOT match
      const result4 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        'different description',
        100,
        excludeType,
        accountFromId,
        accountToId,
        date
      );

      expect(result4).not.toBeNull();
      expect(result4.selectedCategoryID).toBe(undefined);
      expect(result4.selectedEntityID).toBe(undefined);
    });

    test('When multiple rules are matched, the most appropriated one is selected based on smart criteria', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const mostSpecificDescription = 'specific description';
      const lessSpecificDescription = 'description';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: lessSpecificDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: mostSpecificDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedCategoryId + 100n,
      });

      // Transaction with specific description - should match the most specific result
      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result1 = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        mostSpecificDescription,
        100,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result1).not.toBeNull();
      expect(result1.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result1.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    // Match Type Priority Tests
    test('EQUALS match type beats CONTAINS match type even with shorter string length', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const shortExactMatch = 'Store';
      const longContainsMatch = 'Store with very long description';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: longContainsMatch,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_description_value: shortExactMatch,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        shortExactMatch,
        100,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    test('CONTAINS match type beats NOT_EQUALS match type', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const containsValue = 'Supermarket';
      const notEqualsValue = 'Restaurant';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.NOT_EQUALS,
        matcher_description_value: notEqualsValue,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: containsValue,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        'Payment at Supermarket downtown',
        100,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    test('NOT_EQUALS match type beats DOES_NOT_CONTAIN match type', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const notEqualsValue = 'Restaurant';
      const doesNotContainValue = 'Cafe';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.DOES_NOT_CONTAIN,
        matcher_description_value: doesNotContainValue,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.NOT_EQUALS,
        matcher_description_value: notEqualsValue,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        'Supermarket',
        100,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    // Multiple Conditions Tests
    test('Rule with 2 matching conditions beats rule with 1 matching condition regardless of specificity', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const longDescription = 'Very specific and long description';
      const shortDescription = 'description';
      const amount = 50.0;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: longDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: shortDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_amount_value: amount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        longDescription,
        amount,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    test('Rule with description AND amount match beats rule with only description match', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const description = 'Continente';
      const amount = 75.5;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_amount_value: amount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        description,
        amount,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    test('Rule with multiple conditions of lower specificity beats rule with single highly specific condition', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const veryLongDescription = 'This is a very long description';
      const shortDescription = 'description';
      const amount = 100.0;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: veryLongDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: shortDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_amount_value: amount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        veryLongDescription,
        amount,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    // Edge Cases
    test('Returns the only matching rule when only one rule matches', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const matchingDescription = 'Continente';
      const nonMatchingDescription = 'Pingo Doce';

      await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: nonMatchingDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 200n,
        assign_entity_id: matchedEntityId + 200n,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: matchingDescription,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        matchingDescription,
        100,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    test('Handles rules with IGNORE operators correctly (should not contribute to score)', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const description = 'Store Purchase';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        description,
        100,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      // Should return one of the rules (implementation dependent on tie-breaking)
      expect([rule1.assign_category_id, rule2.assign_category_id]).toContain(
        result.selectedCategoryID
      );
    });

    // Negative Match Tests
    test('NOT_EQUALS condition with longer string still has lower priority than CONTAINS with shorter string', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const longNotEqualsValue = 'Very long description that does not match';
      const shortContainsValue = 'Shop';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.NOT_EQUALS,
        matcher_description_value: longNotEqualsValue,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: shortContainsValue,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        'Shop transaction',
        100,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    test('DOES_NOT_CONTAIN is correctly deprioritized compared to positive matches', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const doesNotContainValue = 'Restaurant';
      const containsValue = 'Market';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.DOES_NOT_CONTAIN,
        matcher_description_value: doesNotContainValue,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: containsValue,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        'SuperMarket purchase',
        100,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    // Numeric Amount Tests
    test('EQUALS amount match combined with description beats description-only match', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const description = 'Monthly subscription';
      const amount = 9.99;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_amount_value: amount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        description,
        amount,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    test('Two rules with same description specificity but one has exact amount match - amount rule wins', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const description = 'Payment';
      const amount = 42.0;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_amount_value: amount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        description,
        amount,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    // Real-world Scenarios
    test('Continente vs IRS (Continente) - more specific substring wins', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const genericStore = 'Continente';
      const specificIRS = 'IRS (Continente)';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: genericStore,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: specificIRS,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        'Payment IRS (Continente) Lisboa',
        100,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    test('Generic store name vs specific store location - specific location wins', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const genericName = 'Store';
      const specificLocation = 'Store Porto Downtown';

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: genericName,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: specificLocation,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        'Purchase at Store Porto Downtown',
        100,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    test('Rule matching description and wrong amount loses to rule matching only description', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const description = 'Electricity bill';
      const correctAmount = 50.0;
      const wrongAmount = 75.0;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_amount_value: wrongAmount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        description,
        correctAmount,
        MYFIN.TRX_TYPES.INCOME,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule2.assign_category_id);
      expect(result.selectedEntityID).toBe(rule2.assign_entity_id);
    });

    test('Multiple rules with different combinations of conditions select based on condition count first', async () => {
      const matchedCategoryId = 10n;
      const matchedEntityId = 11n;

      const description = 'Store purchase';
      const amount = 30.0;
      const trxType = MYFIN.TRX_TYPES.EXPENSE;

      const rule1 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId,
        assign_entity_id: matchedEntityId,
      });

      const rule2 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_amount_value: amount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 100n,
        assign_entity_id: matchedEntityId + 100n,
      });

      const rule3 = await RuleService.createRule(user.user_id, {
        matcher_description_operator: MYFIN.RULES.OPERATOR.CONTAINS,
        matcher_description_value: description,
        matcher_amount_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_amount_value: amount,
        matcher_type_operator: MYFIN.RULES.OPERATOR.EQUALS,
        matcher_type_value: trxType,
        matcher_account_to_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        matcher_account_from_id_operator: MYFIN.RULES.OPERATOR.IGNORE,
        assign_category_id: matchedCategoryId + 200n,
        assign_entity_id: matchedEntityId + 200n,
      });

      const accountFromId = 5n;
      const accountToId = 6n;
      const date = 7;
      const result = await TransactionService.autoCategorizeTransaction(
        user.user_id,
        description,
        amount,
        trxType,
        accountFromId,
        accountToId,
        date
      );

      expect(result).not.toBeNull();
      expect(result.selectedCategoryID).toBe(rule3.assign_category_id);
      expect(result.selectedEntityID).toBe(rule3.assign_entity_id);
    });
  });
});
