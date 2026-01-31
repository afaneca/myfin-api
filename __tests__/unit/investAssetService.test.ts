import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library.js';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import InvestAssetService from '../../src/services/investAssetService.js';
import InvestTransactionsService from '../../src/services/investTransactionsService.js';
import { mockedPrisma } from './prisma.mock.js';

// Mock InvestTransactionsService
vi.mock('../../src/services/investTransactionsService.js', () => ({
  default: {
    getAllTransactionsForUserBetweenDates: vi.fn().mockResolvedValue([]),
  },
}));

/**
 * Investment Asset Service Tests - ROI Calculations using MWR (Modified Dietz)
 */
describe('investAssetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock to return empty array by default
    vi.mocked(InvestTransactionsService.getAllTransactionsForUserBetweenDates).mockResolvedValue(
      []
    );
  });
  describe('getAssetStatsForUser - MWR ROI Calculations', () => {
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
          annualized_roi_percentage: 18.81,
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
    test('Should use MWR-based ROI from getCombinedROIByYear', async () => {
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
          annualized_roi_percentage: 15.5,
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
      expect(result.current_year_annualized_roi_percentage).toBe(15.5);
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
          annualized_roi_percentage: 10,
          beginning_value: 0,
          ending_value: 1100,
          total_net_flows: 1000,
          total_inflow: 0,
          total_outflow: 0,
          value_total_amount: 0,
        },
        2024: {
          roi_percentage: 20,
          roi_value: 220,
          annualized_roi_percentage: 20,
          beginning_value: 1100,
          ending_value: 1320,
          total_net_flows: 0,
          total_inflow: 0,
          total_outflow: 0,
          value_total_amount: 0,
        },
      });
      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);
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
});
