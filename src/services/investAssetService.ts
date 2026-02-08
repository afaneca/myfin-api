import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library.js';
import { performDatabaseRequest, prisma } from '../config/prisma.js';
import { MYFIN } from '../consts.js';
import APIError from '../errorHandling/apiError.js';
import DateTimeUtils from '../utils/DateTimeUtils.js';
import Logger from '../utils/Logger.js';
import ROICalculator, { type TransactionFlowData } from '../utils/ROICalculator.js';
import ConvertUtils from '../utils/convertUtils.js';
import InvestTransactionsService from './investTransactionsService.js';

interface CalculatedAssetAmounts {
  invested_value?: number;
  currently_invested_value?: number;
  withdrawn_amount?: number;
  current_value?: number;
  absolute_roi_value?: number;
  relative_roi_percentage?: number | string;
  price_per_unit?: number;
  fees_taxes?: number;
  income_amount?: number;
  cost_amount?: number;
}

export type InvestAssetWithCalculatedAmounts = CalculatedAssetAmounts & {
  asset_id?: bigint;
  name?: string;
  ticker?: string;
  type?: string;
  units?: number | Prisma.Decimal;
  broker?: string;
};

interface CalculatedAssetStats {
  // Global portfolio metrics
  global_roi_value: number;
  global_roi_percentage: number | string;
  total_current_value: number;
  total_currently_invested_value: number;

  // Current year metrics (using simple ROI)
  current_year_roi_value: number;
  current_year_roi_percentage: number;

  // Historical data
  monthly_snapshots: Array<MonthlySnapshot>;
  current_value_distribution: Array<AssetTypeDistribution>;
  combined_roi_by_year: Record<number, YearlyROI>;
  top_performing_assets: Array<InvestAssetWithCalculatedAmounts>;
}

interface MonthlySnapshot {
  month: number;
  year: number;
  units: number;
  invested_amount: number;
  current_value: number;
  withdrawn_amount: number;
  income_amount: number;
  cost_amount: number;
  fees_taxes: number;
  asset_id: bigint;
  asset_name: string;
  asset_ticker: string;
  asset_broker: string;
}

interface AssetTypeDistribution {
  type: string;
  percentage: number | string;
  value: number;
}

interface YearlyROI {
  roi_percentage: number;
  roi_value: number;
  beginning_value: number;
  ending_value: number;
  total_net_flows: number;
  total_inflow: number;
  total_outflow: number;
  value_total_amount: number;
}

interface InvestAssetEvoSnapshot {
  month: number;
  year: number;
  units: Decimal;
  invested_amount: bigint | number;
  current_value: bigint | number;
  invest_assets_asset_id: bigint | number;
  created_at: bigint | number;
  updated_at: bigint | number;
  withdrawn_amount: bigint | number;
  income_amount: bigint | number;
  cost_amount: bigint | number;
  fees_taxes?: bigint | number;
}

interface Asset {
  assetId?: bigint;
  name: string;
  ticker?: string;
  units?: number;
  type: string;
  broker: string;
}
class InvestAssetService {
  static async getLatestSnapshotForAsset(
    assetId: bigint,
    maxMonth = DateTimeUtils.getMonthNumberFromTimestamp(),
    maxYear = DateTimeUtils.getYearFromTimestamp(),
    dbClient = prisma
  ): Promise<InvestAssetEvoSnapshot> {
    const result = await dbClient.$queryRaw`SELECT *
                                              FROM invest_asset_evo_snapshot
                                              WHERE invest_assets_asset_id = ${assetId}
                                                AND (year < ${maxYear} OR (year = ${maxYear} AND month <= ${maxMonth}))
                                              ORDER BY YEAR DESC, MONTH DESC
                                              LIMIT 1`;

    if (!result || !Array.isArray(result) || (result as Array<any>).length < 1) return null;
    return result[0];
  }

  static async getTotalFeesAndTaxesForAsset(assetId: bigint, dbClient = prisma) {
    const result = await dbClient.$queryRaw`SELECT sum(
                                              (COALESCE(fees_taxes_amount, 0) + 
                                              (CASE WHEN type = ${MYFIN.INVEST.TRX_TYPE.COST} THEN total_price ELSE 0 END)) / 100
                                              ) as fees_taxes
                                              FROM invest_transactions
                                              WHERE invest_assets_asset_id = ${assetId}`;

    return result[0].fees_taxes ?? 0;
  }

  /**
   * Get external fees on income transactions for an asset
   * External fees are those where fees_taxes_units <= 0 (not deducted from units)
   */
  static async getExternalFeesOnIncomeForAsset(assetId: bigint, dbClient = prisma) {
    const result =
      await dbClient.$queryRaw`SELECT COALESCE(sum(fees_taxes_amount / 100), 0) as fees_taxes
                                              FROM invest_transactions
                                              WHERE invest_assets_asset_id = ${assetId}
                                                AND type = 'I'
                                                AND (fees_taxes_units <= 0 OR fees_taxes_units IS NULL)`;

    if (!result || !Array.isArray(result) || result.length < 1) return 0;
    return Number(result[0].fees_taxes) || 0;
  }

  static async getAverageBuyingPriceForAsset(assetId: bigint, dbClient = prisma) {
    const result = await dbClient.$queryRaw`SELECT total_price / units as avg_price
                                              FROM (SELECT sum(total_price / 100) as total_price, sum(units) as units
                                                    FROM invest_transactions
                                                    WHERE invest_assets_asset_id = ${assetId}
                                                      AND type = 'B') dataset `;
    return result[0].avg_price;
  }

