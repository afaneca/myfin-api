import type { invest_transactions_type } from '@prisma/client';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MYFIN } from '../../src/consts.js';

import InvestAssetService, {
  type InvestAssetWithCalculatedAmounts,
} from '../../src/services/investAssetService.js';

import InvestTransactionsService from '../../src/services/investTransactionsService.js';

import UserService from '../../src/services/userService.js';

import DateTimeUtils from '../../src/utils/DateTimeUtils.js';

import Logger from '../../src/utils/Logger.js';

describe('Invest Transaction tests', () => {
  let user: { user_id: bigint; username: string };

  let simpleSavingsAsset: { asset_id: bigint; name: string; type: string };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 18, 0, 0));

    user = await UserService.createUser({
      username: 'demo',

      password: '123',

      email: 'demo@myfinbudget.com',
    });

    simpleSavingsAsset = await InvestAssetService.createAsset(user.user_id, {
      name: 'Simple Savings',

      type: MYFIN.INVEST.ASSET_TYPE.FIXED_INCOME,

      ticker: 'EUR',

      units: 0,

      broker: 'BROKER1',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('Simple savings account', async () => {
    const YEAR = 2024;

    // ====== JANUARY 15, 2024 ======

    // Transaction: Initial deposit

    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 0, 15)),
      'trx 1',
      10_000,
      10_000,
      0,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type,
      false
    );

    // UPDATE CURRENT VALUE: Set January value to 10,000€

    await InvestAssetService.updateAssetValue(
      user.user_id,

      simpleSavingsAsset.asset_id,

      10_000,

      1,

      YEAR
    );

    // ====== FEBRUARY 15, 2024 ======

    // Transaction: Interest earned (reinvested)

    await InvestTransactionsService.createTransaction(
      user.user_id,

      simpleSavingsAsset.asset_id,

      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 1, 15)),
      'trx 2',
      0,
      100,
      28,
      28,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    // UPDATE CURRENT VALUE: Set February value to 10,072€

    // Calculation: 10000 + 100 (interest) - 28 (tax) = 10,072€

    await InvestAssetService.updateAssetValue(
      user.user_id,

      simpleSavingsAsset.asset_id,

      10_072,

      2,

      YEAR
    );

    // ====== MARCH 15, 2024 ======

    // Transaction: Monthly interest

    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 2, 15)),
      'trx 3',
      0,
      101,
      28,
      28,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    // UPDATE CURRENT VALUE: 10,145 EUR = 10,145€

    // 10,072 + 101 - 28 = 10,145

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      10_145,
      3,
      YEAR
    );

    // ====== APRIL 15, 2024 ======

    // Transaction: Monthly interest

    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 3, 15)),
      'trx 4',
      0,
      101,
      28,
      28,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    // UPDATE CURRENT VALUE: 10,218 EUR = 10,218€
    // 10,145 + 101 - 28 = 10,218
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      10_218,
      4,
      YEAR
    );

    // ====== MAY 15, 2024 ======
    // Transaction: Monthly interest
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 4, 15)),
      'trx 5',
      0,
      102,
      29,
      29,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    // UPDATE CURRENT VALUE: 10,291 EUR = 10,291€
    // 10,218 + 102 - 29 = 10,291
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      10_291,
      5,
      YEAR
    );

    // ====== JUNE 15, 2024 ======
    // Transaction: Withdraw half
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 5, 15)),
      'trx 6',
      5_000,
      5_000,
      0,
      0,
      MYFIN.INVEST.TRX_TYPE.SELL as invest_transactions_type
    );

    // UPDATE CURRENT VALUE: 5,291 EUR = 5,291€
    // 10,291 - 5,000 = 5,291
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      5_291,
      6,
      YEAR
    );

    // ====== JULY 15, 2024 ======
    // Transaction: Monthly interest (on remaining balance)
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 6, 15)),
      'trx 7',
      0,
      53,
      15,
      15,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    // UPDATE CURRENT VALUE: 5,329 EUR = 5,329€
    // 5,291 + 53 - 15 = 5,329
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      5_329,
      7,
      YEAR
    );

    // ====== AUGUST 15, 2024 ======
    // Transaction: Monthly interest (on remaining balance)
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 7, 15)),
      'trx 8',
      0,
      53,
      15,
      15,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    // UPDATE CURRENT VALUE: 5,367 EUR = 5,367€
    // 5,329 + 53 - 15 = 5,367
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      5_367,
      8,
      YEAR
    );

    // ====== SEPTEMBER 15, 2024 ======
    // Transaction: Monthly interest (on remaining balance)
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 8, 15)),
      'trx 9',
      0,
      54,
      15,
      15,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    // UPDATE CURRENT VALUE: 5,406 EUR = 5,406€
    // 5,367 + 54 - 15 = 5,406
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      5_406,
      9,
      YEAR
    );

    // ====== OCTOBER 15, 2024 ======
    // Transaction: Monthly interest (on remaining balance)
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 9, 15)),
      'trx 10',
      0,
      54,
      15,
      15,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    // UPDATE CURRENT VALUE: 5,445 EUR = 5,445€
    // 5,406 + 54 - 15 = 5,445
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      5_445,
      10,
      YEAR
    );

    // ====== NOVEMBER 15, 2024 ======
    // Transaction: Monthly interest (on remaining balance)
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 10, 15)),
      'trx 11',
      0,
      54,
      15,
      15,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    // UPDATE CURRENT VALUE: 5,484 EUR = 5,484€
    // 5,445 + 54 - 15 = 5,484
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      5_484,
      11,
      YEAR
    );

    // ====== DECEMBER 15, 2024 ======
    // Transaction: Monthly interest (on remaining balance)
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 11, 15)),
      'trx 12',
      0,
      55,
      15,
      15,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    // UPDATE CURRENT VALUE: 5,524 EUR = 5,524€
    // 5,484 + 55 - 15 = 5,524
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      5_524,
      12,
      YEAR
    );

    const statResults = await InvestAssetService.getAssetStatsForUser(user.user_id);

    //Logger.addStringifiedLog(statResults);

    const assetResults = statResults.top_performing_assets[0] as InvestAssetWithCalculatedAmounts;

    // 1. Check the Final Balance
    expect(assetResults.current_value).toBe(5_524);

    // 2. Check the Absolute Profit (524€)
    // Formula: Ending Value (5524) - Net Flows (5000)
    expect(assetResults.absolute_roi_value).toBe(524);

    // 3. Check the MWR Percentage
    expect(assetResults.relative_roi_percentage).toBeCloseTo(8.71, 2);

    // 4. Check the Total Invested Value (Net Basis)
    // This is the $10,000 deposit minus the $5,000 withdrawal
    expect(assetResults.currently_invested_value).toBe(5_000);
  });

  test('Simple buy and hold - no withdrawals, no income', async () => {
    const YEAR = 2024;

    // ====== JANUARY 15, 2024 ======
    // Buy 100 shares at $50 each = $5,000
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 0, 15)),
      'Initial purchase',
      5_000,
      100,
      10,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );

    // Set January value to $5,000
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      5_000,
      1,
      YEAR
    );

    // ====== JUNE 15, 2024 ======
    // Value increased to $6,000 (20% gain)
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      6_000,
      6,
      YEAR
    );

    // ====== DECEMBER 15, 2024 ======
    // Value increased to $7,000 (40% gain from original)
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      7_000,
      12,
      YEAR
    );

    const statResults = await InvestAssetService.getAssetStatsForUser(user.user_id);
    const assetResults = statResults.top_performing_assets[0] as InvestAssetWithCalculatedAmounts;

    // 1. Check current value
    expect(assetResults.current_value).toBe(7_000);

    // 2. Check absolute ROI (profit)
    /// MONEY_OUT = 5,000 + 10 = 5,010
    // ROI = 7,000 - 5,010 = 1,990
    expect(assetResults.absolute_roi_value).toBe(1_990);

    // 3. Check currently invested value
    expect(assetResults.currently_invested_value).toBe(5_000);

    // 4. ROI percentage should be positive (around 40%)
    expect(assetResults.relative_roi_percentage).toBeGreaterThan(30);
    expect(assetResults.relative_roi_percentage).toBeLessThan(50);
  });

  test('Asset with losses - negative ROI', async () => {
    const YEAR = 2024;

    // ====== JANUARY 15, 2024 ======
    // Buy at $10,000
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 0, 15)),
      'Buy at peak',
      10_000,
      100,
      50,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      10_000,
      1,
      YEAR
    );

    // ====== JUNE 15, 2024 ======
    // Market crash - value drops to $7,000
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      7_000,
      6,
      YEAR
    );

    // ====== DECEMBER 15, 2024 ======
    // Partial recovery to $8,000 (still 20% loss)
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      8_000,
      12,
      YEAR
    );

    const statResults = await InvestAssetService.getAssetStatsForUser(user.user_id);
    const assetResults = statResults.top_performing_assets[0] as InvestAssetWithCalculatedAmounts;

    // 1. Check current value
    expect(assetResults.current_value).toBe(8_000);

    // 2. Check absolute ROI (loss)
    // MONEY_OUT = 10,000 + 50 = 10,050
    // ROI = 8,000 - 10,050 = -2,050
    expect(assetResults.absolute_roi_value).toBe(-2_050);

    // 3. ROI percentage should be negative
    expect(assetResults.relative_roi_percentage).toBeLessThan(0);
    expect(assetResults.relative_roi_percentage).toBeGreaterThan(-30);
  });

  test('Dollar cost averaging - multiple buys', async () => {
    const YEAR = 2024;

    // ====== JANUARY 15, 2024 ======
    // First purchase: $1,000
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 0, 15)),
      'DCA Buy 1',
      1_000,
      100,
      5,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      1_000,
      1,
      YEAR
    );

    // ====== APRIL 15, 2024 ======
    // Second purchase: $1,000 (market down, value now $1,800)
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 3, 15)),
      'DCA Buy 2',
      1_000,
      120,
      5,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      1_800,
      4,
      YEAR
    );

    // ====== JULY 15, 2024 ======
    // Third purchase: $1,000 (market up, value now $3,500)
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 6, 15)),
      'DCA Buy 3',
      1_000,
      80,
      5,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      3_500,
      7,
      YEAR
    );

    // ====== DECEMBER 15, 2024 ======
    // End of year value: $4,000
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      4_000,
      12,
      YEAR
    );

    const statResults = await InvestAssetService.getAssetStatsForUser(user.user_id);
    const assetResults = statResults.top_performing_assets[0] as InvestAssetWithCalculatedAmounts;

    // 1. Check current value
    expect(assetResults.current_value).toBe(4_000);

    // 2. Total invested: $3,000
    expect(assetResults.currently_invested_value).toBe(3_000);

    // 3. Check absolute ROI
    // MONEY_OUT = 3,000 + 15 (fees) = 3,015
    // ROI = 4,000 - 3,015 = 985
    expect(assetResults.absolute_roi_value).toBe(985);

    // 4. MWR should account for timing of investments
    // Later investments had less time to grow, so MWR should be higher than simple ROI
    expect(assetResults.relative_roi_percentage).toBeGreaterThan(20);
  });

  test('Partial sell - take profits', async () => {
    const YEAR = 2024;

    // ====== JANUARY 15, 2024 ======
    // Buy $10,000 worth
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 0, 15)),
      'Initial buy',
      10_000,
      1000,
      25,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      10_000,
      1,
      YEAR
    );

    // ====== JUNE 15, 2024 ======
    // Value doubled to $20,000 - sell half to take profits
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      20_000,
      5,
      YEAR
    );

    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 5, 15)),
      'Take profits - sell half',
      10_000,
      500,
      25,
      0,
      MYFIN.INVEST.TRX_TYPE.SELL as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      10_000,
      6,
      YEAR
    );

    // ====== DECEMBER 15, 2024 ======
    // Remaining position grows to $12,000
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      12_000,
      12,
      YEAR
    );

    const statResults = await InvestAssetService.getAssetStatsForUser(user.user_id);
    const assetResults = statResults.top_performing_assets[0] as InvestAssetWithCalculatedAmounts;

    // 1. Check current value
    expect(assetResults.current_value).toBe(12_000);

    // 2. Currently invested = bought - sold = 10000 - 10000 = 0
    expect(assetResults.currently_invested_value).toBe(0);

    // 3. Check absolute ROI
    // MONEY_OUT = 10,000 + 25 + 25 = 10,050
    // MONEY_IN = 10,000
    // BREAK_EVEN = 50
    // ROI = 12,000 - 50 = 11,950
    expect(assetResults.absolute_roi_value).toBe(11_950);

    // 4. ROI should be very high since we got our money back plus profit
    expect(assetResults.relative_roi_percentage).toBeGreaterThan(100);
  });

  test('COST transaction - external fees', async () => {
    const YEAR = 2024;

    // ====== JANUARY 15, 2024 ======
    // Buy $5,000 worth
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 0, 15)),
      'Initial buy',
      5_000,
      500,
      10,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      5_000,
      1,
      YEAR
    );

    // ====== JUNE 15, 2024 ======
    // Management fee of $100 (paid externally)
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 5, 15)),
      'Annual management fee',
      100,
      0,
      0,
      0,
      MYFIN.INVEST.TRX_TYPE.COST as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      5_500,
      6,
      YEAR
    );

    // ====== DECEMBER 15, 2024 ======
    // Value at end of year
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      6_000,
      12,
      YEAR
    );

    const statResults = await InvestAssetService.getAssetStatsForUser(user.user_id);
    const assetResults = statResults.top_performing_assets[0] as InvestAssetWithCalculatedAmounts;

    // 1. Check current value
    expect(assetResults.current_value).toBe(6_000);

    // 2. Cost amount should be recorded
    expect(assetResults.cost_amount).toBe(100);

    // 3. Absolute ROI should account for the cost
    // MONEY_OUT = 5,000 (buy) + 10 (buy fee) + 100 (cost) = 5,110
    // MONEY_IN = 0
    // ROI = 6,000 - 5,110 = 890
    expect(assetResults.absolute_roi_value).toBe(890);
  });

  test('INCOME transaction - dividends not reinvested (cash)', async () => {
    const YEAR = 2024;

    // ====== JANUARY 15, 2024 ======
    // Buy dividend stock for $10,000
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 0, 15)),
      'Buy dividend stock',
      10_000,
      100,
      20,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      10_000,
      1,
      YEAR
    );

    // ====== MARCH 15, 2024 ======
    // Q1 Dividend: $250 paid as cash (not reinvested)
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 2, 15)),
      'Q1 Dividend',
      250,
      0, // No units added - cash dividend
      50,
      0,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      10_200,
      3,
      YEAR
    );

    // ====== JUNE 15, 2024 ======
    // Q2 Dividend: $250 paid as cash
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 5, 15)),
      'Q2 Dividend',
      250,
      0,
      50,
      0,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      10_500,
      6,
      YEAR
    );

    // ====== DECEMBER 15, 2024 ======
    // Stock price unchanged at $10,500
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      10_500,
      12,
      YEAR
    );

    const statResults = await InvestAssetService.getAssetStatsForUser(user.user_id);
    const assetResults = statResults.top_performing_assets[0] as InvestAssetWithCalculatedAmounts;

    // 1. Check current value
    expect(assetResults.current_value).toBe(10_500);

    // 2. Income amount should track dividends received (gross)
    expect(assetResults.income_amount).toBe(500); // 250 + 250

    // 3. Currently invested = invested - withdrawn - net_income
    // Net income = gross income - external fees on income = 500 - 100 = 400
    // 10,000 - 0 - 400 = 9,600
    expect(assetResults.currently_invested_value).toBe(9_600);
  });

  test('Zero activity in current year - inherited position', async () => {
    const PREV_YEAR = 2024;

    // ====== DECEMBER 15, 2024 ======
    // Buy and hold from previous year
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(PREV_YEAR, 11, 15)),
      'Previous year buy',
      5_000,
      100,
      10,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      5_000,
      12,
      PREV_YEAR
    );

    // No transactions in 2025, but value changes
    // The snapshot system should carry forward the position

    const statResults = await InvestAssetService.getAssetStatsForUser(user.user_id);

    // Current year (2026) should show 0% ROI if no change
    expect(statResults.current_year_roi_percentage).toBe(0);
    expect(statResults.current_year_roi_value).toBe(0);

    // But all-time ROI should still be calculated
    const assetResults = statResults.top_performing_assets[0] as InvestAssetWithCalculatedAmounts;
    expect(assetResults.current_value).toBe(5_000);
    expect(assetResults.currently_invested_value).toBe(5_000);
  });

  test('Complete liquidation - sell everything', async () => {
    const YEAR = 2024;

    // ====== JANUARY 15, 2024 ======
    // Buy $5,000
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 0, 15)),
      'Initial buy',
      5_000,
      500,
      10,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      5_000,
      1,
      YEAR
    );

    // ====== JUNE 15, 2024 ======
    // Value grows to $6,000
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      6_000,
      5,
      YEAR
    );

    // Sell everything
    await InvestTransactionsService.createTransaction(
      user.user_id,
      simpleSavingsAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 5, 15)),
      'Liquidate position',
      6_000,
      500,
      10,
      0,
      MYFIN.INVEST.TRX_TYPE.SELL as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      0,
      6,
      YEAR
    );

    // ====== DECEMBER 15, 2024 ======
    // Position remains at 0
    await InvestAssetService.updateAssetValue(
      user.user_id,
      simpleSavingsAsset.asset_id,
      0,
      12,
      YEAR
    );

    const statResults = await InvestAssetService.getAssetStatsForUser(user.user_id);
    const assetResults = statResults.top_performing_assets[0] as InvestAssetWithCalculatedAmounts;

    // 1. Current value should be 0
    expect(assetResults.current_value).toBe(0);

    // 2. Currently invested should be 0 (bought 5000, sold 6000)
    expect(assetResults.currently_invested_value).toBe(0);

    // 3. Withdrawn should be 6000
    expect(assetResults.withdrawn_amount).toBe(6_000);

    // 4. Absolute ROI = 0 (current) + 6000 (withdrawn) - 5000 (invested) - 20 (fees) = 980 profit
    // But since current value is 0, the calculation should handle this edge case
    expect(assetResults.absolute_roi_value).toBe(980);
  });

  test('BTC Staking - INCOME with internal fees (fees NOT counted in ROI)', async () => {
    const YEAR = 2024;

    // Create BTC asset
    const btcAsset = await InvestAssetService.createAsset(user.user_id, {
      name: 'Bitcoin',
      type: MYFIN.INVEST.ASSET_TYPE.CRYPTO,
      ticker: 'BTC',
      units: 0,
      broker: 'EXCHANGE',
    });

    // Buy 1 BTC
    await InvestTransactionsService.createTransaction(
      user.user_id,
      btcAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 0, 15)),
      'Buy 1 BTC',
      50_000,
      1,
      100, // Purchase fee
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(user.user_id, btcAsset.asset_id, 50_000, 1, YEAR);

    // Staking reward: 0.01 BTC earned
    // Tax: 120 EUR worth (exchange deducted 0.002 BTC as tax)
    // Net: 0.008 BTC added to holdings
    await InvestTransactionsService.createTransaction(
      user.user_id,
      btcAsset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 5, 15)),
      'Staking reward - tax deducted internally',
      0, // amount = 0 (reinvested)
      0.01, // units = 0.01 BTC (gross reward)
      120, // fees_taxes = 120 EUR (documentation of tax value)
      0.002,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    // BTC price rises to 60,000 EUR/BTC
    // Portfolio: 1.008 BTC × 60,000 = 60,480 EUR
    await InvestAssetService.updateAssetValue(user.user_id, btcAsset.asset_id, 60_480, 6, YEAR);

    const statResults = await InvestAssetService.getAssetStatsForUser(user.user_id);
    const assetResults = statResults.top_performing_assets[0] as InvestAssetWithCalculatedAmounts;

    // Verify ROI calculation
    // MONEY_OUT = 50,000 (buy) + 100 (buy fees) = 50,100
    // (120 EUR tax NOT counted because of internal flag)
    // MONEY_IN = 0
    // BREAK_EVEN = 50,100
    // ROI = 60,480 - 50,100 = 10,380 EUR
    expect(assetResults.current_value).toBe(60_480);
    expect(assetResults.absolute_roi_value).toBe(10_380);
    // MWR percentage using actual transaction dates
    expect(assetResults.relative_roi_percentage).toBeCloseTo(20.72, 2);
  });

  test('Comparison: Internal vs External fees yield same profit but different ROI%', async () => {
    const YEAR = 2024;

    // Create two BTC assets to compare
    const btcInternal = await InvestAssetService.createAsset(user.user_id, {
      name: 'BTC Internal Fees',
      type: MYFIN.INVEST.ASSET_TYPE.CRYPTO,
      ticker: 'BTC',
      units: 0,
      broker: 'EXCHANGE',
    });

    const btcExternal = await InvestAssetService.createAsset(user.user_id, {
      name: 'BTC External Fees',
      type: MYFIN.INVEST.ASSET_TYPE.CRYPTO,
      ticker: 'BTC',
      units: 0,
      broker: 'EXCHANGE',
    });

    // Both buy 1 BTC
    for (const asset of [btcInternal, btcExternal]) {
      await InvestTransactionsService.createTransaction(
        user.user_id,
        asset.asset_id,
        DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 0, 15)),
        'Buy 1 BTC',
        50_000,
        1,
        100,
        0,
        MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
      );

      await InvestAssetService.updateAssetValue(user.user_id, asset.asset_id, 50_000, 1, YEAR);
    }

    // Internal fees scenario
    await InvestTransactionsService.createTransaction(
      user.user_id,
      btcInternal.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 5, 15)),
      'Staking - internal tax',
      0,
      0.01,
      120,
      0.002,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      btcInternal.asset_id,
      60_480, // 1.008 BTC × 60,000
      6,
      YEAR
    );

    // External fees scenario
    await InvestTransactionsService.createTransaction(
      user.user_id,
      btcExternal.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(YEAR, 5, 15)),
      'Staking - external tax',
      0,
      0.01,
      120,
      0,
      MYFIN.INVEST.TRX_TYPE.INCOME as invest_transactions_type
    );

    await InvestAssetService.updateAssetValue(
      user.user_id,
      btcExternal.asset_id,
      60_600, // 1.01 BTC × 60,000
      6,
      YEAR
    );

    const statResults = await InvestAssetService.getAssetStatsForUser(user.user_id);
    const internalResults = statResults.top_performing_assets.find(
      (a) => a.asset_id === btcInternal.asset_id
    ) as InvestAssetWithCalculatedAmounts;
    const externalResults = statResults.top_performing_assets.find(
      (a) => a.asset_id === btcExternal.asset_id
    ) as InvestAssetWithCalculatedAmounts;

    // Both should have same absolute profit (10,380 EUR)
    expect(internalResults.absolute_roi_value).toBe(10_380);
    expect(externalResults.absolute_roi_value).toBe(10_380);

    // But different ROI percentages due to different MONEY_OUT
    // Using actual transaction dates for precise time-weighting
    // Internal: ~21.54% (internal fees not counted in money out)
    // External: ~21.51% (external fees counted in money out, so slightly lower)
    expect(internalResults.relative_roi_percentage).toBeCloseTo(20.72, 2);
    expect(externalResults.relative_roi_percentage).toBeCloseTo(20.68, 2);
  });
});
