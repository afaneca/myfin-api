import { describe, expect, test } from 'vitest';
import ROICalculator from '../../src/utils/ROICalculator.js';

/**
 * ROI Calculator Tests
 *
 * These tests verify the simple ROI calculation:
 * ROI = Net Return / Cost of Investment
 *
 * Where:
 * - Net Return = Current Value - Total Money Out + Total Money In
 * - Cost of Investment = Total Money Out
 */

describe('ROICalculator', () => {
  describe('calculateROI', () => {
    test('Should return 0% ROI with no gains or losses', () => {
      const currentValue = 1000;
      const transactions = [
        {
          date_timestamp: 1704067200, // Jan 1, 2024
          trx_type: 'B',
          total_price: 100000n, // $1000 in cents
          fees_taxes_amount: 0n,
        },
      ];

      const { roiPercentage, roiValue } = ROICalculator.calculateROI(currentValue, transactions);

      // No gain/loss: ROI = 0
      expect(roiValue).toBe(0);
      expect(roiPercentage).toBeCloseTo(0, 4);
    });

    test('Should calculate positive ROI with gains', () => {
      const currentValue = 1100; // $100 gain
      const transactions = [
        {
          date_timestamp: 1704067200,
          trx_type: 'B',
          total_price: 100000n, // $1000 in cents
          fees_taxes_amount: 0n,
        },
      ];

      const { roiPercentage, roiValue } = ROICalculator.calculateROI(currentValue, transactions);

      // ROI Value = 1100 - 1000 = 100
      expect(roiValue).toBe(100);
      // ROI % = 100 / 1000 = 10%
      expect(roiPercentage).toBeCloseTo(0.1, 4);
    });

    test('Should calculate negative ROI with losses', () => {
      const currentValue = 900; // $100 loss
      const transactions = [
        {
          date_timestamp: 1704067200,
          trx_type: 'B',
          total_price: 100000n, // $1000 in cents
          fees_taxes_amount: 0n,
        },
      ];

      const { roiPercentage, roiValue } = ROICalculator.calculateROI(currentValue, transactions);

      // ROI Value = 900 - 1000 = -100
      expect(roiValue).toBe(-100);
      // ROI % = -100 / 1000 = -10%
      expect(roiPercentage).toBeCloseTo(-0.1, 4);
    });

    test('Should handle sell transactions correctly', () => {
      const currentValue = 600; // After selling $500, remaining is worth $600
      const transactions = [
        {
          date_timestamp: 1704067200,
          trx_type: 'B',
          total_price: 100000n, // Bought $1000
          fees_taxes_amount: 0n,
        },
        {
          date_timestamp: 1719792000, // Jun 15, 2024
          trx_type: 'S',
          total_price: 50000n, // Sold $500 worth
          fees_taxes_amount: 0n,
        },
      ];

      const { roiPercentage, roiValue, totalNetFlows } = ROICalculator.calculateROI(
        currentValue,
        transactions
      );

      // Net flows = 1000 (buy) - 500 (sell) = 500
      expect(totalNetFlows).toBe(500);
      // ROI Value = 600 - 500 = 100 (profit)
      expect(roiValue).toBe(100);
      // ROI % = 100 / 1000 = 10%
      expect(roiPercentage).toBeCloseTo(0.1, 4);
    });

    test('Should handle income transactions correctly', () => {
      // Income is a performance return - it's tracked separately from capital flows
      // Case: Income withdrawn as cash (not reinvested), so currentValue stays at 1000
      const currentValue = 1000;
      const transactions = [
        {
          date_timestamp: 1704067200,
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
        },
        {
          date_timestamp: 1719792000,
          trx_type: 'I',
          total_price: 5000n, // $50 income (dividend)
          fees_taxes_amount: 0n,
        },
      ];

      const { roiPercentage, roiValue, totalNetFlows, totalMoneyIn, totalIncome } =
        ROICalculator.calculateROI(currentValue, transactions);

      // Income is NOT counted as capital moneyIn
      expect(totalMoneyIn).toBe(0);
      // Income is tracked separately
      expect(totalIncome).toBe(50);
      // Net capital flows = 1000 (buy only)
      expect(totalNetFlows).toBe(1000);
      // ROI Value = currentValue + income - netFlows = 1000 + 50 - 1000 = 50
      expect(roiValue).toBe(50);
      // ROI % = 50 / 1000 = 5%
      expect(roiPercentage).toBeCloseTo(0.05, 4);
    });

    test('Should handle cost transactions correctly', () => {
      const currentValue = 1000;
      const transactions = [
        {
          date_timestamp: 1704067200,
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
        },
        {
          date_timestamp: 1719792000,
          trx_type: 'C',
          total_price: 5000n, // $50 cost (management fee)
          fees_taxes_amount: 0n,
        },
      ];

      const { roiPercentage, roiValue, totalMoneyOut } = ROICalculator.calculateROI(
        currentValue,
        transactions
      );

      // Money out = 1000 + 50 = 1050
      expect(totalMoneyOut).toBe(1050);
      // ROI Value = 1000 - 1050 = -50
      expect(roiValue).toBe(-50);
      // ROI % = -50 / 1050 = -4.76%
      expect(roiPercentage).toBeCloseTo(-0.0476, 2);
    });

    test('Should handle external fees correctly (fees_taxes_units = 0)', () => {
      const currentValue = 1000;

      const transactionsWithFees = [
        {
          date_timestamp: 1704067200,
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 1000n, // $10 external fees
          fees_taxes_units: 0,
        },
      ];

      const transactionsWithoutFees = [
        {
          date_timestamp: 1704067200,
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
          fees_taxes_units: 0,
        },
      ];

      const { roiPercentage: roiWithFees } = ROICalculator.calculateROI(
        currentValue,
        transactionsWithFees
      );
      const { roiPercentage: roiWithoutFees } = ROICalculator.calculateROI(
        currentValue,
        transactionsWithoutFees
      );

      // ROI with external fees should be lower (fees reduce returns)
      expect(roiWithFees).toBeLessThan(roiWithoutFees);
    });

    test('Should NOT count internal fees in money out (fees_taxes_units > 0)', () => {
      const currentValue = 1000;

      const transactionsWithInternalFees = [
        {
          date_timestamp: 1704067200,
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 1000n, // $10 fees amount
          fees_taxes_units: 0.5, // Internal fees (paid in units) - should NOT be counted
        },
      ];

      const transactionsWithoutFees = [
        {
          date_timestamp: 1704067200,
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
          fees_taxes_units: 0,
        },
      ];

      const { roiPercentage: roiWithInternalFees } = ROICalculator.calculateROI(
        currentValue,
        transactionsWithInternalFees
      );
      const { roiPercentage: roiWithoutFees } = ROICalculator.calculateROI(
        currentValue,
        transactionsWithoutFees
      );

      // ROI with internal fees should be the same as without fees
      expect(roiWithInternalFees).toBeCloseTo(roiWithoutFees, 4);
    });

    test('Should handle multiple transactions', () => {
      const currentValue = 3300; // $300 gain on $3000 total invested
      const transactions = [
        {
          date_timestamp: 1707523200, // Feb 10, 2025
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
        },
        {
          date_timestamp: 1716163200, // May 20, 2025
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
        },
        {
          date_timestamp: 1725494400, // Sep 5, 2025
          trx_type: 'B',
          total_price: 100000n, // $1000
          fees_taxes_amount: 0n,
        },
      ];

      const { roiPercentage, roiValue, totalNetFlows } = ROICalculator.calculateROI(
        currentValue,
        transactions
      );

      expect(totalNetFlows).toBe(3000); // $3000 total invested
      expect(roiValue).toBe(300); // $300 profit
      // ROI = 300 / 3000 = 10%
      expect(roiPercentage).toBeCloseTo(0.1, 4);
    });

    test('Should handle empty transactions array', () => {
      const currentValue = 1100;

      const { roiPercentage, roiValue, totalNetFlows } = ROICalculator.calculateROI(
        currentValue,
        []
      );

      expect(totalNetFlows).toBe(0);
      expect(roiValue).toBe(1100); // Current value is all profit if no investment
      expect(roiPercentage).toBe(0); // Can't calculate % with 0 investment
    });

    test('Should handle complete liquidation (sell everything)', () => {
      const currentValue = 0; // Sold everything

      const transactions = [
        {
          date_timestamp: 1704067200,
          trx_type: 'B',
          total_price: 500000n, // Bought $5000
          fees_taxes_amount: 1000n, // $10 fee
        },
        {
          date_timestamp: 1719792000,
          trx_type: 'S',
          total_price: 600000n, // Sold $6000
          fees_taxes_amount: 1000n, // $10 fee
        },
      ];

      const { roiPercentage, roiValue, totalMoneyOut, totalMoneyIn } = ROICalculator.calculateROI(
        currentValue,
        transactions
      );

      // Money out = 5000 + 10 + 10 = 5020
      expect(totalMoneyOut).toBe(5020);
      // Money in = 6000
      expect(totalMoneyIn).toBe(6000);
      // ROI Value = 0 - 5020 + 6000 = 980
      expect(roiValue).toBe(980);
      // ROI % = 980 / 5020 = 19.52%
      expect(roiPercentage).toBeCloseTo(0.1952, 2);
    });
  });
});
