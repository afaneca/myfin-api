import { Decimal } from '@prisma/client/runtime/client';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import InvestAssetService from '../../src/services/investAssetService.js';
import InvestTransactionsService from '../../src/services/investTransactionsService.js';
import DateTimeUtils from '../../src/utils/DateTimeUtils.js';
import { mockedPrisma } from './prisma.mock.js';

// Mock InvestTransactionsService
vi.mock('../../src/services/investTransactionsService.js', () => ({
  default: {
    getAllTransactionsForUserBetweenDates: vi.fn().mockResolvedValue([]),
  },
}));

/**
 * Investment Asset Service Tests - ROI Calculations using Simple ROI
 */
describe('investAssetService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    // Reset the mock to return empty array by default
    vi.mocked(InvestTransactionsService.getAllTransactionsForUserBetweenDates).mockResolvedValue(
      []
    );
  });
  describe('getAssetStatsForUser - Simple ROI Calculations', () => {
    test('Should return correct stats with no assets', async () => {
      const userId = 1n;
      mockedPrisma.invest_assets.findMany.mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getCombinedROIByYear').mockResolvedValue({});
      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);
      expect(result.total_currently_invested_value).toBe(0);
      expect(result.total_current_value).toBe(0);
      expect(result.global_roi_value).toBe(0);
      expect(result.global_roi_percentage).toBe(0);
      expect(result.current_year_roi_value).toBe(0);
      expect(result.current_year_roi_percentage).toBe(0);
      expect(result.monthly_snapshots).toEqual([]);
      expect(result.current_value_distribution).toEqual([]);
      expect(result.top_performing_assets).toEqual([]);
    });
    test('Should calculate portfolio totals correctly for single asset', async () => {
      const userId = 1n;
      const rawAssets = [
        {
          asset_id: 1n,
          name: 'Tech Stock',
          ticker: 'TECH',
          type: 'Stock',
          units: new Prisma.Decimal(100),
          broker: 'Broker A',
          users_user_id: userId,
          created_at: 1234567890n,
          updated_at: 1234567890n,
        },
      ];
      mockedPrisma.invest_assets.findMany.mockResolvedValue(rawAssets as never);
      vi.spyOn(InvestAssetService, 'getLatestSnapshotForAsset').mockResolvedValue({
        month: 12,
        year: 2024,
        units: Decimal(100),
        invested_amount: 100000n,
        current_value: 120000n,
        invest_assets_asset_id: 1n,
        created_at: 1234567890n,
        updated_at: 1234567890n,
        withdrawn_amount: 0n,
        income_amount: 0n,
        cost_amount: 0n,
      });
      vi.spyOn(InvestAssetService, 'getTotalFeesAndTaxesForAsset').mockResolvedValue('10');
      vi.spyOn(InvestAssetService, 'getExternalFeesOnIncomeForAsset').mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getAverageBuyingPriceForAsset').mockResolvedValue(10);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getCombinedROIByYear').mockResolvedValue({
        2024: {
          roi_percentage: 18.81,
          roi_value: 190,
          beginning_value: 0,
          ending_value: 1200,
          total_net_flows: 1010,
          total_inflow: 0,
          total_outflow: 0,
          value_total_amount: 0,
        },
      });
      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);
      expect(result.total_current_value).toBe(1200);
      expect(result.total_currently_invested_value).toBe(1000);
    });
    test('Should use simple ROI from getCombinedROIByYear', async () => {
      const userId = 1n;
      const currentYear = new Date().getFullYear();
      mockedPrisma.invest_assets.findMany.mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([
        {
          month: 1,
          year: currentYear,
          units: 100,
          invested_amount: 1000,
          current_value: 1100,
          withdrawn_amount: 0,
          income_amount: 0,
          cost_amount: 0,
          fees_taxes: 10,
          asset_id: 1n,
          asset_name: 'Test',
          asset_ticker: 'TST',
          asset_broker: 'Broker',
        },
      ]);
      vi.spyOn(InvestAssetService, 'getCombinedROIByYear').mockResolvedValue({
        [currentYear]: {
          roi_percentage: 8.91,
          roi_value: 90,
          beginning_value: 0,
          ending_value: 1100,
          total_net_flows: 1010,
          total_inflow: 0,
          total_outflow: 0,
          value_total_amount: 0,
        },
      });
      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);
      expect(result.current_year_roi_value).toBe(90);
      expect(result.current_year_roi_percentage).toBe(8.91);
    });
    test('Should calculate compounded global ROI from yearly values', async () => {
      const userId = 1n;
      mockedPrisma.invest_assets.findMany.mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([
        {
          month: 1,
          year: 2023,
          units: 100,
          invested_amount: 1000,
          current_value: 1000,
          withdrawn_amount: 0,
          income_amount: 0,
          cost_amount: 0,
          fees_taxes: 0,
          asset_id: 1n,
          asset_name: 'Test',
          asset_ticker: 'TST',
          asset_broker: 'Broker',
        },
      ]);
      vi.spyOn(InvestAssetService, 'getCombinedROIByYear').mockResolvedValue({
        2023: {
          roi_percentage: 10,
          roi_value: 100,
          beginning_value: 0,
          ending_value: 1100,
          total_net_flows: 1000,
          total_inflow: 1000,
          total_outflow: 0,
          value_total_amount: 0,
        },
        2024: {
          roi_percentage: 20,
          roi_value: 220,
          beginning_value: 1100,
          ending_value: 1320,
          total_net_flows: 0,
          total_inflow: 0,
          total_outflow: 0,
          value_total_amount: 0,
        },
      });
      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);
      // Simple ROI:
      // globalRoiValue = endingValue - firstYearBeginningValue - totalNetFlows = 1320 - 0 - 1000 = 320
      // costBasis = firstYearBeginningValue + totalNetFlows = 0 + 1000 = 1000
      // globalRoiPercentage = 320 / 1000 = 32%
      expect(result.global_roi_percentage).toBeCloseTo(32, 0);
      expect(result.global_roi_value).toBe(320);
    });
    test('Should handle withdrawals in currently invested calculation', async () => {
      const userId = 1n;
      const rawAssets = [
        {
          asset_id: 1n,
          name: 'Stock W',
          ticker: 'W',
          type: 'Stock',
          units: new Prisma.Decimal(50),
          broker: 'Broker',
          users_user_id: userId,
          created_at: 1234567890n,
          updated_at: 1234567890n,
        },
      ];
      mockedPrisma.invest_assets.findMany.mockResolvedValue(rawAssets as never);
      vi.spyOn(InvestAssetService, 'getLatestSnapshotForAsset').mockResolvedValue({
        month: 12,
        year: 2024,
        units: Decimal(50),
        invested_amount: 200000n,
        current_value: 110000n,
        invest_assets_asset_id: 1n,
        created_at: 1234567890n,
        updated_at: 1234567890n,
        withdrawn_amount: 100000n,
        income_amount: 0n,
        cost_amount: 0n,
      });
      vi.spyOn(InvestAssetService, 'getTotalFeesAndTaxesForAsset').mockResolvedValue('10');
      vi.spyOn(InvestAssetService, 'getExternalFeesOnIncomeForAsset').mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getAverageBuyingPriceForAsset').mockResolvedValue(20);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getCombinedROIByYear').mockResolvedValue({});
      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);
      expect(result.total_currently_invested_value).toBe(1000);
      expect(result.total_current_value).toBe(1100);
    });
  });
  describe('updateCurrentAssetValue', () => {
    test('Should call updateAssetValue with buffer=true when current month matches', async () => {
      const userId = 1n;
      const assetId = 100n;
      const newValue = 500.5;
      const currentMonth = DateTimeUtils.getMonthNumberFromTimestamp();
      const currentYear = DateTimeUtils.getYearFromTimestamp();

      vi.spyOn(InvestAssetService, 'doesAssetBelongToUser').mockResolvedValue(true);
      const spyUpdate = vi
        .spyOn(InvestAssetService, 'updateAssetValue')
        .mockResolvedValue(undefined);

      await InvestAssetService.updateCurrentAssetValue(
        userId,
        assetId,
        newValue,
        currentMonth,
        currentYear,
        mockedPrisma
      );

      expect(spyUpdate).toHaveBeenCalledWith(
        userId,
        assetId,
        newValue,
        currentMonth,
        currentYear,
        true,
        expect.anything()
      );
    });

    test('Should call updateAssetValue with buffer=false when month is different', async () => {
      const userId = 1n;
      const assetId = 100n;
      const newValue = 500.5;
      const prevMonth =
        DateTimeUtils.getMonthNumberFromTimestamp() === 1
          ? 12
          : DateTimeUtils.getMonthNumberFromTimestamp() - 1;
      const calcYear =
        DateTimeUtils.getMonthNumberFromTimestamp() === 1
          ? DateTimeUtils.getYearFromTimestamp() - 1
          : DateTimeUtils.getYearFromTimestamp();

      vi.spyOn(InvestAssetService, 'doesAssetBelongToUser').mockResolvedValue(true);
      const spyUpdate = vi
        .spyOn(InvestAssetService, 'updateAssetValue')
        .mockResolvedValue(undefined);

      await InvestAssetService.updateCurrentAssetValue(
        userId,
        assetId,
        newValue,
        prevMonth,
        calcYear,
        mockedPrisma
      );

      expect(spyUpdate).toHaveBeenCalledWith(
        userId,
        assetId,
        newValue,
        prevMonth,
        calcYear,
        false,
        expect.anything()
      );
    });
  });

  describe('snapshot validation', () => {
    test('marks a pre-activity snapshot invalid without carrying it into later months', async () => {
      mockedPrisma.$queryRaw.mockResolvedValue([
        {
          month: 1,
          year: 2024,
          units: 0,
          invested_amount: 0,
          current_value: 6000,
          withdrawn_amount: 0,
          income_amount: 0,
          cost_amount: 0,
          fees_taxes: 0,
          asset_id: 1n,
          asset_name: 'Test asset',
          asset_ticker: 'TEST',
          asset_broker: 'Broker',
          valuation_source: 'legacy',
          asset_created_at: BigInt(Math.floor(new Date(2024, 9, 1).getTime() / 1000)),
          first_transaction_timestamp: BigInt(Math.floor(new Date(2024, 9, 15).getTime() / 1000)),
        },
        {
          month: 10,
          year: 2024,
          units: 10,
          invested_amount: 6000,
          current_value: 6000,
          withdrawn_amount: 0,
          income_amount: 0,
          cost_amount: 0,
          fees_taxes: 0,
          asset_id: 1n,
          asset_name: 'Test asset',
          asset_ticker: 'TEST',
          asset_broker: 'Broker',
          valuation_source: 'legacy',
          asset_created_at: BigInt(Math.floor(new Date(2024, 9, 1).getTime() / 1000)),
          first_transaction_timestamp: BigInt(Math.floor(new Date(2024, 9, 15).getTime() / 1000)),
        },
      ] as never);

      const snapshots = await InvestAssetService.getAllAssetSnapshotsForUser(1n, mockedPrisma);
      const assetSnapshots = snapshots.filter((snapshot) => snapshot.asset_id === 1n);

      expect(assetSnapshots[0]).toMatchObject({
        month: 1,
        year: 2024,
        validation_status: 'invalid',
        validation_reasons: ['before_first_activity'],
      });
      expect(
        assetSnapshots.some((snapshot) => snapshot.month === 2 && snapshot.year === 2024)
      ).toBe(false);
      expect(
        assetSnapshots.some((snapshot) => snapshot.month === 10 && snapshot.year === 2024)
      ).toBe(true);
    });

    test('marks generated zero-valued holdings as needing a valuation', async () => {
      const activityTimestamp = BigInt(Math.floor(new Date(2025, 3, 1).getTime() / 1000));
      mockedPrisma.$queryRaw.mockResolvedValue([
        {
          month: 4,
          year: 2025,
          units: 1,
          invested_amount: 3175,
          current_value: 0,
          withdrawn_amount: 0,
          income_amount: 0,
          cost_amount: 0,
          fees_taxes: 0,
          asset_id: 2n,
          asset_name: 'Unvalued asset',
          asset_ticker: '',
          asset_broker: 'Broker',
          valuation_source: 'generated',
          asset_created_at: activityTimestamp,
          first_transaction_timestamp: activityTimestamp,
        },
      ] as never);

      const snapshots = await InvestAssetService.getAllAssetSnapshotsForUser(1n, mockedPrisma);

      expect(snapshots[0]).toMatchObject({
        validation_status: 'needs_valuation',
        validation_reasons: ['missing_valuation'],
      });
    });
  });

  describe('deleteAssetValueSnapshot', () => {
    test('deletes only the requested snapshot after checking asset ownership', async () => {
      vi.spyOn(InvestAssetService, 'doesAssetBelongToUser').mockResolvedValue(true);
      mockedPrisma.invest_asset_evo_snapshot.deleteMany.mockResolvedValue({ count: 1 });

      await InvestAssetService.deleteAssetValueSnapshot(1n, 2n, 4, 2025, mockedPrisma);

      expect(mockedPrisma.invest_asset_evo_snapshot.deleteMany).toHaveBeenCalledWith({
        where: {
          invest_assets_asset_id: 2n,
          month: 4,
          year: 2025,
        },
      });
    });
  });
});
