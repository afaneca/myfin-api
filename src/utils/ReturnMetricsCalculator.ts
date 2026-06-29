import ROICalculator, { type TransactionFlowData } from './ROICalculator.js';

export type ReturnMetricStatus = 'ok' | 'insufficient_data' | 'no_solution';

export type PeriodReturnMetrics = {
  absolute_return_value: number;
  cash_flows: {
    contributions: number;
    withdrawals: number;
    net: number;
    external_income: number;
    fees_and_costs: number;
  };
  simple_roi: {
    percentage: number | null;
    denominator: number | null;
    status: ReturnMetricStatus;
  };
  portfolio_return: {
    cumulative_percentage: number | null;
    annualized_percentage: number | null;
    method: 'linked_monthly_modified_dietz';
    status: ReturnMetricStatus;
  };
  personal_return: {
    annualized_percentage: number | null;
    method: 'xirr';
    status: ReturnMetricStatus;
  };
};

export type ReturnMetricsTransaction = TransactionFlowData & {
  transaction_id?: bigint | number;
};

export type PortfolioMonthValue = {
  current_value: bigint | number;
  month: number;
  year: number;
};

const DAYS_PER_YEAR = 365.25;
const SECONDS_PER_DAY = 86400;
const EPSILON = 0.000001;

const toNumber = (value: bigint | number | string | null | undefined) => Number(value ?? 0);

const roundMoney = (value: number) => Number(value.toFixed(2));

const getTimestamp = (date: Date) => date.getTime() / 1000;

const getDateParts = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  return {
    month: date.getMonth() + 1,
    year: date.getFullYear(),
  };
};

const getMonthStartTimestamp = (year: number, month: number) =>
  getTimestamp(new Date(year, month - 1, 1, 0, 0, 0));

const getMonthEndTimestamp = (year: number, month: number) =>
  getTimestamp(new Date(year, month, 1, 0, 0, 0)) - 1;

const getPreviousMonth = (year: number, month: number) => {
  if (month > 1) return { month: month - 1, year };
  return { month: 12, year: year - 1 };
};

const incrementMonth = (year: number, month: number) => {
  if (month < 12) return { month: month + 1, year };
  return { month: 1, year: year + 1 };
};

export const getPortfolioMonthKey = (year: number, month: number) => `${year}-${month}`;

export const buildPortfolioValueByMonth = (snapshots: PortfolioMonthValue[]) => {
  const valuesByMonth = new Map<string, number>();

  for (const snapshot of snapshots) {
    const key = getPortfolioMonthKey(snapshot.year, snapshot.month);
    const currentValue = toNumber(snapshot.current_value);
    valuesByMonth.set(key, (valuesByMonth.get(key) ?? 0) + currentValue);
  }

  return valuesByMonth;
};

export const createEmptyReturnMetrics = (): PeriodReturnMetrics => ({
  absolute_return_value: 0,
  cash_flows: {
    contributions: 0,
    withdrawals: 0,
    net: 0,
    external_income: 0,
    fees_and_costs: 0,
  },
  simple_roi: {
    percentage: null,
    denominator: null,
    status: 'insufficient_data',
  },
  portfolio_return: {
    cumulative_percentage: null,
    annualized_percentage: null,
    method: 'linked_monthly_modified_dietz',
    status: 'insufficient_data',
  },
  personal_return: {
    annualized_percentage: null,
    method: 'xirr',
    status: 'insufficient_data',
  },
});

const getExternalFees = (transaction: ReturnMetricsTransaction) => {
  const feesAmount = toNumber(transaction.fees_taxes_amount) / 100;
  const feesUnits = toNumber(transaction.fees_taxes_units);
  return feesUnits > 0 ? 0 : feesAmount;
};

