import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import InvestAssetService from '../../src/services/investAssetService.js';
import { mockedPrisma } from './prisma.mock.js';

/**
 * Investment Asset Service Tests - ROI Calculations
 *
 * EXPECTED ROI FORMULAS (these tests verify the service implements these correctly):
 *
 * 1. Individual Asset ROI Value:
 *    absolute_roi_value = current_value + withdrawn_amount - (invested_value + fees_taxes)
 *
 * 2. Individual Asset ROI Percentage:
 *    relative_roi_percentage = (absolute_roi_value / (invested_value + fees_taxes)) * 100
 *    Special case: if (invested_value + fees_taxes) = 0, then return '∞'
 *
 * 3. Global (Portfolio) ROI Value:
 *    global_roi_value = sum(current_value) - sum(invested_value) + sum(withdrawn_amount) - sum(fees_taxes)
 *    Note: Fees MUST be included in global ROI calculation
 *
 * 4. Global ROI Percentage:
 *    global_roi_percentage = (global_roi_value / (sum(invested_value) + sum(fees_taxes))) * 100
 *    Special case: if denominator = 0, then return '-'
 *
 * 5. Current Year ROI:
 *    expected_breakeven = last_year_value + current_year_invested + current_year_fees
 *    current_year_roi_value = current_value - expected_breakeven
 *    current_year_roi_percentage = (current_year_roi_value / expected_breakeven) * 100
 *
 * These tests mock at the DATA SOURCE level (snapshots, fees, prices from DB),
 * NOT at the calculated results level, so the actual ROI calculation logic runs!
 */

