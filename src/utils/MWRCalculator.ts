/**
 * Money-Weighted Return (MWR) Calculator
 *
 * Implements the Modified Dietz Method for calculating time-weighted investment returns.
 * This method approximates the Internal Rate of Return (IRR) without requiring iterative calculations.
 *
 * The Modified Dietz formula:
 * MWR = (Ending Value - Beginning Value - Net Cash Flows) / (Beginning Value + Weighted Cash Flows)
 *
 * Where:
 * - Net Cash Flows = Total contributions - Total withdrawals
 * - Weighted Cash Flows = Σ(Cash Flow × Time Weight)
 * - Time Weight = (Period Remaining After Flow) / Total Period
 */
import Logger from './Logger.js';

interface MonthlyFlowData {
  month: number;
  invested_amount: bigint | number;
  withdrawn_amount: bigint | number;
  income_amount: bigint | number;
  cost_amount: bigint | number;
  fees_taxes: bigint | number;
}

/**
 * Individual transaction flow data with actual timestamp
 * Used for precise MWR calculations instead of monthly aggregates
 */
interface TransactionFlowData {
  date_timestamp: bigint | number;
  /** Transaction type: 'B' = Buy, 'S' = Sell, 'I' = Income, 'C' = Cost */
  trx_type: string;
  /** Total price in cents */
  total_price: bigint | number;
  /** Fees/taxes amount in cents */
  fees_taxes_amount: bigint | number;
  /** Fees/taxes in units - if > 0, fees are internal (already reflected in asset units) */
  fees_taxes_units?: bigint | number;
}

interface MWRResult {
  mwr: number;
  totalNetFlows: number;
  totalMoneyIn: number;
  totalMoneyOut: number;
  weightedFlows: number;
}

interface NetFlowResult {
  netFlow: number;
  moneyOut: number;
  moneyIn: number;
}

export class MWRCalculator {
  /**
   * Annualize a partial-year MWR to get annual equivalent
   *
   * @param partialMWR MWR for partial period
   * @param monthsInPeriod Number of months in the period
   * @returns Annualized MWR
   */
  static annualizeMWR(partialMWR: number, monthsInPeriod: number): number {
    if (monthsInPeriod === 12) return partialMWR;
    if (monthsInPeriod === 0) return 0;

    // Compound the return to annual basis: (1 + r)^(12/months) - 1
    return (1 + partialMWR) ** (12 / monthsInPeriod) - 1;
  }

  /**
   * Calculate Money-Weighted Return using Modified Dietz method with actual transaction dates
   *
   * This provides more accurate results than the monthly-aggregate version by using
   * the exact day each transaction occurred instead of assuming mid-month timing.
   *
   * @param beginningValue Portfolio value at start of period
   * @param endingValue Portfolio value at end of period
   * @param transactions Array of individual transactions with timestamps
   * @param periodStartTimestamp Unix timestamp for start of period
   * @param periodEndTimestamp Unix timestamp for end of period
   * @returns MWR as a decimal (e.g., 0.125 = 12.5%)
   */
  static calculateModifiedDietzWithTransactions(
    beginningValue: number,
    endingValue: number,
    transactions: TransactionFlowData[],
    periodStartTimestamp: number,
    periodEndTimestamp: number
  ): MWRResult {
    let totalNetFlows = 0;
    let totalMoneyIn = 0;
    let totalMoneyOut = 0;
    let weightedFlows = 0;

    const totalPeriodDays = MWRCalculator.daysBetweenTimestamps(
      periodStartTimestamp,
      periodEndTimestamp
    );

    for (const trx of transactions) {
      // Calculate net cash flow for this transaction
      const netFlowResult = MWRCalculator.calculateTransactionNetFlow(trx);

      // Calculate time weight based on actual transaction date
      const weight = MWRCalculator.calculateWeightFromTimestamp(
        Number(trx.date_timestamp),
        periodStartTimestamp,
        periodEndTimestamp,
        totalPeriodDays
      );

      totalNetFlows += netFlowResult.netFlow;
      totalMoneyIn += netFlowResult.moneyIn;
      totalMoneyOut += netFlowResult.moneyOut;
      weightedFlows += netFlowResult.netFlow * weight;
    }

    // Calculate MWR using Modified Dietz formula
    const denominator = beginningValue + weightedFlows;
    const numerator = endingValue - beginningValue - totalNetFlows;

    // Handle edge cases
    if (denominator === 0) {
      if (totalNetFlows === 0)
        return { mwr: 0, totalNetFlows, totalMoneyIn, totalMoneyOut, weightedFlows };

      if (totalNetFlows !== 0) {
        const simpleMWR = numerator / Math.abs(totalNetFlows);
        return { mwr: simpleMWR, totalNetFlows, totalMoneyIn, totalMoneyOut, weightedFlows };
      }
    }

    // Handle negative denominator: occurs when no money was invested but money was received
    // (e.g., only sells/income transactions with no buys, such as gifted/granted assets)
    // In this case, traditional MWR doesn't apply - we calculate return based on money received
    if (denominator < 0) {
      // If we received money (moneyIn > 0) without investing, that's infinite/undefined return
      // We return 0 MWR to avoid distorting portfolio calculations
      // The absolute ROI value will still be correct via totalNetFlows
      return { mwr: 0, totalNetFlows, totalMoneyIn, totalMoneyOut, weightedFlows };
    }

    /*Logger.addLog(`(Trx-based) totalNetFlows: ${totalNetFlows}`);
    Logger.addLog(`(Trx-based) beginningValue: ${beginningValue}`);
    Logger.addLog(`(Trx-based) endingValue: ${endingValue}`);
    Logger.addLog(`(Trx-based) weightedFlows: ${weightedFlows}`);*/

    const mwr = numerator / denominator;
    return { mwr, totalNetFlows, totalMoneyIn, totalMoneyOut, weightedFlows };
  }

