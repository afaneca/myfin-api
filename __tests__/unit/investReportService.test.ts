import { describe, expect, test } from 'vitest';
import { MYFIN } from '../../src/consts.js';
import {
  type AnnualReportTransaction,
  buildAnnualReportFromTransactions,
} from '../../src/services/investReportService.js';
import DateTimeUtils from '../../src/utils/DateTimeUtils.js';

const timestamp = (year: number, month: number, day: number) =>
  DateTimeUtils.getUnixTimestampFromDate(new Date(year, month - 1, day));

const trx = (
  overrides: Partial<AnnualReportTransaction> & {
    transaction_id: number;
    trx_type: string;
  }
): AnnualReportTransaction => ({
  asset_broker: 'Broker',
  asset_id: 1,
  asset_name: 'Example ETF',
  asset_ticker: 'ETF',
  asset_type: 'etf',
  date_timestamp: timestamp(2025, 1, 1),
  fees_taxes_amount: 0,
  fees_taxes_units: 0,
  note: '',
  total_price: 0,
  units: 0,
  ...overrides,
});

describe('investReportService FIFO annual report', () => {
  test('matches one buy lot to one sell', () => {
    const report = buildAnnualReportFromTransactions(2025, [
      trx({
        transaction_id: 1,
        trx_type: MYFIN.INVEST.TRX_TYPE.BUY,
        total_price: 1000,
        units: 10,
      }),
      trx({
        transaction_id: 2,
        trx_type: MYFIN.INVEST.TRX_TYPE.SELL,
        total_price: 600,
        units: 4,
      }),
    ]);

    expect(report.summary.total_invested).toBe(1000);
    expect(report.summary.total_withdrawn).toBe(600);
    expect(report.summary.realized_gain_loss).toBe(200);
    expect(report.assets[0].sells[0].fifo_matches).toMatchObject([
      {
        acquisition_cost: 400,
        gain_loss: 200,
        matched_units: 4,
        proceeds: 600,
      },
    ]);
  });

  test('matches a sell across multiple buy lots', () => {
    const report = buildAnnualReportFromTransactions(2025, [
      trx({
        transaction_id: 1,
        trx_type: MYFIN.INVEST.TRX_TYPE.BUY,
        total_price: 500,
        units: 5,
      }),
      trx({
        transaction_id: 2,
        trx_type: MYFIN.INVEST.TRX_TYPE.BUY,
        total_price: 750,
        units: 5,
      }),
      trx({
        transaction_id: 3,
        trx_type: MYFIN.INVEST.TRX_TYPE.SELL,
        total_price: 1200,
        units: 8,
      }),
    ]);

    const matches = report.assets[0].sells[0].fifo_matches;
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      acquisition_cost: 500,
      gain_loss: 250,
      matched_units: 5,
      proceeds: 750,
    });
    expect(matches[1]).toMatchObject({
      acquisition_cost: 450,
      gain_loss: 0,
      matched_units: 3,
      proceeds: 450,
    });
    expect(report.summary.realized_gain_loss).toBe(250);
  });

  test('prior-year sells consume lots before the report year', () => {
    const report = buildAnnualReportFromTransactions(2025, [
      trx({
        date_timestamp: timestamp(2023, 1, 1),
        transaction_id: 1,
        trx_type: MYFIN.INVEST.TRX_TYPE.BUY,
        total_price: 1000,
        units: 10,
      }),
      trx({
        date_timestamp: timestamp(2024, 1, 1),
        transaction_id: 2,
        trx_type: MYFIN.INVEST.TRX_TYPE.SELL,
        total_price: 480,
        units: 4,
      }),
      trx({
        date_timestamp: timestamp(2025, 1, 1),
        transaction_id: 3,
        trx_type: MYFIN.INVEST.TRX_TYPE.SELL,
        total_price: 450,
        units: 3,
      }),
    ]);

    expect(report.assets[0].sells).toHaveLength(1);
    expect(report.assets[0].sells[0].fifo_matches[0]).toMatchObject({
      acquisition_cost: 300,
      gain_loss: 150,
      matched_units: 3,
    });
  });

  test('prior-year unmatched sells are consumed silently until report-year data is affected', () => {
    const report = buildAnnualReportFromTransactions(2025, [
      trx({
        date_timestamp: timestamp(2024, 1, 1),
        transaction_id: 1,
        trx_type: MYFIN.INVEST.TRX_TYPE.BUY,
        total_price: 100,
        units: 1,
      }),
      trx({
        date_timestamp: timestamp(2024, 2, 1),
        transaction_id: 2,
        trx_type: MYFIN.INVEST.TRX_TYPE.SELL,
        total_price: 250,
        units: 3,
      }),
    ]);

    expect(report.assets).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  test('orders same-date transactions by transaction id', () => {
    const date = timestamp(2025, 1, 1);
    const report = buildAnnualReportFromTransactions(2025, [
      trx({
        date_timestamp: date,
        transaction_id: 2,
        trx_type: MYFIN.INVEST.TRX_TYPE.SELL,
        total_price: 200,
        units: 2,
      }),
      trx({
        date_timestamp: date,
        transaction_id: 1,
        trx_type: MYFIN.INVEST.TRX_TYPE.BUY,
        total_price: 100,
        units: 2,
      }),
    ]);

    expect(report.assets[0].sells[0].fifo_matches[0]).toMatchObject({
      buy_transaction: expect.objectContaining({ transaction_id: 1 }),
      gain_loss: 100,
      matched_units: 2,
    });
    expect(report.warnings).toEqual([]);
  });

  test('allocates buy and sell fees proportionally', () => {
    const report = buildAnnualReportFromTransactions(2025, [
      trx({
        transaction_id: 1,
        trx_type: MYFIN.INVEST.TRX_TYPE.BUY,
        total_price: 1000,
        units: 10,
        fees_taxes_amount: 20,
      }),
      trx({
        transaction_id: 2,
        trx_type: MYFIN.INVEST.TRX_TYPE.SELL,
        total_price: 600,
        units: 4,
        fees_taxes_amount: 12,
      }),
    ]);

    expect(report.summary.fees).toBe(32);
    expect(report.summary.realized_gain_loss).toBe(180);
    expect(report.assets[0].sells[0].fifo_matches[0]).toMatchObject({
      acquisition_cost: 400,
      acquisition_fees: 8,
      allocated_fees: 20,
      gain_loss: 180,
      proceeds: 600,
      sell_fees: 12,
    });
  });

  test('warns when sell units cannot be fully matched', () => {
    const report = buildAnnualReportFromTransactions(2025, [
      trx({
        transaction_id: 1,
        trx_type: MYFIN.INVEST.TRX_TYPE.BUY,
        total_price: 200,
        units: 2,
      }),
      trx({
        transaction_id: 2,
        trx_type: MYFIN.INVEST.TRX_TYPE.SELL,
        total_price: 500,
        units: 5,
      }),
    ]);

    expect(report.assets[0].sells[0].unmatched_units).toBe(3);
    expect(report.warnings).toEqual([
      expect.objectContaining({
        asset_id: 1,
        code: 'UNMATCHED_SELL_UNITS',
        transaction_id: 2,
        units: 3,
      }),
    ]);
  });
});