const getTransactionCashFlowBreakdown = (transaction: ReturnMetricsTransaction) => {
  const totalPrice = toNumber(transaction.total_price) / 100;
  const units = toNumber(transaction.units);
  const externalFees = getExternalFees(transaction);

  let contributions = 0;
  let withdrawals = 0;
  let externalIncome = 0;
  let feesAndCosts = 0;

  switch (transaction.trx_type) {
    case 'B':
      if (!(totalPrice === 0 && units > 0)) {
        contributions = totalPrice;
      }
      feesAndCosts = externalFees;
      break;
    case 'S':
      withdrawals = totalPrice;
      feesAndCosts = externalFees;
      break;
    case 'I':
      if (units > 0) {
        feesAndCosts = externalFees;
      } else if (totalPrice > 0) {
        externalIncome = totalPrice - externalFees;
        feesAndCosts = externalFees;
      }
      break;
    case 'C':
      feesAndCosts = totalPrice + externalFees;
      break;
  }

  return {
    contributions,
    withdrawals,
    externalIncome,
    feesAndCosts,
  };
};

const getTransactionXirrCashFlows = (transaction: ReturnMetricsTransaction) => {
  const dateTimestamp = toNumber(transaction.date_timestamp);
  const totalPrice = toNumber(transaction.total_price) / 100;
  const units = toNumber(transaction.units);
  const externalFees = getExternalFees(transaction);
  const flows: Array<{ amount: number; date_timestamp: number }> = [];

  const addFlow = (amount: number) => {
    if (Math.abs(amount) > EPSILON) {
      flows.push({ amount, date_timestamp: dateTimestamp });
    }
  };

  switch (transaction.trx_type) {
    case 'B':
      if (!(totalPrice === 0 && units > 0)) {
        addFlow(-totalPrice);
      }
      addFlow(-externalFees);
      break;
    case 'S':
      addFlow(totalPrice);
      addFlow(-externalFees);
      break;
    case 'I':
      if (units > 0) {
        addFlow(-externalFees);
      } else if (totalPrice > 0) {
        addFlow(totalPrice);
        addFlow(-externalFees);
      }
      break;
    case 'C':
      addFlow(-totalPrice);
      addFlow(-externalFees);
      break;
  }

  return flows;
};

const getCashFlows = (transactions: ReturnMetricsTransaction[]) => {
  const roiTotals = ROICalculator.calculateROI(0, transactions);
  let contributions = 0;
  let withdrawals = 0;
  let externalIncome = 0;
  let feesAndCosts = 0;

  for (const transaction of transactions) {
    const breakdown = getTransactionCashFlowBreakdown(transaction);
    contributions += breakdown.contributions;
    withdrawals += breakdown.withdrawals;
    externalIncome += breakdown.externalIncome;
    feesAndCosts += breakdown.feesAndCosts;
  }

  return {
    contributions: roundMoney(contributions),
    withdrawals: roundMoney(withdrawals),
    net: roundMoney(roiTotals.totalNetFlows),
    external_income: roundMoney(roiTotals.totalIncome || externalIncome),
    fees_and_costs: roundMoney(feesAndCosts),
  };
};

const calculateModifiedDietzReturn = (
  beginningValue: number,
  endingValue: number,
  transactions: ReturnMetricsTransaction[],
  periodStartTimestamp: number,
  periodEndTimestamp: number
) => {
  const duration = Math.max(periodEndTimestamp - periodStartTimestamp, 1);
  let weightedNetFlows = 0;
  let totalNetFlows = 0;
  let totalIncome = 0;

  for (const transaction of transactions) {
    const transactionTimestamp = toNumber(transaction.date_timestamp);
    const transactionRoi = ROICalculator.calculateROI(0, [transaction]);
    const weight = Math.max(0, Math.min(1, (periodEndTimestamp - transactionTimestamp) / duration));

    weightedNetFlows += transactionRoi.totalNetFlows * weight;
    totalNetFlows += transactionRoi.totalNetFlows;
    totalIncome += transactionRoi.totalIncome;
  }

  const numerator = endingValue + totalIncome - beginningValue - totalNetFlows;
  const denominator = beginningValue + weightedNetFlows;

  if (Math.abs(denominator) <= EPSILON) {
    return {
      percentage: null,
      status: Math.abs(numerator) <= EPSILON ? 'insufficient_data' : 'no_solution',
    } as const;
  }

  return {
    percentage: numerator / denominator,
    status: 'ok',
  } as const;
};