  /**
   * Calculate asset amounts with ROI using transaction data
   * This matches the calculation used in getAssetStatsForUser
   *
   * @param asset Asset to calculate amounts for
   * @param allSnapshots All snapshots for the user (for filtering by asset)
   * @param allTransactions All transactions for the user (for filtering by asset)
   * @param dbClient Database client
   * @returns Asset with calculated amounts including ROI
   */
  private static async calculateAssetAmountsWithROI(
    asset: Prisma.invest_assetsCreateInput,
    allSnapshots: Array<MonthlySnapshot>,
    allTransactions: TransactionFlowData[],
    dbClient = prisma
  ): Promise<InvestAssetWithCalculatedAmounts> {
    const assetId = asset.asset_id as bigint;
    const enableLogging = false;
    // Get latest snapshot for basic amounts
    const snapshot = await InvestAssetService.getLatestSnapshotForAsset(
      assetId,
      undefined,
      undefined,
      dbClient
    );

    const investedValue = ConvertUtils.convertBigIntegerToFloat(
      BigInt(snapshot?.invested_amount ?? 0)
    );
    const withdrawnAmount = ConvertUtils.convertBigIntegerToFloat(
      BigInt(snapshot?.withdrawn_amount ?? 0)
    );
    const currentValue = ConvertUtils.convertBigIntegerToFloat(
      BigInt(snapshot?.current_value ?? 0)
    );
    const incomeAmount = ConvertUtils.convertBigIntegerToFloat(
      BigInt(snapshot?.income_amount ?? 0)
    );
    const costAmount = ConvertUtils.convertBigIntegerToFloat(BigInt(snapshot?.cost_amount ?? 0));
    const feesAndTaxes = Number.parseFloat(
      await InvestAssetService.getTotalFeesAndTaxesForAsset(assetId, dbClient)
    );
    if (enableLogging) Logger.addLog(`invested value = ${investedValue}`);
    if (enableLogging) Logger.addLog(`withdrawn value = ${withdrawnAmount}`);
    if (enableLogging) Logger.addLog(`current value = ${currentValue}`);
    if (enableLogging) Logger.addLog(`income value = ${incomeAmount}`);
    if (enableLogging) Logger.addLog(`cost value = ${costAmount}`);
    if (enableLogging) Logger.addLog(`fees/taxes value = ${feesAndTaxes}`);

    // Get external fees on income to calculate net income
    // Net income = gross income - external fees on income
    const externalFeesOnIncome = await InvestAssetService.getExternalFeesOnIncomeForAsset(
      assetId,
      dbClient
    );
    const netIncome = incomeAmount - externalFeesOnIncome;

    // Currently invested = invested - withdrawn - net income received
    let currentlyInvestedValue = investedValue - withdrawnAmount - netIncome;
    if (currentlyInvestedValue < 0) currentlyInvestedValue = 0;

    const pricePerUnit = await InvestAssetService.getAverageBuyingPriceForAsset(assetId, dbClient);

    if (enableLogging) Logger.addLog(`external fees on income = ${externalFeesOnIncome}`);
    if (enableLogging) Logger.addLog(`net income: ${netIncome}`);
    if (enableLogging) Logger.addLog(`currently Invested Value: ${currentlyInvestedValue}`);
    if (enableLogging) Logger.addLog(`price per unit: ${pricePerUnit}`);

    // Filter transactions for this asset
    const assetTransactions = allTransactions.filter(
      (t) =>
        (t as TransactionFlowData & { asset_id?: bigint }).asset_id?.toString() ===
        assetId.toString()
    );

    // Calculate ROI
    const roi = InvestAssetService.calculateSingleAssetROI(assetTransactions, currentValue);
    if (enableLogging) Logger.addLog(`roi result: ${JSON.stringify(roi)}`);

    return {
      asset_id: assetId,
      name: asset.name,
      ticker: asset.ticker,
      type: asset.type,
      units: asset.units as number,
      broker: asset.broker,
      invested_value: investedValue,
      currently_invested_value: currentlyInvestedValue,
      withdrawn_amount: withdrawnAmount,
      current_value: currentValue,
      absolute_roi_value: roi.value,
      relative_roi_percentage: roi.percentage,
      price_per_unit: pricePerUnit,
      fees_taxes: feesAndTaxes,
      income_amount: incomeAmount,
      cost_amount: costAmount,
    };
  }

  static async getAllAssetsForUser(
    userId: bigint,
    dbClient = prisma
  ): Promise<Array<InvestAssetWithCalculatedAmounts>> {
    return performDatabaseRequest(async (prismaTx) => {
      const assets = await prismaTx.invest_assets.findMany({
        where: {
          users_user_id: userId,
        },
      });

      // Fetch snapshots and transactions once for all assets (performance optimization)
      const monthlySnapshots = await InvestAssetService.getAllAssetSnapshotsForUser(
        userId,
        prismaTx
      );

      const yearOfFirstSnapshot =
        monthlySnapshots.length > 0
          ? monthlySnapshots[0].year
          : DateTimeUtils.getYearFromTimestamp();

      const periodStartTimestamp = DateTimeUtils.getUnixTimestampFromDate(
        new Date(yearOfFirstSnapshot, 0, 1)
      );
      const periodEndTimestamp = DateTimeUtils.getCurrentUnixTimestamp();
      const allTransactions =
        (await InvestTransactionsService.getAllTransactionsForUserBetweenDates(
          userId,
          periodStartTimestamp,
          periodEndTimestamp,
          prismaTx
        )) as TransactionFlowData[];

      const calculatedAmountPromises = [];
      for (const asset of assets) {
        calculatedAmountPromises.push(
          InvestAssetService.calculateAssetAmountsWithROI(
            asset,
            monthlySnapshots,
            allTransactions,
            prismaTx
          )
        );
      }

      return (
        ((await Promise.all(calculatedAmountPromises)) as Array<InvestAssetWithCalculatedAmounts>)
          // Sort assets array by current value (DESC)
          .sort((a, b) => {
            return b.current_value - a.current_value;
          })
      );
    }, dbClient);
  }