  /**
   * Calculate net cash flow from a single transaction
   *
   * Net flow = Money OUT - Money IN
   * - Buy (B): total_price is Money OUT (positive flow)
   * - Sell (S): total_price is Money IN (negative flow)
   * - Income (I): total_price is Money IN (negative flow)
   * - Cost (C): total_price is Money OUT (positive flow)
   * - fees_taxes_amount: Money OUT only if fees_taxes_units <= 0 (external fees)
   *   When fees_taxes_units > 0, fees are internal and already reflected in asset units
   *
   * @param trx Transaction data
   * @returns Net cash flow in currency units (converted from cents)
   */
  private static calculateTransactionNetFlow(trx: TransactionFlowData): NetFlowResult {
    const totalPrice = Number(trx.total_price);
    const feesAmount = Number(trx.fees_taxes_amount) || 0;
    const feesUnits = Number(trx.fees_taxes_units) || 0;

    // Only count fees as money OUT if they are external (fees_taxes_units <= 0)
    const externalFees = feesUnits > 0 ? 0 : feesAmount;

    let baseFlow: number;
    let moneyOut = 0;
    let moneyIn = 0;

    switch (trx.trx_type) {
      case 'B': // Buy - total_price is money out
        baseFlow = totalPrice;
        moneyOut = totalPrice;
        break;
      case 'S': // Sell - total_price is money in
        baseFlow = -totalPrice;
        moneyIn = totalPrice;
        break;
      case 'I': // Income - total_price is money in
        baseFlow = -totalPrice;
        moneyIn = totalPrice;
        break;
      case 'C': // Cost - total_price is money out
        baseFlow = totalPrice;
        moneyOut = totalPrice;
        break;
      default:
        baseFlow = 0;
    }

    // External fees are always money out
    const netFlow = baseFlow + externalFees;

    // Convert from cents to currency units
    return {
      netFlow: netFlow / 100,
      moneyOut: (moneyOut + externalFees) / 100,
      moneyIn: moneyIn / 100,
    };
  }

  /**
   * Calculate time weight for a transaction based on its actual timestamp
   *
   * Weight = (Days remaining in period after transaction) / (Total days in period)
   *
   * @param transactionTimestamp Unix timestamp of the transaction
   * @param _periodStartTimestamp Unix timestamp for start of period (unused, kept for API consistency)
   * @param periodEndTimestamp Unix timestamp for end of period
   * @param totalPeriodDays Total days in the period (pre-calculated for efficiency)
   * @returns Weight as a decimal (0 to 1)
   */
  private static calculateWeightFromTimestamp(
    transactionTimestamp: number,
    _periodStartTimestamp: number,
    periodEndTimestamp: number,
    totalPeriodDays: number
  ): number {
    if (totalPeriodDays === 0) return 0;

    // Calculate days remaining after transaction
    const daysRemaining = MWRCalculator.daysBetweenTimestamps(
      transactionTimestamp,
      periodEndTimestamp
    );

    return daysRemaining / totalPeriodDays;
  }

  /**
   * Calculate the number of days between two Unix timestamps
   *
   * @param startTimestamp Start timestamp (seconds)
   * @param endTimestamp End timestamp (seconds)
   * @returns Number of days (can be fractional)
   */
  private static daysBetweenTimestamps(startTimestamp: number, endTimestamp: number): number {
    const secondsPerDay = 86400;
    return (endTimestamp - startTimestamp) / secondsPerDay;
  }
}

export default MWRCalculator;
export type { TransactionFlowData, MonthlyFlowData, MWRResult };