describe('investAssetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAssetStatsForUser - ROI Calculations', () => {
    test('Should return correct stats with no assets', async () => {
      const userId = 1n;

      mockedPrisma.invest_assets.findMany.mockResolvedValue([]);
      vi.spyOn(
        InvestAssetService,
        'getCombinedInvestedBalanceBetweenDatesForUser'
      ).mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getCombinedFeesAndTaxesBetweenDates').mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getCombinedRoiByYear').mockResolvedValue({});

      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);

      expect(result.total_invested_value).toBe(0);
      expect(result.total_current_value).toBe(0);
      expect(result.global_roi_value).toBe(0);
      expect(result.global_roi_percentage).toBe('-');
      expect(result.current_year_roi_value).toBe(0);
      expect(result.monthly_snapshots).toEqual([]);
      expect(result.top_performing_assets).toEqual([]);
    });

    test('Should calculate correct ROI for single asset - basic case', async () => {
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

      mockedPrisma.invest_assets.findMany.mockResolvedValue(rawAssets as any);
      vi.spyOn(InvestAssetService, 'getLatestSnapshotForAsset').mockResolvedValue({
        month: 12,
        year: 2024,
        units: 100,
        invested_amount: 100000n, // $1000
        current_value: 120000n, // $1200
        invest_assets_asset_id: 1n,
        created_at: 1234567890n,
        updated_at: 1234567890n,
        withdrawn_amount: 0n,
      });

      vi.spyOn(InvestAssetService, 'getTotalFessAndTaxesForAsset').mockResolvedValue('10');
      vi.spyOn(InvestAssetService, 'getAverageBuyingPriceForAsset').mockResolvedValue(10);

      vi.spyOn(
        InvestAssetService,
        'getCombinedInvestedBalanceBetweenDatesForUser'
      ).mockResolvedValue(50);
      vi.spyOn(InvestAssetService, 'getCombinedFeesAndTaxesBetweenDates').mockResolvedValue(5);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getCombinedRoiByYear').mockResolvedValue({});

      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);

      // Verify calculations ran correctly:
      // invested=1000, fees=10, current=1200, withdrawn=0
      // absolute_roi = 1200 + 0 - (1000 + 10) = 190
      // relative_roi = (190 / 1010) * 100 = 18.81%
      // global_roi_value = 1200 - 1000 - 10 + 0 = 190
      // global_roi_percentage = (190 / 1010) * 100 = 18.81%
      expect(result.total_invested_value).toBe(1000);
      expect(result.total_current_value).toBe(1200);
      expect(result.global_roi_value).toBe(190);
      expect(result.global_roi_percentage).toBeCloseTo(18.81, 1);

      expect(result.top_performing_assets).toHaveLength(1);
      expect(result.top_performing_assets[0].absolute_roi_value).toBe(190);
      expect(result.top_performing_assets[0].relative_roi_percentage).toBeCloseTo(18.81, 1);
      expect(result.top_performing_assets[0].fees_taxes).toBe(10);
    });

    test('Should calculate global ROI correctly with fees', async () => {
      const userId = 1n;

      const rawAssets = [
        {
          asset_id: 1n,
          name: 'Stock A',
          ticker: 'A',
          type: 'Stock',
          units: new Prisma.Decimal(50),
          broker: 'Broker',
          users_user_id: userId,
          created_at: 1234567890n,
          updated_at: 1234567890n,
        },
      ];

      mockedPrisma.invest_assets.findMany.mockResolvedValue(rawAssets as any);

      vi.spyOn(InvestAssetService, 'getLatestSnapshotForAsset').mockResolvedValue({
        month: 12,
        year: 2024,
        units: 50,
        invested_amount: 50000n, // $500
        current_value: 60000n, // $600
        invest_assets_asset_id: 1n,
        created_at: 1234567890n,
        updated_at: 1234567890n,
        withdrawn_amount: 0n,
      });

      vi.spyOn(InvestAssetService, 'getTotalFessAndTaxesForAsset').mockResolvedValue('50');
      vi.spyOn(InvestAssetService, 'getAverageBuyingPriceForAsset').mockResolvedValue(10);

      vi.spyOn(
        InvestAssetService,
        'getCombinedInvestedBalanceBetweenDatesForUser'
      ).mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getCombinedFeesAndTaxesBetweenDates').mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getCombinedRoiByYear').mockResolvedValue({});

      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);

      // Invested $500, paid $50 fees, now worth $600
      // Global ROI: $600 - $500 - $50 = $50
      // Global ROI %: ($50 / $550) * 100 = 9.09%
      // THIS TEST WILL FAIL IF THE SERVICE DOESN'T INCLUDE FEES
      expect(result.global_roi_value).toBe(50);
      expect(result.global_roi_percentage).toBeCloseTo(9.09, 1);
      expect(result.top_performing_assets[0].absolute_roi_value).toBe(50);
    });

    test('Should calculate ROI correctly with withdrawals', async () => {
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

      mockedPrisma.invest_assets.findMany.mockResolvedValue(rawAssets as any);

      vi.spyOn(InvestAssetService, 'getLatestSnapshotForAsset').mockResolvedValue({
        month: 12,
        year: 2024,
        units: 50,
        invested_amount: 200000n, // $2000
        current_value: 110000n, // $1100
        invest_assets_asset_id: 1n,
        created_at: 1234567890n,
        updated_at: 1234567890n,
        withdrawn_amount: 100000n, // $1000
      });

      vi.spyOn(InvestAssetService, 'getTotalFessAndTaxesForAsset').mockResolvedValue('10');
      vi.spyOn(InvestAssetService, 'getAverageBuyingPriceForAsset').mockResolvedValue(20);

      vi.spyOn(
        InvestAssetService,
        'getCombinedInvestedBalanceBetweenDatesForUser'
      ).mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getCombinedFeesAndTaxesBetweenDates').mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getCombinedRoiByYear').mockResolvedValue({});

      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);

      // Invested $2000, withdrew $1000, paid $10 fees, current $1100
      // Global ROI: $1100 - $2000 + $1000 - $10 = $90
      // Global ROI %: ($90 / ($1000 + $10)) * 100 = 8.91%
      expect(result.total_invested_value).toBe(1000);
      expect(result.total_current_value).toBe(1100);
      expect(result.global_roi_value).toBe(90);
      expect(result.global_roi_percentage).toBeCloseTo(8.91, 1);
      expect(result.top_performing_assets[0].absolute_roi_value).toBe(90);
      expect(result.top_performing_assets[0].withdrawn_amount).toBe(1000);
    });

    test('Should calculate ROI with multiple assets and sort by performance', async () => {
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
        {
          asset_id: 2n,
          name: 'Bond Fund',
          ticker: 'BOND',
          type: 'Bond',
          units: new Prisma.Decimal(50),
          broker: 'Broker B',
          users_user_id: userId,
          created_at: 1234567890n,
          updated_at: 1234567890n,
        },
        {
          asset_id: 3n,
          name: 'Crypto',
          ticker: 'BTC',
          type: 'Crypto',
          units: new Prisma.Decimal(0.5),
          broker: 'Exchange',
          users_user_id: userId,
          created_at: 1234567890n,
          updated_at: 1234567890n,
        },
      ];

      mockedPrisma.invest_assets.findMany.mockResolvedValue(rawAssets as any);

      vi.spyOn(InvestAssetService, 'getLatestSnapshotForAsset').mockImplementation(
        async (assetId: bigint) => {
          if (assetId === 1n) {
            return {
              month: 12,
              year: 2024,
              units: 100,
              invested_amount: 100000n,
              current_value: 120000n,
              invest_assets_asset_id: 1n,
              created_at: 1234567890n,
              updated_at: 1234567890n,
              withdrawn_amount: 0n,
            };
          } else if (assetId === 2n) {
            return {
              month: 12,
              year: 2024,
              units: 50,
              invested_amount: 50000n,
              current_value: 52000n,
              invest_assets_asset_id: 2n,
              created_at: 1234567890n,
              updated_at: 1234567890n,
              withdrawn_amount: 0n,
            };
          } else {
            return {
              month: 12,
              year: 2024,
              units: 0.5,
              invested_amount: 200000n,
              current_value: 180000n,
              invest_assets_asset_id: 3n,
              created_at: 1234567890n,
              updated_at: 1234567890n,
              withdrawn_amount: 0n,
            };
          }
        }
      );

      vi.spyOn(InvestAssetService, 'getTotalFessAndTaxesForAsset').mockImplementation(
        async (assetId: bigint) => {
          if (assetId === 1n) return '10';
          if (assetId === 2n) return '5';
          return '10';
        }
      );

      vi.spyOn(InvestAssetService, 'getAverageBuyingPriceForAsset').mockImplementation(
        async (assetId: bigint) => {
          if (assetId === 3n) return 4000;
          return 10;
        }
      );

      vi.spyOn(
        InvestAssetService,
        'getCombinedInvestedBalanceBetweenDatesForUser'
      ).mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getCombinedFeesAndTaxesBetweenDates').mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getCombinedRoiByYear').mockResolvedValue({});

      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);

      // Asset 1: invested=1000, fees=10, current=1200, roi=190
      // Asset 2: invested=500, fees=5, current=520, roi=15
      // Asset 3: invested=2000, fees=10, current=1800, roi=-210
      // Total: invested=3500, fees=25, current=3520
      // Global ROI: 3520 - 3500 - 25 = -5
      expect(result.total_invested_value).toBe(3500);
      expect(result.total_current_value).toBe(3520);
      expect(result.global_roi_value).toBe(-5);
      expect(result.global_roi_percentage).toBeCloseTo(-0.14, 2);

      // Verify sorting by absolute ROI (descending)
      expect(result.top_performing_assets).toHaveLength(3);
      expect(result.top_performing_assets[0].absolute_roi_value).toBe(190);
      expect(result.top_performing_assets[1].absolute_roi_value).toBe(15);
      expect(result.top_performing_assets[2].absolute_roi_value).toBe(-210);
    });

    test('Should handle negative ROI correctly', async () => {
      const userId = 1n;

      const rawAssets = [
        {
          asset_id: 1n,
          name: 'Losing Stock',
          ticker: 'LOSE',
          type: 'Stock',
          units: new Prisma.Decimal(100),
          broker: 'Broker',
          users_user_id: userId,
          created_at: 1234567890n,
          updated_at: 1234567890n,
        },
      ];

      mockedPrisma.invest_assets.findMany.mockResolvedValue(rawAssets as any);

      vi.spyOn(InvestAssetService, 'getLatestSnapshotForAsset').mockResolvedValue({
        month: 12,
        year: 2024,
        units: 100,
        invested_amount: 100000n,
        current_value: 60000n,
        invest_assets_asset_id: 1n,
        created_at: 1234567890n,
        updated_at: 1234567890n,
        withdrawn_amount: 0n,
      });

      vi.spyOn(InvestAssetService, 'getTotalFessAndTaxesForAsset').mockResolvedValue('20');
      vi.spyOn(InvestAssetService, 'getAverageBuyingPriceForAsset').mockResolvedValue(10);

      vi.spyOn(
        InvestAssetService,
        'getCombinedInvestedBalanceBetweenDatesForUser'
      ).mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getCombinedFeesAndTaxesBetweenDates').mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getCombinedRoiByYear').mockResolvedValue({});

      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);

      // Invested $1000, paid $20 fees, now worth $600
      // Global ROI: 600 - 1000 - 20 = -420
      expect(result.global_roi_value).toBe(-420);
      expect(result.global_roi_percentage).toBeCloseTo(-41.18, 1);
      expect(result.top_performing_assets[0].absolute_roi_value).toBe(-420);
    });

    test('Should handle infinity ROI when invested amount is zero', async () => {
      const userId = 1n;

      const rawAssets = [
        {
          asset_id: 1n,
          name: 'Free Stock',
          ticker: 'FREE',
          type: 'Stock',
          units: new Prisma.Decimal(10),
          broker: 'Broker',
          users_user_id: userId,
          created_at: 1234567890n,
          updated_at: 1234567890n,
        },
      ];

      mockedPrisma.invest_assets.findMany.mockResolvedValue(rawAssets as any);

      vi.spyOn(InvestAssetService, 'getLatestSnapshotForAsset').mockResolvedValue({
        month: 12,
        year: 2024,
        units: 10,
        invested_amount: 0n,
        current_value: 10000n,
        invest_assets_asset_id: 1n,
        created_at: 1234567890n,
        updated_at: 1234567890n,
        withdrawn_amount: 0n,
      });

      vi.spyOn(InvestAssetService, 'getTotalFessAndTaxesForAsset').mockResolvedValue('0');
      vi.spyOn(InvestAssetService, 'getAverageBuyingPriceForAsset').mockResolvedValue(0);

      vi.spyOn(
        InvestAssetService,
        'getCombinedInvestedBalanceBetweenDatesForUser'
      ).mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getCombinedFeesAndTaxesBetweenDates').mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getCombinedRoiByYear').mockResolvedValue({});

      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);

      expect(result.top_performing_assets[0].relative_roi_percentage).toBe('∞');
      expect(result.global_roi_percentage).toBe('-');
    });

    test('Should distribute values by asset type correctly', async () => {
      const userId = 1n;

      const rawAssets = [
        {
          asset_id: 1n,
          name: 'Stock 1',
          ticker: 'S1',
          type: 'Stock',
          units: new Prisma.Decimal(100),
          broker: 'Broker A',
          users_user_id: userId,
          created_at: 1234567890n,
          updated_at: 1234567890n,
        },
        {
          asset_id: 2n,
          name: 'Bond 1',
          ticker: 'B1',
          type: 'Bond',
          units: new Prisma.Decimal(50),
          broker: 'Broker B',
          users_user_id: userId,
          created_at: 1234567890n,
          updated_at: 1234567890n,
        },
        {
          asset_id: 3n,
          name: 'Stock 2',
          ticker: 'S2',
          type: 'Stock',
          units: new Prisma.Decimal(10),
          broker: 'Broker A',
          users_user_id: userId,
          created_at: 1234567890n,
          updated_at: 1234567890n,
        },
      ];

      mockedPrisma.invest_assets.findMany.mockResolvedValue(rawAssets as any);

      vi.spyOn(InvestAssetService, 'getLatestSnapshotForAsset').mockImplementation(
        async (assetId: bigint) => {
          if (assetId === 1n) {
            return {
              month: 12,
              year: 2024,
              units: 100,
              invested_amount: 100000n,
              current_value: 60000n,
              invest_assets_asset_id: 1n,
              created_at: 1234567890n,
              updated_at: 1234567890n,
              withdrawn_amount: 0n,
            };
          } else if (assetId === 2n) {
            return {
              month: 12,
              year: 2024,
              units: 50,
              invested_amount: 50000n,
              current_value: 30000n,
              invest_assets_asset_id: 2n,
              created_at: 1234567890n,
              updated_at: 1234567890n,
              withdrawn_amount: 0n,
            };
          } else {
            return {
              month: 12,
              year: 2024,
              units: 10,
              invested_amount: 10000n,
              current_value: 10000n,
              invest_assets_asset_id: 3n,
              created_at: 1234567890n,
              updated_at: 1234567890n,
              withdrawn_amount: 0n,
            };
          }
        }
      );

      vi.spyOn(InvestAssetService, 'getTotalFessAndTaxesForAsset').mockImplementation(
        async (assetId: bigint) => {
          if (assetId === 1n) return '10';
          if (assetId === 2n) return '5';
          return '1';
        }
      );

      vi.spyOn(InvestAssetService, 'getAverageBuyingPriceForAsset').mockResolvedValue(10);

      vi.spyOn(
        InvestAssetService,
        'getCombinedInvestedBalanceBetweenDatesForUser'
      ).mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getCombinedFeesAndTaxesBetweenDates').mockResolvedValue(0);
      vi.spyOn(InvestAssetService, 'getAllAssetSnapshotsForUser').mockResolvedValue([]);
      vi.spyOn(InvestAssetService, 'getCombinedRoiByYear').mockResolvedValue({});

      const result = await InvestAssetService.getAssetStatsForUser(userId, mockedPrisma);

      // Total: 1000, Stock: 700 (70%), Bond: 300 (30%)
      expect(result.current_value_distribution).toHaveLength(2);

      const stockDist = result.current_value_distribution.find((d) => d.Stock !== undefined);
      const bondDist = result.current_value_distribution.find((d) => d.Bond !== undefined);

      expect(stockDist.Stock).toBeCloseTo(70, 0);
      expect(bondDist.Bond).toBeCloseTo(30, 0);
    });
  });
});