  static async createAsset(userId: bigint, asset: Asset, dbClient = prisma) {
    return dbClient.invest_assets.create({
      data: {
        name: asset.name,
        ticker: asset.ticker,
        units: asset.units ?? 0,
        type: asset.type,
        broker: asset.broker,
        created_at: DateTimeUtils.getCurrentUnixTimestamp(),
        updated_at: DateTimeUtils.getCurrentUnixTimestamp(),
        users_user_id: userId,
      },
    });
  }

  static async updateAsset(userId: bigint, asset: Asset, dbClient = prisma) {
    return dbClient.invest_assets.update({
      where: {
        users_user_id: userId,
        asset_id: asset.assetId,
      },
      data: {
        name: asset.name,
        ticker: asset.ticker,
        units: asset.units,
        type: asset.type,
        broker: asset.broker,
        updated_at: DateTimeUtils.getCurrentUnixTimestamp(),
      },
    });
  }

  static async doesAssetBelongToUser(userId: bigint, assetId: bigint, dbClient = prisma) {
    const result = await dbClient.invest_assets.findFirst({
      where: {
        users_user_id: userId,
        asset_id: assetId,
      },
    });

    return result !== null;
  }

  static async performUpdateAssetValue(
    month: number,
    year: number,
    assetId: bigint,
    units: number | Prisma.Decimal,
    withdrawnAmount: number,
    newValue: number,
    dbClient = prisma
  ) {
    const latestSnapshot = await InvestAssetService.getLatestSnapshotForAsset(
      assetId,
      month,
      year,
      dbClient
    );
    return dbClient.$queryRaw`INSERT INTO invest_asset_evo_snapshot (month, year, units, invested_amount, current_value,
                                                                       invest_assets_asset_id, created_at, updated_at,
                                                                       withdrawn_amount, income_amount, cost_amount)
                                VALUES (${month}, ${year}, ${units}, ${
                                  latestSnapshot?.invested_amount ?? 0
                                },
                                        ${ConvertUtils.convertFloatToBigInteger(
                                          newValue
                                        )}, ${assetId},
                                        ${DateTimeUtils.getCurrentUnixTimestamp()},
                                        ${DateTimeUtils.getCurrentUnixTimestamp()},
                                        ${
                                          withdrawnAmount
                                            ? ConvertUtils.convertFloatToBigInteger(
                                                Number(withdrawnAmount)
                                              )
                                            : 0
                                        },
                                        ${latestSnapshot?.income_amount ?? 0},
                                        ${latestSnapshot?.cost_amount ?? 0})
                                ON DUPLICATE KEY UPDATE current_value = ${ConvertUtils.convertFloatToBigInteger(
                                  newValue
                                )},
                                                        updated_at    = ${DateTimeUtils.getCurrentUnixTimestamp()}`;
  }

  static async updateAssetValue(
    userId: bigint,
    assetId: bigint,
    newValue: number,
    month: number,
    year: number,
    createBuffer = true,
    dbClient = prisma
  ) {
    const units = (
      await dbClient.invest_assets.findFirst({
        where: { users_user_id: userId, asset_id: assetId },
        select: { units: true },
      })
    ).units;
    const withdrawnAmountRaw =
      (await InvestAssetService.getLatestSnapshotForAsset(assetId, month, year, dbClient))
        ?.withdrawn_amount ?? 0;
    const withdrawnAmount = ConvertUtils.convertBigIntegerToFloat(withdrawnAmountRaw as bigint);
    await InvestAssetService.performUpdateAssetValue(
      month,
      year,
      assetId,
      units,
      withdrawnAmount as number,
      newValue,
      dbClient
    );

    const bufferPromises = [];
    if (createBuffer) {
      // Snapshot next 6 months also, to create a buffer (in case no more snapshots are added till then)
      let nextMonth;
      for (let i = 0; i < 6; i++) {
        nextMonth = DateTimeUtils.incrementMonthByX(month, year, i + 1);
        bufferPromises.push(
          InvestAssetService.performUpdateAssetValue(
            nextMonth.month,
            nextMonth.year,
            assetId,
            units,
            withdrawnAmount as number,
            newValue,
            dbClient
          )
        );
      }
    }

    await Promise.all(bufferPromises);
  }

