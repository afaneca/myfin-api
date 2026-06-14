import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { invest_transactions_type } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import app from '../../src/app.js';
import { MYFIN } from '../../src/consts.js';
import InvestAssetService from '../../src/services/investAssetService.js';
import InvestTransactionsService from '../../src/services/investTransactionsService.js';
import UserService from '../../src/services/userService.js';
import DateTimeUtils from '../../src/utils/DateTimeUtils.js';

describe('Invest annual report endpoint', () => {
  let baseUrl: string;
  let server: Server;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 18, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  test('returns annual FIFO report data for authenticated user', async () => {
    const user = await UserService.createUser({
      username: 'report-user',
      password: '123',
      email: 'report@myfinbudget.com',
    });
    const login = await UserService.attemptLogin('report-user', '123', false);
    const asset = await InvestAssetService.createAsset(user.user_id, {
      name: 'World ETF',
      type: MYFIN.INVEST.ASSET_TYPE.ETF,
      ticker: 'WRLD',
      units: 0,
      broker: 'BROKER1',
    });

    await InvestTransactionsService.createTransaction(
      user.user_id,
      asset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(2024, 0, 15)),
      'prior buy',
      1000,
      10,
      10,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );
    await InvestAssetService.updateAssetValue(user.user_id, asset.asset_id, 1200, 12, 2024);

    await InvestTransactionsService.createTransaction(
      user.user_id,
      asset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(2025, 1, 15)),
      'selected buy',
      750,
      5,
      5,
      0,
      MYFIN.INVEST.TRX_TYPE.BUY as invest_transactions_type
    );
    await InvestTransactionsService.createTransaction(
      user.user_id,
      asset.asset_id,
      DateTimeUtils.getUnixTimestampFromDate(new Date(2025, 2, 15)),
      'selected sell',
      1400,
      8,
      14,
      0,
      MYFIN.INVEST.TRX_TYPE.SELL as invest_transactions_type
    );
    await InvestAssetService.updateAssetValue(user.user_id, asset.asset_id, 2000, 12, 2025);

    const response = await fetch(`${baseUrl}/invest/reports/annual/2025`, {
      headers: {
        authusername: 'report-user',
        sessionkey: login.sessionkey,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.year).toBe(2025);
    expect(body.summary.total_invested).toBe(750);
    expect(body.summary.total_withdrawn).toBe(1400);
    expect(body.summary.fees).toBe(19);
    expect(body.summary.realized_gain_loss).toBe(578);
    expect(body.summary.beginning_value).toBe(1200);
    expect(body.summary.ending_value).toBe(2000);
    expect(body.assets[0]).toMatchObject({
      asset_id: Number(asset.asset_id),
      name: 'World ETF',
      ticker: 'WRLD',
      type: MYFIN.INVEST.ASSET_TYPE.ETF,
    });
    expect(body.assets[0].buys).toHaveLength(1);
    expect(body.assets[0].sells[0].fifo_matches).toEqual([
      expect.objectContaining({
        acquisition_cost: 800,
        acquisition_fees: 8,
        buy_transaction: expect.objectContaining({ transaction_id: expect.any(Number) }),
        gain_loss: 578,
        matched_units: 8,
        proceeds: 1400,
        sell_fees: 14,
      }),
    ]);
  });
});
