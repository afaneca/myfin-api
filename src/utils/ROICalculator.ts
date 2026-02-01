/**
 * Simple ROI (Return on Investment) Calculator
 *
 * Calculates ROI using the straightforward formula:
 * ROI = Net Return / Cost of Investment
 *
 * Where:
 * - Net Return = Current Value - Total Money Out + Total Money In
 * - Cost of Investment = Total Money Out (all money invested/spent)
 *
 * This is simpler and more intuitive than time-weighted methods like Modified Dietz.
 */

/**
 * Individual transaction flow data with actual timestamp
 * Used for calculating total money in/out
 */
interface TransactionFlowData {
  date_timestamp: bigint | number;
  /** Transaction type: 'B' = Buy, 'S' = Sell, 'I' = Income, 'C' = Cost */
  trx_type: string;
  /** Total price in cents - for Income, if > 0 means external (cash received) */
  total_price: bigint | number;
  /** Units - for Income, if > 0 means internal (reinvested as units) */
  units?: bigint | number;
  /** Fees/taxes amount in cents */
  fees_taxes_amount: bigint | number;
  /** Fees/taxes in units - if > 0, fees are internal (deducted as units) */
  fees_taxes_units?: bigint | number;
}

interface ROIResult {
  /** ROI as a decimal (e.g., 0.10 = 10%) */
  roiPercentage: number;
  /** Absolute profit/loss in currency units */
  roiValue: number;
  /** Total net capital flow (money out - money in from sells) */
  totalNetFlows: number;
  /** Total money invested/spent (capital out) */
  totalMoneyOut: number;
  /** Total money received from sells (capital in) */
  totalMoneyIn: number;
  /** Total income received (performance, not capital) */
  totalIncome: number;
}

export class ROICalculator {
  /**
   * Calculate simple ROI from transactions and current value
   *
   * ROI Value = Current Value + Total Income - Net Capital Flows
   * ROI Percentage = ROI Value / Total Capital Out
   *
   * @param currentValue Current portfolio/asset value
   * @param transactions Array of individual transactions
   * @returns ROI result with percentage and absolute value
   */
  static calculateROI(currentValue: number, transactions: TransactionFlowData[]): ROIResult {
    let totalMoneyOut = 0;
    let totalMoneyIn = 0;
    let totalIncome = 0;

    for (const trx of transactions) {
      const { moneyOut, moneyIn, income } = ROICalculator.calculateTransactionFlow(trx);
      totalMoneyOut += moneyOut;
      totalMoneyIn += moneyIn;
      totalIncome += income;
    }

    // Net capital flows = capital out - capital in (excludes income)
    const totalNetFlows = totalMoneyOut - totalMoneyIn;

    // ROI Value = Current Value + Income Received - Net Capital Invested
    // This captures: what you have now + what you took out - what you put in
    const roiValue = currentValue + totalIncome - totalNetFlows;

    // ROI Percentage = ROI Value / Total Capital Out (initial investment)
    const roiPercentage = totalMoneyOut > 0 ? roiValue / totalMoneyOut : 0;

    return {
      roiPercentage,
      roiValue,
      totalNetFlows,
      totalMoneyOut,
      totalMoneyIn,
      totalIncome,
    };
  }

  /**
   * Calculate money flow from a single transaction
   *
   * Capital flows:
   * - Buy (B): total_price is Money OUT (capital invested)
   * - Sell (S): total_price is Money IN (capital recovered)
   * - Cost (C): total_price is Money OUT (expense)
   *
   * Income (I) - performance return:
   * - External (total_price > 0): Cash received, tracked as income
   * - Internal (units > 0): Reinvested, already in currentValue, don't count
   *
   * Fees/Taxes:
   * - External (fees_taxes_units = 0): Paid separately, counts as money out
   * - Internal (fees_taxes_units > 0): Deducted as units, already reflected in asset
   *
   * @param trx Transaction data
   * @returns Money out, money in, and income amounts in currency units
   */
  private static calculateTransactionFlow(trx: TransactionFlowData): {
    moneyOut: number;
    moneyIn: number;
    income: number;
  } {
    const totalPrice = Number(trx.total_price) || 0;
    const units = Number(trx.units) || 0;
    const feesAmount = Number(trx.fees_taxes_amount) || 0;
    const feesUnits = Number(trx.fees_taxes_units) || 0;

    // External fees = fees paid separately (not deducted as units)
    const externalFees = feesUnits > 0 ? 0 : feesAmount;

    let moneyOut = 0;
    let moneyIn = 0;
    let income = 0;

    switch (trx.trx_type) {
      case 'B': // Buy - capital invested
        // Special case: Buy with total_price=0 and units>0 is actually internal income
        // (legacy data from before Income transaction type existed)
        if (totalPrice === 0 && units > 0) {
          // Treat as internal income: only count external fees as money out
          moneyOut = externalFees;
        } else {
          moneyOut = totalPrice + externalFees;
        }
        break;
      case 'S': // Sell - capital recovered
        moneyIn = totalPrice;
        moneyOut = externalFees; // Fees on sell are still money out
        break;
      case 'I': // Income - performance return
        // Income can be either:
        // 1. External (total_price > 0, units = 0): Cash received to bank account
        // 2. Internal (units > 0, total_price = 0): Reinvested as additional units
        //
        // Note: Having both total_price > 0 AND units > 0 is invalid and prevented
        // by the transaction service, but we handle it defensively here by
        // prioritizing units (internal) to avoid double-counting.
        if (units > 0) {
          // Internal income: reinvested as units, already reflected in currentValue
          // Only count external fees as money out (if any were paid separately)
          moneyOut = externalFees;
        } else if (totalPrice > 0) {
          // External income: cash received, net of external fees
          income = totalPrice - externalFees;
        }
        break;
      case 'C': // Cost - expense
        moneyOut = totalPrice + externalFees;
        break;
    }

    // Convert from cents to currency units
    return {
      moneyOut: moneyOut / 100,
      moneyIn: moneyIn / 100,
      income: income / 100,
    };
  }
}

export default ROICalculator;
export type { TransactionFlowData, ROIResult };