  static async updateCurrentAssetValue(
    userId: bigint,
    assetId: bigint,
    newValue: number,
    month = DateTimeUtils.getMonthNumberFromTimestamp(),
    year = DateTimeUtils.getYearFromTimestamp(),
    dbClient = undefined
  ) {
    return performDatabaseRequest(async (prismaTx) => {
      if (!(await InvestAssetService.doesAssetBelongToUser(userId, assetId, prismaTx))) {
        throw APIError.notAuthorized();
      }
      const isCurrentDate =
        month === DateTimeUtils.getMonthNumberFromTimestamp() &&
        year === DateTimeUtils.getYearFromTimestamp();

      await InvestAssetService.updateAssetValue(
        userId,
        assetId,
        newValue,
        month,
        year,
        isCurrentDate,
        prismaTx
      );
    }, dbClient);
  }
  static async getAllAssetSnapshotsForUser(
    userId: bigint,
    dbClient = prisma
  ): Promise<Array<MonthlySnapshot>> {
    const rawSnapshots = (await dbClient.$queryRaw`SELECT month,
                                year,
                                invest_asset_evo_snapshot.units,
                                (invested_amount / 100) as 'invested_amount',
                                (current_value / 100)   as 'current_value',
                                (withdrawn_amount / 100) as 'withdrawn_amount',
                                (income_amount / 100) as 'income_amount',
                                (cost_amount / 100) as 'cost_amount',
                                (fees_taxes / 100) as 'fees_taxes',
                                invest_assets_asset_id  as 'asset_id',
                                name                    as 'asset_name',
                                ticker                  as 'asset_ticker',
                                broker                  as 'asset_broker'
                         FROM invest_asset_evo_snapshot
                                  INNER JOIN invest_assets ON invest_assets.asset_id = invest_assets_asset_id
                         WHERE users_user_id = ${userId}
                           AND (year < ${DateTimeUtils.getYearFromTimestamp()} OR (year = ${DateTimeUtils.getYearFromTimestamp()} AND month <= ${DateTimeUtils.getMonthNumberFromTimestamp()}))
                         ORDER BY year ASC, month ASC;`) as Array<MonthlySnapshot>;

    if (!rawSnapshots || rawSnapshots.length === 0) return [];

    const filledSnapshots: MonthlySnapshot[] = [];
    const lastKnownAssetStates = new Map<string, MonthlySnapshot>();

    const firstSnapshot = rawSnapshots[0];
    let loopMonth = firstSnapshot.month;
    let loopYear = firstSnapshot.year;

    const currentYear = DateTimeUtils.getYearFromTimestamp();
    const currentMonth = DateTimeUtils.getMonthNumberFromTimestamp();

    let rawIndex = 0;

    // Loop through every month from first snapshot's date up to current date
    while (loopYear < currentYear || (loopYear === currentYear && loopMonth <= currentMonth)) {
      // 1. Update states with any actual snapshots for this month
      while (
        rawIndex < rawSnapshots.length &&
        rawSnapshots[rawIndex].year === loopYear &&
        rawSnapshots[rawIndex].month === loopMonth
      ) {
        const snap = rawSnapshots[rawIndex];
        lastKnownAssetStates.set(snap.asset_id.toString(), snap);
        rawIndex++;
      }

      // 2. Add carried-over (or fresh) states for this month
      for (const snap of lastKnownAssetStates.values()) {
        filledSnapshots.push({
          ...snap,
          month: loopMonth,
          year: loopYear,
        });
      }

      // Move to next month
      const nextDate = DateTimeUtils.incrementMonthByX(loopMonth, loopYear, 1);
      loopMonth = nextDate.month;
      loopYear = nextDate.year;
    }

    return filledSnapshots;
  }

  static async getTotalInvestmentValueAtDate(
    userId: bigint,
    maxMonth = DateTimeUtils.getMonthNumberFromTimestamp(),
    maxYear = DateTimeUtils.getYearFromTimestamp(),
    dbClient = prisma
  ) {
    const userAssets = await dbClient.invest_assets.findMany({
      where: { users_user_id: userId },
      select: { asset_id: true },
    });

    const snapshots = await Promise.all(
      userAssets.map((asset) =>
        InvestAssetService.getLatestSnapshotForAsset(asset.asset_id, maxMonth, maxYear, dbClient)
      )
    );

    let totalValue = BigInt(0);
    for (const snapshot of snapshots) {
      if (snapshot?.current_value) {
        totalValue += BigInt(snapshot.current_value);
      }
    }

    return totalValue;
  }
  /**
   * Calculate ROI by year using simple ROI formula
   * ROI = (Current Value - Money Out + Money In) / Money Out
   *
   * @param userId User ID
   * @param initialYear First year to calculate from
   * @param dbClient Database client
   * @returns Record of yearly ROI data
   */
  static async getCombinedROIByYear(
    userId: bigint,
    initialYear: number,
    dbClient = undefined
  ): Promise<Record<number, YearlyROI>> {
    return performDatabaseRequest(async (prismaTx) => {
      const roiByYear: Record<number, YearlyROI> = {};
      const currentYear = DateTimeUtils.getYearFromTimestamp();

      // Fetch all transactions for the entire period once (more efficient than per-year queries)
      const periodStartTimestamp = DateTimeUtils.getUnixTimestampFromDate(
        new Date(initialYear, 0, 1)
      );
      const periodEndTimestamp = DateTimeUtils.getCurrentUnixTimestamp();
      const allTransactions =
        (await InvestTransactionsService.getAllTransactionsForUserBetweenDates(
          userId,
          periodStartTimestamp,
          periodEndTimestamp,
          prismaTx
        )) as TransactionFlowData[];

      let yearInLoop = initialYear;
      while (yearInLoop <= currentYear) {
        const isCurrentYear = yearInLoop === currentYear;
        const maxMonth = isCurrentYear ? DateTimeUtils.getMonthNumberFromTimestamp() : 12;

        const enableLogging = false;

        // Get beginning value (end of previous year)
        const prevYearValue = await InvestAssetService.getTotalInvestmentValueAtDate(
          userId,
          12,
          yearInLoop - 1,
          prismaTx
        );
        const beginningValue = ConvertUtils.convertBigIntegerToFloat(prevYearValue || 0n);
        if (enableLogging) Logger.addLog(`Beginning value 2026: ${beginningValue}`);
        // Get ending value (end of current period)
        const currentValue = await InvestAssetService.getTotalInvestmentValueAtDate(
          userId,
          maxMonth,
          yearInLoop,
          prismaTx
        );
        const endingValue = ConvertUtils.convertBigIntegerToFloat(currentValue || 0n);
        if (enableLogging) Logger.addLog(`Ending value ${maxMonth}/${yearInLoop}: ${endingValue}`);
        // Calculate period timestamps for this year
        const yearStartTimestamp = DateTimeUtils.getUnixTimestampFromDate(
          new Date(yearInLoop, 0, 1)
        );
        const yearEndTimestamp = isCurrentYear
          ? DateTimeUtils.getCurrentUnixTimestamp()
          : DateTimeUtils.getUnixTimestampFromDate(new Date(yearInLoop, 11, 31, 23, 59, 59));

        // Filter transactions for this year
        const yearTransactions = allTransactions.filter((trx) => {
          const timestamp = Number(trx.date_timestamp);
          return timestamp >= yearStartTimestamp && timestamp <= yearEndTimestamp;
        });

        // Calculate simple ROI for this year
        const yearlyROI = InvestAssetService.calculateYearlyROI(
          beginningValue,
          endingValue,
          yearTransactions
        );
        if (enableLogging) Logger.addLog('Transactions in year:');
        if (enableLogging) Logger.addStringifiedLog(yearTransactions);
        if (enableLogging) Logger.addLog('roi result: ');
        if (enableLogging) Logger.addStringifiedLog(yearlyROI);
        roiByYear[yearInLoop] = {
          roi_percentage: yearlyROI.roiPercentage * 100,
          roi_value: yearlyROI.roiValue,
          beginning_value: beginningValue,
          ending_value: endingValue,
          total_net_flows: yearlyROI.totalNetFlows,
          total_inflow: yearlyROI.totalMoneyOut,
          total_outflow: yearlyROI.totalMoneyIn,
          value_total_amount: endingValue,
        };

        yearInLoop++;
      }

      return roiByYear;
    }, dbClient);
  }

