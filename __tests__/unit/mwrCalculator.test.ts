import { describe, expect, test } from 'vitest';
import MWRCalculator from '../../src/utils/MWRCalculator.js';

/**
 * MWR Calculator Tests
 *
 * These tests verify the Modified Dietz method implementation for calculating
 * Money-Weighted Return (MWR). The Modified Dietz method approximates IRR
 * by weighting cash flows based on the time they were in the portfolio.
 */

describe('MWRCalculator', () => {
  describe('annualizeMWR', () => {
    test('Should return same value for full year', () => {
      const yearlyMWR = 0.12; // 12%
      const annualized = MWRCalculator.annualizeMWR(yearlyMWR, 12);

      expect(annualized).toBeCloseTo(yearlyMWR, 6);
    });

    test('Should annualize 6-month return correctly', () => {
      const halfYearMWR = 0.05; // 5% in 6 months
      const annualized = MWRCalculator.annualizeMWR(halfYearMWR, 6);

      // Annualized: (1.05)^2 - 1 = 0.1025 = 10.25%
      expect(annualized).toBeCloseTo(0.1025, 4);
    });

    test('Should annualize 3-month return correctly', () => {
      const quarterMWR = 0.02; // 2% in 3 months
      const annualized = MWRCalculator.annualizeMWR(quarterMWR, 3);

      // Annualized: (1.02)^4 - 1 = 0.0824 = 8.24%
      expect(annualized).toBeCloseTo(0.0824, 4);
    });

    test('Should handle zero months edge case', () => {
      const mwr = 0.12;
      const annualized = MWRCalculator.annualizeMWR(mwr, 0);

      expect(annualized).toBe(0);
    });
  });

  describe('calculateModifiedDietzWithTransactions - Transaction-based MWR', () => {
    // Helper to create Unix timestamps for specific dates
    const toUnixTimestamp = (year: number, month: number, day: number): number => {
      return Math.floor(new Date(year, month - 1, day).getTime() / 1000);
    };

    test('Should return 0% MWR with no gains or losses', () => {
      const beginningValue = 0;
      const endingValue = 1000;
      const periodStart = toUnixTimestamp(2025, 1, 1);
      const periodEnd = toUnixTimestamp(2025, 12, 31);

      const transactions = [
        {
          date_timestamp: toUnixTimestamp(2025, 1, 15),
          trx_type: 'B',
          total_price: 100000n, // $1000 in cents
          fees_taxes_amount: 0n,
        },
      ];

      const { mwr } = MWRCalculator.calculateModifiedDietzWithTransactions(
        beginningValue,
        endingValue,
        transactions,
        periodStart,
        periodEnd
      );
      // Expected: 0% return (no gain)
      expect(mwr).toBeCloseTo(0, 2);
    });

    test('Should calculate positive MWR with gains', () => {
      const beginningValue = 0;
      const endingValue = 1100;
      const periodStart = toUnixTimestamp(2025, 1, 1);
      const periodEnd = toUnixTimestamp(2025, 12, 31);

      const transactions = [
        {
          date_timestamp: toUnixTimestamp(2025, 1, 15),
          trx_type: 'B',
          total_price: 100000n, // $1000 in cents
          fees_taxes_amount: 0n,
        },
      ];

      const { mwr } = MWRCalculator.calculateModifiedDietzWithTransactions(
        beginningValue,
        endingValue,
        transactions,
        periodStart,
        periodEnd
      );

      // Expected: ~10% return ($100 gain on $1000)
      expect(mwr).toBeGreaterThan(0.09);
      expect(mwr).toBeLessThan(0.12);
    });

    test('Should calculate negative MWR with losses', () => {
      const beginningValue = 0;
      const endingValue = 900;
      const periodStart = toUnixTimestamp(2025, 1, 1);
      const periodEnd = toUnixTimestamp(2025, 12, 31);

      const transactions = [
        {
          date_timestamp: toUnixTimestamp(2025, 1, 15),
          trx_type: 'B',
          total_price: 100000n, // $1000 in cents
          fees_taxes_amount: 0n,
        },
      ];

      const { mwr } = MWRCalculator.calculateModifiedDietzWithTransactions(
        beginningValue,
        endingValue,
        transactions,
        periodStart,
        periodEnd
      );

      // Expected: ~-10% return ($100 loss on $1000)
      expect(mwr).toBeLessThan(0);
      expect(mwr).toBeGreaterThan(-0.12);
    });

    test('Should weight early transactions more heavily than late ones', () => {
      const periodStart = toUnixTimestamp(2025, 1, 1);
      const periodEnd = toUnixTimestamp(2025, 12, 31);

      // Scenario 1: Buy early, portfolio grows
      const earlyBuyTransactions = [
        {
          date_timestamp: toUnixTimestamp(2025, 1, 15), // Early in year
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
        },
      ];

      // Scenario 2: Buy late, portfolio grows same absolute amount
      const lateBuyTransactions = [
        {
          date_timestamp: toUnixTimestamp(2025, 11, 15), // Late in year
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
        },
      ];

      const { mwr: earlyMWR } = MWRCalculator.calculateModifiedDietzWithTransactions(
        0,
        1100, // $100 gain
        earlyBuyTransactions,
        periodStart,
        periodEnd
      );

      const { mwr: lateMWR } = MWRCalculator.calculateModifiedDietzWithTransactions(
        0,
        1100, // $100 gain
        lateBuyTransactions,
        periodStart,
        periodEnd
      );

      // Late investment with same gain should show higher MWR
      // because money was at risk for less time
      expect(lateMWR).toBeGreaterThan(earlyMWR);
    });

    test('Should handle sell transactions correctly', () => {
      const beginningValue = 1000;
      const endingValue = 600; // After selling $500, remaining is worth $600
      const periodStart = toUnixTimestamp(2025, 1, 1);
      const periodEnd = toUnixTimestamp(2025, 12, 31);

      const transactions = [
        {
          date_timestamp: toUnixTimestamp(2025, 6, 15),
          trx_type: 'S',
          total_price: 50000n, // Sold $500 worth
          fees_taxes_amount: 0n,
        },
      ];

      const { mwr, totalNetFlows } = MWRCalculator.calculateModifiedDietzWithTransactions(
        beginningValue,
        endingValue,
        transactions,
        periodStart,
        periodEnd
      );

      // Sell = money in = negative flow
      expect(totalNetFlows).toBeLessThan(0);
      // Gain = 600 - 1000 - (-500) = 600 - 1000 + 500 = 100
      expect(mwr).toBeGreaterThan(0);
    });

    test('Should handle income transactions correctly', () => {
      const beginningValue = 1000;
      const endingValue = 1000; // Same value
      const periodStart = toUnixTimestamp(2025, 1, 1);
      const periodEnd = toUnixTimestamp(2025, 12, 31);

      const transactions = [
        {
          date_timestamp: toUnixTimestamp(2025, 6, 15),
          trx_type: 'I',
          total_price: 5000n, // $50 income (dividend)
          fees_taxes_amount: 0n,
        },
      ];

      const { mwr, totalNetFlows } = MWRCalculator.calculateModifiedDietzWithTransactions(
        beginningValue,
        endingValue,
        transactions,
        periodStart,
        periodEnd
      );

      // Income = money in = negative flow
      expect(totalNetFlows).toBeLessThan(0);
      // Even though value stayed same, we received income so MWR > 0
      expect(mwr).toBeGreaterThan(0);
    });

    test('Should handle external fees correctly (fees_taxes_units = 0)', () => {
      const beginningValue = 0;
      const endingValue = 1000;
      const periodStart = toUnixTimestamp(2025, 1, 1);
      const periodEnd = toUnixTimestamp(2025, 12, 31);

      const transactionsWithFees = [
        {
          date_timestamp: toUnixTimestamp(2025, 1, 15),
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 1000n, // $10 fees
          fees_taxes_units: 0, // External fees
        },
      ];

      const transactionsWithoutFees = [
        {
          date_timestamp: toUnixTimestamp(2025, 1, 15),
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
          fees_taxes_units: 0,
        },
      ];

      const { mwr: mwrWithFees } = MWRCalculator.calculateModifiedDietzWithTransactions(
        beginningValue,
        endingValue,
        transactionsWithFees,
        periodStart,
        periodEnd
      );

      const { mwr: mwrWithoutFees } = MWRCalculator.calculateModifiedDietzWithTransactions(
        beginningValue,
        endingValue,
        transactionsWithoutFees,
        periodStart,
        periodEnd
      );

      // MWR with external fees should be lower (fees reduce returns)
      expect(mwrWithFees).toBeLessThan(mwrWithoutFees);
    });

    test('Should NOT count internal fees in net flow (fees_taxes_units > 0)', () => {
      const beginningValue = 0;
      const endingValue = 1000;
      const periodStart = toUnixTimestamp(2025, 1, 1);
      const periodEnd = toUnixTimestamp(2025, 12, 31);

      const transactionsWithInternalFees = [
        {
          date_timestamp: toUnixTimestamp(2025, 1, 15),
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 1000n, // $10 fees amount
          fees_taxes_units: 0.5, // Internal fees (paid in units) - should NOT be counted
        },
      ];

      const transactionsWithoutFees = [
        {
          date_timestamp: toUnixTimestamp(2025, 1, 15),
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
          fees_taxes_units: 0,
        },
      ];

      const { mwr: mwrWithInternalFees } = MWRCalculator.calculateModifiedDietzWithTransactions(
        beginningValue,
        endingValue,
        transactionsWithInternalFees,
        periodStart,
        periodEnd
      );

      const { mwr: mwrWithoutFees } = MWRCalculator.calculateModifiedDietzWithTransactions(
        beginningValue,
        endingValue,
        transactionsWithoutFees,
        periodStart,
        periodEnd
      );

      // MWR with internal fees should be the same as without fees
      // because internal fees are already reflected in the asset units
      expect(mwrWithInternalFees).toBeCloseTo(mwrWithoutFees, 4);
    });

    test('Should handle multiple transactions throughout the year', () => {
      const beginningValue = 0;
      const endingValue = 3300; // $300 gain on $3000 total invested
      const periodStart = toUnixTimestamp(2025, 1, 1);
      const periodEnd = toUnixTimestamp(2025, 12, 31);

      const transactions = [
        {
          date_timestamp: toUnixTimestamp(2025, 2, 10),
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
        },
        {
          date_timestamp: toUnixTimestamp(2025, 5, 20),
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
        },
        {
          date_timestamp: toUnixTimestamp(2025, 9, 5),
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
        },
      ];

      const { mwr, totalNetFlows } = MWRCalculator.calculateModifiedDietzWithTransactions(
        beginningValue,
        endingValue,
        transactions,
        periodStart,
        periodEnd
      );

      expect(totalNetFlows).toBe(3000); // $3000 total invested
      expect(mwr).toBeGreaterThan(0); // Positive return
    });

    test('Should handle empty transactions array', () => {
      const beginningValue = 1000;
      const endingValue = 1100;
      const periodStart = toUnixTimestamp(2025, 1, 1);
      const periodEnd = toUnixTimestamp(2025, 12, 31);

      const { mwr, totalNetFlows } = MWRCalculator.calculateModifiedDietzWithTransactions(
        beginningValue,
        endingValue,
        [],
        periodStart,
        periodEnd
      );

      expect(totalNetFlows).toBe(0);
      // Pure appreciation: (1100 - 1000) / 1000 = 10%
      expect(mwr).toBeCloseTo(0.1, 2);
    });

    test('Should handle transactions with only sells/income and no beginning value (negative denominator case)', () => {
      const beginningValue = 0;
      const endingValue = 0;
      const periodStart = toUnixTimestamp(2025, 1, 1);
      const periodEnd = toUnixTimestamp(2025, 12, 31);

      // Transactions that only provide money IN (negative flow)
      const transactions = [
        {
          date_timestamp: toUnixTimestamp(2025, 6, 15),
          trx_type: 'I',
          total_price: 5000n, // $50 income
          fees_taxes_amount: 0n,
        },
        {
          date_timestamp: toUnixTimestamp(2025, 8, 20),
          trx_type: 'S',
          total_price: 20000n, // $200 sell
          fees_taxes_amount: 0n,
        },
      ];

      const { mwr, totalNetFlows } = MWRCalculator.calculateModifiedDietzWithTransactions(
        beginningValue,
        endingValue,
        transactions,
        periodStart,
        periodEnd
      );

      // totalNetFlows should be -250 (money in)
      expect(totalNetFlows).toBe(-250);
      // MWR should be 0 because denominator is negative (weighted flows are negative)
      // and we handle this edge case by returning 0 to avoid nonsensical values
      expect(mwr).toBe(0);
    });
  });
});