const calculateLinkedMonthlyModifiedDietz = (
  beginningValue: number,
  endingValue: number,
  transactions: ReturnMetricsTransaction[],
  periodStartTimestamp: number,
  periodEndTimestamp: number,
  portfolioValueByMonth: Map<string, number>
) => {
  const periodHasData =
    beginningValue > EPSILON ||
    endingValue > EPSILON ||
    transactions.length > 0 ||
    portfolioValueByMonth.size > 0;

  if (!periodHasData || periodEndTimestamp <= periodStartTimestamp) {
    return { percentage: null, status: 'insufficient_data' as ReturnMetricStatus };
  }

  const firstMonth = getDateParts(periodStartTimestamp);
  const lastMonth = getDateParts(periodEndTimestamp);
  let cursor = { ...firstMonth };
  let cumulativeFactor = 1;
  let hasReturnPeriod = false;

  while (
    cursor.year < lastMonth.year ||
    (cursor.year === lastMonth.year && cursor.month <= lastMonth.month)
  ) {
    const previousMonth = getPreviousMonth(cursor.year, cursor.month);
    const monthStartTimestamp = Math.max(
      getMonthStartTimestamp(cursor.year, cursor.month),
      periodStartTimestamp
    );
    const monthEndTimestamp = Math.min(
      getMonthEndTimestamp(cursor.year, cursor.month),
      periodEndTimestamp
    );
    const monthBeginningValue =
      cursor.year === firstMonth.year && cursor.month === firstMonth.month
        ? beginningValue
        : (portfolioValueByMonth.get(
            getPortfolioMonthKey(previousMonth.year, previousMonth.month)
          ) ?? 0);
    const monthEndingValue =
      cursor.year === lastMonth.year && cursor.month === lastMonth.month
        ? endingValue
        : (portfolioValueByMonth.get(getPortfolioMonthKey(cursor.year, cursor.month)) ?? 0);
    const monthTransactions = transactions.filter((transaction) => {
      const transactionTimestamp = toNumber(transaction.date_timestamp);
      return (
        transactionTimestamp >= monthStartTimestamp && transactionTimestamp <= monthEndTimestamp
      );
    });
    const monthHasData =
      monthBeginningValue > EPSILON || monthEndingValue > EPSILON || monthTransactions.length > 0;

    if (monthHasData) {
      if (monthBeginningValue <= EPSILON) {
        cursor = incrementMonth(cursor.year, cursor.month);
        continue;
      }

      const monthReturn = calculateModifiedDietzReturn(
        monthBeginningValue,
        monthEndingValue,
        monthTransactions,
        monthStartTimestamp,
        monthEndTimestamp
      );

      if (monthReturn.status === 'no_solution') {
        return { percentage: null, status: 'no_solution' as ReturnMetricStatus };
      }

      if (monthReturn.status === 'ok' && monthReturn.percentage !== null) {
        cumulativeFactor *= 1 + monthReturn.percentage;
        hasReturnPeriod = true;
      }
    }

    cursor = incrementMonth(cursor.year, cursor.month);
  }

  if (!hasReturnPeriod) {
    return { percentage: null, status: 'insufficient_data' as ReturnMetricStatus };
  }

  return {
    percentage: (cumulativeFactor - 1) * 100,
    status: 'ok' as ReturnMetricStatus,
  };
};

const calculateAnnualizedPercentage = (
  cumulativePercentage: number | null,
  periodStartTimestamp: number,
  periodEndTimestamp: number
) => {
  if (cumulativePercentage === null) return null;

  const days = (periodEndTimestamp - periodStartTimestamp) / SECONDS_PER_DAY;
  if (days <= 0 || cumulativePercentage <= -100) return null;

  return ((1 + cumulativePercentage / 100) ** (DAYS_PER_YEAR / days) - 1) * 100;
};