  /**
   * Calculate yearly ROI considering beginning value, ending value, and transactions
   * ROI Value = Ending Value + Income - Beginning Value - Net Flows
   * ROI Percentage = ROI Value / (Beginning Value + Money Out)
   */
  private static calculateYearlyROI(
    beginningValue: number,
    endingValue: number,
    transactions: TransactionFlowData[]
  ): {
    roiPercentage: number;
    roiValue: number;
    totalNetFlows: number;
    totalMoneyOut: number;
    totalMoneyIn: number;
  } {
    const { totalNetFlows, totalMoneyOut, totalMoneyIn, totalIncome } = ROICalculator.calculateROI(
      0,
      transactions
    );

    // ROI Value = Ending + Income - Beginning - Net Flows
    // Income is added because it's a return that was received externally (not in endingValue)
    const roiValue = endingValue + totalIncome - beginningValue - totalNetFlows;

    // Cost basis for ROI percentage = Beginning Value + New Money Invested
    const costBasis = beginningValue + totalMoneyOut;

    // ROI Percentage = ROI Value / Cost Basis
    const roiPercentage = costBasis > 0 ? roiValue / costBasis : 0;

    return { roiPercentage, roiValue, totalNetFlows, totalMoneyOut, totalMoneyIn };
  }

  /**
   * Get comprehensive investment statistics for a user
   *
   * @param userId User ID
   * @param dbClient Database client
   * @returns Calculated asset statistics
   */
  static async getAssetStatsForUser(
    userId: bigint,
    dbClient = undefined
  ): Promise<CalculatedAssetStats> {
    return performDatabaseRequest(async (prismaTx) => {
      // Fetch all base data upfront
      const userAssets: Array<InvestAssetWithCalculatedAmounts> =
        await InvestAssetService.getAllAssetsForUser(userId, prismaTx);
      const monthlySnapshots: Array<MonthlySnapshot> =
        await InvestAssetService.getAllAssetSnapshotsForUser(userId, prismaTx);

      // Calculate totals and distribution
      const { totalCurrentValue, totalCurrentlyInvestedValue, currentValueDistribution } =
        InvestAssetService.calculatePortfolioTotals(userAssets);

      // Determine first year of data
      const yearOfFirstSnapshot =
        monthlySnapshots.length > 0
          ? monthlySnapshots[0].year
          : DateTimeUtils.getYearFromTimestamp();

      // Calculate ROI by year (for historical chart data)
      const combinedRoiByYear = await InvestAssetService.getCombinedROIByYear(
        userId,
        yearOfFirstSnapshot,
        prismaTx
      );

      // Extract current year metrics
      const currentYear = DateTimeUtils.getYearFromTimestamp();
      const currentYearROI = combinedRoiByYear[currentYear];

      // Calculate global ROI from yearly data
      const globalROI = InvestAssetService.calculateGlobalROI(combinedRoiByYear);

      // Sort assets by absolute ROI value (descending) for top performers
      // Note: userAssets already have ROI calculated by getAllAssetsForUser
      const topPerformingAssets = [...userAssets].sort(
        (a, b) => (b.absolute_roi_value ?? 0) - (a.absolute_roi_value ?? 0)
      );

      return {
        // Global metrics
        global_roi_value: globalROI.value,
        global_roi_percentage: globalROI.percentage,
        total_current_value: totalCurrentValue,
        total_currently_invested_value: totalCurrentlyInvestedValue,

        // Current year metrics
        current_year_roi_value: currentYearROI?.roi_value ?? 0,
        current_year_roi_percentage: currentYearROI?.roi_percentage ?? 0,

        // Historical data
        monthly_snapshots: monthlySnapshots,
        current_value_distribution: currentValueDistribution,
        combined_roi_by_year: combinedRoiByYear,
        top_performing_assets: topPerformingAssets,
      };
    }, dbClient);
  }

