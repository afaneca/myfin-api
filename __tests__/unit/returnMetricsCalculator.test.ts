import { describe, expect, test } from 'vitest';
import {
  calculatePeriodReturnMetrics,
  getPortfolioMonthKey,
} from '../../src/utils/ReturnMetricsCalculator.js';

const timestamp = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 0, 0, 0).getTime() / 1000;

const periodEnd = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 23, 59, 59).getTime() / 1000;

const transaction = (overrides: {
  date_timestamp: number;
  fees_taxes_amount?: bigint | number;
  fees_taxes_units?: bigint | number;
  total_price?: bigint | number;
  trx_type: string;
  units?: bigint | number;
}) => ({
  fees_taxes_amount: 0n,
  fees_taxes_units: 0,
  total_price: 0n,
  units: 0,
  ...overrides,
});

describe('ReturnMetricsCalculator', () => {
  test('returns insufficient data statuses with no value or cash flows', () => {
    const metrics = calculatePeriodReturnMetrics({
      beginningValue: 0,
      endingValue: 0,
      transactions: [],
      periodStartTimestamp: timestamp(2025, 1, 1),
      periodEndTimestamp: periodEnd(2025, 1, 31),
      portfolioValueByMonth: new Map(),
    });

    expect(metrics.absolute_return_value).toBe(0);
    expect(metrics.simple_roi.status).toBe('insufficient_data');
    expect(metrics.portfolio_return.status).toBe('insufficient_data');
    expect(metrics.personal_return.status).toBe('insufficient_data');
  });

  test('keeps fees and costs in the absolute return', () => {
    const metrics = calculatePeriodReturnMetrics({
      beginningValue: 0,
      endingValue: 1000,
      transactions: [
        transaction({
          date_timestamp: timestamp(2025, 1, 1),
          trx_type: 'B',
          total_price: 100000n,
          fees_taxes_amount: 1000n,
        }),
      ],
      periodStartTimestamp: timestamp(2025, 1, 1),
      periodEndTimestamp: periodEnd(2025, 1, 31),
      portfolioValueByMonth: new Map([[getPortfolioMonthKey(2025, 1), 1000]]),
    });

    expect(metrics.absolute_return_value).toBe(-10);
    expect(metrics.cash_flows.contributions).toBe(1000);
    expect(metrics.cash_flows.fees_and_costs).toBe(10);
    expect(metrics.simple_roi.percentage).toBeCloseTo(-0.9901, 4);
  });

  test('counts external income as return', () => {
    const metrics = calculatePeriodReturnMetrics({
      beginningValue: 1000,
      endingValue: 1000,
      transactions: [
        transaction({
          date_timestamp: timestamp(2025, 6, 1),
          trx_type: 'I',
          total_price: 10000n,
          fees_taxes_amount: 1500n,
        }),
      ],
      periodStartTimestamp: timestamp(2025, 1, 1),
      periodEndTimestamp: periodEnd(2025, 12, 31),
      portfolioValueByMonth: new Map([[getPortfolioMonthKey(2025, 12), 1000]]),
    });

    expect(metrics.absolute_return_value).toBe(85);
    expect(metrics.cash_flows.external_income).toBe(85);
    expect(metrics.cash_flows.fees_and_costs).toBe(15);
    expect(metrics.simple_roi.percentage).toBeCloseTo(8.5, 4);
  });

  test('chains monthly Modified Dietz returns', () => {
    const portfolioValueByMonth = new Map([
      [getPortfolioMonthKey(2025, 1), 1100],
      [getPortfolioMonthKey(2025, 2), 1210],
    ]);

    const metrics = calculatePeriodReturnMetrics({
      beginningValue: 1000,
      endingValue: 1210,
      transactions: [],
      periodStartTimestamp: timestamp(2025, 1, 1),
      periodEndTimestamp: periodEnd(2025, 2, 28),
      portfolioValueByMonth,
    });

    expect(metrics.portfolio_return.status).toBe('ok');
    expect(metrics.portfolio_return.cumulative_percentage).toBeCloseTo(21, 4);
  });

  test('skips inception months without a measurable starting value', () => {
    const portfolioValueByMonth = new Map([
      [getPortfolioMonthKey(2025, 1), 1100],
      [getPortfolioMonthKey(2025, 2), 1210],
    ]);

    const metrics = calculatePeriodReturnMetrics({
      beginningValue: 0,
      endingValue: 1210,
      transactions: [
        transaction({
          date_timestamp: timestamp(2025, 1, 20),
          trx_type: 'B',
          total_price: 100000n,
        }),
      ],
      periodStartTimestamp: timestamp(2025, 1, 1),
      periodEndTimestamp: periodEnd(2025, 2, 28),
      portfolioValueByMonth,
    });

    expect(metrics.absolute_return_value).toBe(210);
    expect(metrics.portfolio_return.status).toBe('ok');
    expect(metrics.portfolio_return.cumulative_percentage).toBeCloseTo(10, 4);
  });

  test('portfolio return is less distorted than simple ROI during same-month churn', () => {
    const metrics = calculatePeriodReturnMetrics({
      beginningValue: 1000,
      endingValue: 1100,
      transactions: [
        transaction({
          date_timestamp: timestamp(2025, 1, 1),
          trx_type: 'B',
          total_price: 100000n,
        }),
        transaction({
          date_timestamp: timestamp(2025, 1, 20),
          trx_type: 'S',
          total_price: 100000n,
        }),
      ],
      periodStartTimestamp: timestamp(2025, 1, 1),
      periodEndTimestamp: periodEnd(2025, 1, 31),
      portfolioValueByMonth: new Map([[getPortfolioMonthKey(2025, 1), 1100]]),
    });

    expect(metrics.absolute_return_value).toBe(100);
    expect(metrics.simple_roi.percentage).toBeCloseTo(5, 4);
    expect(metrics.portfolio_return.cumulative_percentage).toBeGreaterThan(
      metrics.simple_roi.percentage ?? 0
    );
  });

  test('calculates XIRR for irregular dated personal return', () => {
    const metrics = calculatePeriodReturnMetrics({
      beginningValue: 0,
      endingValue: 0,
      transactions: [
        transaction({
          date_timestamp: timestamp(2024, 1, 1),
          trx_type: 'B',
          total_price: 100000n,
        }),
        transaction({
          date_timestamp: timestamp(2025, 1, 1),
          trx_type: 'S',
          total_price: 110000n,
        }),
      ],
      periodStartTimestamp: timestamp(2024, 1, 1),
      periodEndTimestamp: periodEnd(2025, 1, 1),
      portfolioValueByMonth: new Map(),
    });

    expect(metrics.personal_return.status).toBe('ok');
    expect(metrics.personal_return.annualized_percentage).toBeCloseTo(10, 1);
  });

  test('returns no_solution when XIRR cash flows have no time span', () => {
    const metrics = calculatePeriodReturnMetrics({
      beginningValue: 0,
      endingValue: 0,
      transactions: [
        transaction({
          date_timestamp: timestamp(2025, 1, 1),
          trx_type: 'B',
          total_price: 100000n,
        }),
        transaction({
          date_timestamp: timestamp(2025, 1, 1),
          trx_type: 'S',
          total_price: 110000n,
        }),
      ],
      periodStartTimestamp: timestamp(2025, 1, 1),
      periodEndTimestamp: periodEnd(2025, 1, 1),
      portfolioValueByMonth: new Map(),
    });

    expect(metrics.personal_return.status).toBe('no_solution');
    expect(metrics.personal_return.annualized_percentage).toBeNull();
  });
});