const calculateXirr = (cashFlows: Array<{ amount: number; date_timestamp: number }>) => {
  const filteredFlows = cashFlows.filter((flow) => Math.abs(flow.amount) > EPSILON);
  const hasPositive = filteredFlows.some((flow) => flow.amount > 0);
  const hasNegative = filteredFlows.some((flow) => flow.amount < 0);

  if (!hasPositive || !hasNegative || filteredFlows.length < 2) {
    return { percentage: null, status: 'insufficient_data' as ReturnMetricStatus };
  }

  const firstTimestamp = Math.min(...filteredFlows.map((flow) => flow.date_timestamp));
  const hasTimeSpan = filteredFlows.some((flow) => flow.date_timestamp !== firstTimestamp);
  if (!hasTimeSpan) {
    return { percentage: null, status: 'no_solution' as ReturnMetricStatus };
  }

  const getNpv = (rate: number) =>
    filteredFlows.reduce((total, flow) => {
      const years = (flow.date_timestamp - firstTimestamp) / (SECONDS_PER_DAY * DAYS_PER_YEAR);
      return total + flow.amount / (1 + rate) ** years;
    }, 0);

  let low = -0.999999;
  let high = 1;
  let lowValue = getNpv(low);
  let highValue = getNpv(high);

  while (lowValue * highValue > 0 && high < 1000000) {
    high *= 2;
    highValue = getNpv(high);
  }

  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) {
    return { percentage: null, status: 'no_solution' as ReturnMetricStatus };
  }

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const midValue = getNpv(mid);

    if (!Number.isFinite(midValue)) {
      return { percentage: null, status: 'no_solution' as ReturnMetricStatus };
    }

    if (Math.abs(midValue) <= EPSILON) {
      return { percentage: mid * 100, status: 'ok' as ReturnMetricStatus };
    }

    if (lowValue * midValue <= 0) {
      high = mid;
      highValue = midValue;
    } else {
      low = mid;
      lowValue = midValue;
    }
  }

  return { percentage: ((low + high) / 2) * 100, status: 'ok' as ReturnMetricStatus };
};

const calculatePersonalReturn = (
  beginningValue: number,
  endingValue: number,
  transactions: ReturnMetricsTransaction[],
  periodStartTimestamp: number,
  periodEndTimestamp: number
) => {
  const cashFlows: Array<{ amount: number; date_timestamp: number }> = [];

  if (beginningValue > EPSILON) {
    cashFlows.push({ amount: -beginningValue, date_timestamp: periodStartTimestamp });
  }

  for (const transaction of transactions) {
    cashFlows.push(...getTransactionXirrCashFlows(transaction));
  }

  if (endingValue > EPSILON) {
    cashFlows.push({ amount: endingValue, date_timestamp: periodEndTimestamp });
  }

  return calculateXirr(cashFlows);
};

export const calculatePeriodReturnMetrics = ({
  beginningValue,
  endingValue,
  transactions,
  periodStartTimestamp,
  periodEndTimestamp,
  portfolioValueByMonth,
}: {
  beginningValue: number;
  endingValue: number;
  transactions: ReturnMetricsTransaction[];
  periodStartTimestamp: number;
  periodEndTimestamp: number;
  portfolioValueByMonth: Map<string, number>;
}): PeriodReturnMetrics => {
  const roiTotals = ROICalculator.calculateROI(0, transactions);
  const absoluteReturnValue =
    endingValue + roiTotals.totalIncome - beginningValue - roiTotals.totalNetFlows;
  const simpleDenominator = beginningValue + roiTotals.totalMoneyOut;
  const simplePercentage =
    simpleDenominator > EPSILON ? (absoluteReturnValue / simpleDenominator) * 100 : null;
  const portfolioReturn = calculateLinkedMonthlyModifiedDietz(
    beginningValue,
    endingValue,
    transactions,
    periodStartTimestamp,
    periodEndTimestamp,
    portfolioValueByMonth
  );
  const personalReturn = calculatePersonalReturn(
    beginningValue,
    endingValue,
    transactions,
    periodStartTimestamp,
    periodEndTimestamp
  );

  return {
    absolute_return_value: roundMoney(absoluteReturnValue),
    cash_flows: getCashFlows(transactions),
    simple_roi: {
      percentage: simplePercentage,
      denominator: simpleDenominator > EPSILON ? roundMoney(simpleDenominator) : null,
      status: simpleDenominator > EPSILON ? 'ok' : 'insufficient_data',
    },
    portfolio_return: {
      cumulative_percentage: portfolioReturn.percentage,
      annualized_percentage: calculateAnnualizedPercentage(
        portfolioReturn.percentage,
        periodStartTimestamp,
        periodEndTimestamp
      ),
      method: 'linked_monthly_modified_dietz',
      status: portfolioReturn.status,
    },
    personal_return: {
      annualized_percentage: personalReturn.percentage,
      method: 'xirr',
      status: personalReturn.status,
    },
  };
};