  /**
   * Calculate portfolio totals and distribution from user assets
   */
  private static calculatePortfolioTotals(userAssets: Array<InvestAssetWithCalculatedAmounts>): {
    totalCurrentValue: number;
    totalCurrentlyInvestedValue: number;
    currentValueDistribution: Array<AssetTypeDistribution>;
  } {
    const valuesByType = new Map<string, number>();
    let totalCurrentValue = 0;
    let totalCurrentlyInvestedValue = 0;

    for (const asset of userAssets) {
      totalCurrentValue += asset.current_value ?? 0;
      totalCurrentlyInvestedValue += asset.currently_invested_value ?? 0;

      // Aggregate by asset type
      const currentTypeValue = valuesByType.get(asset.type) ?? 0;
      valuesByType.set(asset.type, currentTypeValue + (asset.current_value ?? 0));
    }

    // Build distribution array
    const currentValueDistribution: Array<AssetTypeDistribution> = [];
    for (const [type, value] of valuesByType) {
      currentValueDistribution.push({
        type,
        value,
        percentage: totalCurrentValue !== 0 ? (value / totalCurrentValue) * 100 : 0,
      });
    }

    return { totalCurrentValue, totalCurrentlyInvestedValue, currentValueDistribution };
  }

  /**
   * Calculate global (all-time) ROI from yearly ROI data
   *
   * Simple ROI = Total Gain / Total Money Invested (initial investment)
   */
  private static calculateGlobalROI(roiByYear: Record<number, YearlyROI>): {
    value: number;
    percentage: number | string;
  } {
    const years = Object.keys(roiByYear)
      .map(Number)
      .sort((a, b) => a - b);

    if (years.length === 0) {
      return { value: 0, percentage: 0 };
    }

    let totalNetFlows = 0;
    let totalMoneyOut = 0;
    let firstYearBeginningValue = 0;

    for (let i = 0; i < years.length; i++) {
      const yearData = roiByYear[years[i]];
      totalNetFlows += yearData.total_net_flows;
      totalMoneyOut += yearData.total_inflow; // total_inflow stores totalMoneyOut

      if (i === 0) {
        firstYearBeginningValue = yearData.beginning_value;
      }
    }

    const lastYear = years[years.length - 1];
    const endingValue = roiByYear[lastYear].ending_value;

    // Global ROI value = ending value - beginning value - net flows
    const globalRoiValue = endingValue - firstYearBeginningValue - totalNetFlows;

    // Cost basis = beginning value + total money invested (not net flows)
    const costBasis = firstYearBeginningValue + totalMoneyOut;
    const globalRoiPercentage = costBasis > 0 ? (globalRoiValue / costBasis) * 100 : 0;

    return {
      value: globalRoiValue,
      percentage: costBasis <= 0 ? '-' : globalRoiPercentage,
    };
  }

  /**
   * Calculate simple ROI for a single asset
   * ROI = Net Return / Total Money Invested (initial investment)
   *
   * @param assetTransactions All transactions for this asset
   * @param currentValue Current value of the asset
   * @returns ROI value and percentage
   */
  private static calculateSingleAssetROI(
    assetTransactions: TransactionFlowData[],
    currentValue: number
  ): { value: number; percentage: number | string } {
    if (assetTransactions.length === 0) {
      return { value: 0, percentage: 0 };
    }

    // Calculate ROI using the centralized calculator
    const { roiValue, totalMoneyOut } = ROICalculator.calculateROI(currentValue, assetTransactions);

    return {
      value: roiValue,
      percentage: totalMoneyOut > 0 ? (roiValue / totalMoneyOut) * 100 : '-',
    };
  }

  static async getAllAssetsSummaryForUser(userId: bigint, dbClient = prisma) {
    return performDatabaseRequest(async (prismaTx) => {
      return prismaTx.invest_assets.findMany({
        where: {
          users_user_id: userId,
        },
        select: {
          asset_id: true,
          name: true,
          ticker: true,
          type: true,
        },
      });
    }, dbClient);
  }

  static async deleteAsset(userId: bigint, assetId: bigint, dbClient = undefined) {
    return performDatabaseRequest(async (prismaTx) => {
      if (!(await InvestAssetService.doesAssetBelongToUser(userId, assetId, prismaTx))) {
        throw APIError.notAuthorized();
      }

      // delete transactions
      await prismaTx.invest_transactions.deleteMany({
        where: {
          invest_assets_asset_id: assetId,
        },
      });

      // delete snapshot references
      await prismaTx.invest_asset_evo_snapshot.deleteMany({
        where: {
          invest_assets_asset_id: assetId,
        },
      });

      // delete asset
      await prismaTx.invest_assets.delete({
        where: { asset_id: assetId },
      });
    }, dbClient);
  }

  static async addCustomBalanceSnapshot(
    assetId: bigint,
    month: number,
    year: number,
    units: number,
    investedAmount: number,
    currentAmount: number,
    withdrawnAmount: number,
    incomeAmount: number,
    costAmount: number,
    feesTaxes: number,
    dbClient = prisma
  ) {
    const currentTimestamp = DateTimeUtils.getCurrentUnixTimestamp();
    return dbClient.$queryRaw`INSERT INTO invest_asset_evo_snapshot (month, year, units, invested_amount, current_value, invest_assets_asset_id, created_at, updated_at, withdrawn_amount, income_amount, cost_amount, fees_taxes)
                                    VALUES (${month}, ${year}, ${units}, ${investedAmount}, ${currentAmount}, ${assetId}, ${currentTimestamp}, ${currentTimestamp}, ${withdrawnAmount}, ${incomeAmount}, ${costAmount}, ${feesTaxes})
                                    ON DUPLICATE KEY UPDATE units = ${units}, invested_amount = ${investedAmount}, updated_at = ${currentTimestamp}, withdrawn_amount = ${withdrawnAmount}, income_amount = ${incomeAmount}, cost_amount = ${costAmount}, fees_taxes = ${feesTaxes};`;
  }

  static async getAllTransactionsForAssetBetweenDates(
    assetId: bigint,
    fromDate: bigint | number,
    toDate: bigint | number,
    dbClient = prisma
  ): Promise<Array<Prisma.Invest_transactionsMaxAggregateOutputType>> {
    return performDatabaseRequest(async (prismaTx) => {
      return prismaTx.$queryRaw`SELECT * FROM invest_transactions 
              WHERE date_timestamp BETWEEN ${fromDate} AND ${toDate}
              AND invest_assets_asset_id = ${assetId}
              ORDER BY date_timestamp ASC`;
    }, dbClient);
  }

  static async recalculateSnapshotForAssetsIncrementally(
    assetId: bigint,
    originalFromDate: number | bigint,
    originalToDate: number | bigint,
    dbClient = undefined
  ) {
    return performDatabaseRequest(async (prismaTx) => {
      /* Logger.addLog(`account: ${accountId} | fromDate: ${fromDate} | toDate: ${toDate}`); */
      /*
       * Given that I'm unable to know the invested/current amounts of an asset at any specific time (only at the end of each month),
       * I will need to recalculate from the beginning of the month relative to $fromDate all the way to the end of
       * month associated with $toDate.
       */

      let beginMonth = DateTimeUtils.getMonthNumberFromTimestamp(originalFromDate);
      let beginYear = DateTimeUtils.getYearFromTimestamp(originalFromDate);
      Logger.addLog(`Begin month: ${beginMonth} | original from date: ${originalFromDate}`);
      // Get snapshot from 2 months prior of begin date
      let priorMonthsSnapshot = await InvestAssetService.getLatestSnapshotForAsset(
        assetId,
        beginMonth > 2 ? beginMonth - 2 : 12 - 2 + beginMonth,
        beginMonth > 2 ? beginYear : beginYear - 1,
        prismaTx
      );

      if (!priorMonthsSnapshot) {
        priorMonthsSnapshot = {
          units: Decimal(0),
          current_value: 0,
          invested_amount: 0,
          year: -1,
          month: -1,
          invest_assets_asset_id: assetId,
          withdrawn_amount: 0,
          income_amount: 0,
          cost_amount: 0,
          fees_taxes: 0,
          updated_at: -1,
          created_at: -1,
        };
      }

      await InvestAssetService.addCustomBalanceSnapshot(
        assetId,
        beginMonth,
        beginYear,
        Number(priorMonthsSnapshot.units),
        Number(priorMonthsSnapshot.invested_amount),
        Number(priorMonthsSnapshot.current_value),
        Number(priorMonthsSnapshot.withdrawn_amount),
        Number(priorMonthsSnapshot.income_amount ?? 0),
        Number(priorMonthsSnapshot.cost_amount ?? 0),
        Number(priorMonthsSnapshot.fees_taxes ?? 0),
        prismaTx
      );

      // Reset snapshots for next 2 months (in case there are no transactions in these months and the balance doesn't get recalculated
      let addCustomBalanceSnapshotsPromises = [];
      addCustomBalanceSnapshotsPromises.push(
        InvestAssetService.addCustomBalanceSnapshot(
          assetId,
          DateTimeUtils.incrementMonthByX(beginMonth, beginYear, 1).month,
          DateTimeUtils.incrementMonthByX(beginMonth, beginYear, 1).year,
          Number(priorMonthsSnapshot.units),
          Number(priorMonthsSnapshot.invested_amount),
          Number(priorMonthsSnapshot.current_value),
          Number(priorMonthsSnapshot.withdrawn_amount),
          Number(priorMonthsSnapshot.income_amount ?? 0),
          Number(priorMonthsSnapshot.cost_amount ?? 0),
          Number(priorMonthsSnapshot.fees_taxes ?? 0),
          prismaTx
        )
      );

      addCustomBalanceSnapshotsPromises.push(
        InvestAssetService.addCustomBalanceSnapshot(
          assetId,
          DateTimeUtils.incrementMonthByX(beginMonth, beginYear, 2).month,
          DateTimeUtils.incrementMonthByX(beginMonth, beginYear, 2).year,
          Number(priorMonthsSnapshot.units),
          Number(priorMonthsSnapshot.invested_amount),
          Number(priorMonthsSnapshot.current_value),
          Number(priorMonthsSnapshot.withdrawn_amount),
          Number(priorMonthsSnapshot.income_amount ?? 0),
          Number(priorMonthsSnapshot.cost_amount ?? 0),
          Number(priorMonthsSnapshot.fees_taxes ?? 0),
          prismaTx
        )
      );

      await Promise.all(addCustomBalanceSnapshotsPromises);

      if (beginMonth > 1) beginMonth--;
      else {
        beginMonth = 12;
        beginYear--;
      }

      let endMonth = DateTimeUtils.getMonthNumberFromTimestamp(originalToDate);
      let endYear = DateTimeUtils.getYearFromTimestamp(originalToDate);

      if (endMonth < 12) endMonth++;
      else {
        endMonth = 1;
        endYear++;
      }

      const fromDate = DateTimeUtils.getUnixTimestampFromDate(
        new Date(beginYear, beginMonth - 1, 1)
      );
      const toDate = DateTimeUtils.getUnixTimestampFromDate(new Date(endYear, endMonth - 1, 1));

      const trxList = await InvestAssetService.getAllTransactionsForAssetBetweenDates(
        assetId,
        fromDate,
        toDate,
        prismaTx
      );
      /*Logger.addLog(`----- dates between ${fromDate} & ${toDate}`);
      Logger.addStringifiedLog(trxList);
      Logger.addLog('-----');*/
      let initialSnapshot = priorMonthsSnapshot;
      if (!initialSnapshot) {
        initialSnapshot = {
          units: Decimal(0),
          current_value: 0,
          invested_amount: 0,
          year: -1,
          month: -1,
          invest_assets_asset_id: assetId,
          withdrawn_amount: 0,
          income_amount: 0,
          cost_amount: 0,
          updated_at: -1,
          created_at: -1,
        };
      }

      for (const trx of trxList) {
        const trxDate = Number(trx.date_timestamp);
        const month = DateTimeUtils.getMonthNumberFromTimestamp(trxDate);
        const year = DateTimeUtils.getYearFromTimestamp(trxDate);

        const trxType = trx.type;
        const changeInAmounts = trx.total_price;
        const changeInUnits = trx.units;
        if (trx.fees_taxes_amount > 0 && trx.fees_taxes_units <= Decimal(0)) {
          initialSnapshot.fees_taxes =
            BigInt(initialSnapshot.fees_taxes) + BigInt(trx.fees_taxes_amount);
        } else if (trx.fees_taxes_units > Decimal(0)) {
          initialSnapshot.units = Decimal(initialSnapshot.units).minus(trx.fees_taxes_units);
        }
        switch (trxType) {
          case MYFIN.INVEST.TRX_TYPE.BUY:
            // BUY: +units, +invested_amount, +fees_taxes
            initialSnapshot.invested_amount =
              BigInt(initialSnapshot.invested_amount) + BigInt(changeInAmounts);
            initialSnapshot.units = Decimal(initialSnapshot.units).add(changeInUnits);
            break;

          case MYFIN.INVEST.TRX_TYPE.SELL:
            // SELL: -units, +withdrawn_amount, +fees_taxes
            initialSnapshot.withdrawn_amount =
              BigInt(initialSnapshot.withdrawn_amount) + BigInt(changeInAmounts);
            initialSnapshot.units = Decimal(initialSnapshot.units).minus(changeInUnits);
            break;

          case MYFIN.INVEST.TRX_TYPE.INCOME:
            // INCOME: +units (if > 0), +income_amount (if total_price > 0)
            if (changeInUnits > Decimal(0)) {
              initialSnapshot.units = Decimal(initialSnapshot.units).add(changeInUnits);
            }
            if (BigInt(changeInAmounts) > 0) {
              initialSnapshot.income_amount =
                BigInt(initialSnapshot.income_amount ?? 0) + BigInt(changeInAmounts);
            }
            break;

          case MYFIN.INVEST.TRX_TYPE.COST:
            // COST: -units (if > 0), +cost_amount (if total_price > 0)
            if (changeInUnits > Decimal(0)) {
              initialSnapshot.units = Decimal(initialSnapshot.units).minus(changeInUnits);
            } else if (BigInt(changeInAmounts) > 0) {
              initialSnapshot.cost_amount =
                BigInt(initialSnapshot.cost_amount ?? 0) + BigInt(changeInAmounts);
            }
            break;
        }

        /* Automatically add snapshots for current & next 6 months in order to create a buffer*/
        addCustomBalanceSnapshotsPromises = [];

        addCustomBalanceSnapshotsPromises.push(
          InvestAssetService.addCustomBalanceSnapshot(
            assetId,
            month,
            year,
            Number(initialSnapshot.units),
            Number(initialSnapshot.invested_amount),
            Number(initialSnapshot.current_value),
            Number(initialSnapshot.withdrawn_amount),
            Number(initialSnapshot.income_amount ?? 0),
            Number(initialSnapshot.cost_amount ?? 0),
            Number(initialSnapshot.fees_taxes ?? 0),
            prismaTx
          )
        );

        for (let i = 1; i <= 6; i++) {
          addCustomBalanceSnapshotsPromises.push(
            InvestAssetService.addCustomBalanceSnapshot(
              assetId,
              DateTimeUtils.incrementMonthByX(month, year, i).month,
              DateTimeUtils.incrementMonthByX(month, year, i).year,
              Number(initialSnapshot.units),
              Number(initialSnapshot.invested_amount),
              Number(initialSnapshot.current_value),
              Number(initialSnapshot.withdrawn_amount),
              Number(initialSnapshot.income_amount ?? 0),
              Number(initialSnapshot.cost_amount ?? 0),
              Number(initialSnapshot.fees_taxes ?? 0),
              prismaTx
            )
          );
        }

        await Promise.all(addCustomBalanceSnapshotsPromises);
      }

      return initialSnapshot;
    }, dbClient);
  }

  static async deleteAllAssetEvoSnapshotsForUser(userId: bigint, dbClient = prisma) {
    return dbClient.$queryRaw`DELETE invest_asset_evo_snapshot FROM invest_asset_evo_snapshot 
      LEFT JOIN invest_assets ON invest_assets.asset_id = invest_asset_evo_snapshot.invest_assets_asset_id 
      WHERE users_user_id = ${userId} `;
  }
}

export default InvestAssetService;
