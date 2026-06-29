import { performDatabaseRequest, prisma } from '../config/prisma.js';
import { MYFIN } from '../consts.js';
import DateTimeUtils from '../utils/DateTimeUtils.js';
import {
  type PeriodReturnMetrics,
  createEmptyReturnMetrics,
} from '../utils/ReturnMetricsCalculator.js';
import InvestAssetService from './investAssetService.js';

const INTERNAL_UNIT_FEES_WARNING = 'INTERNAL_UNIT_FEES';
const UNMATCHED_SELL_UNITS_WARNING = 'UNMATCHED_SELL_UNITS';
const UNIT_EPSILON = 0.000001;

export type AnnualReportWarning = {
  amount?: number;
  asset_id?: number;
  code: string;
  message: string;
  transaction_id?: number;
  units?: number;
};

export type AnnualReportTransaction = {
  asset_broker?: string | null;
  asset_id: bigint | number;
  asset_name: string;
  asset_ticker?: string | null;
  asset_type: string;
  date_timestamp: bigint | number;
  fees_taxes_amount?: bigint | number | null;
  fees_taxes_units?: bigint | number | null;
  note?: string | null;
  total_price: bigint | number;
  transaction_id: bigint | number;
  trx_type: string;
  units: bigint | number;
};

export type AnnualReportBaseTransaction = {
  date_timestamp: number;
  fees_amount: number;
  fees_units: number;
  note: string;
  total_price: number;
  transaction_id: number;
  units: number;
};

export type AnnualReportFifoMatch = {
  acquisition_cost: number;
  acquisition_fees: number;
  allocated_fees: number;
  buy_transaction: AnnualReportBaseTransaction;
  gain_loss: number;
  matched_units: number;
  proceeds: number;
  sell_fees: number;
};

export type AnnualReportSell = AnnualReportBaseTransaction & {
  fifo_matches: AnnualReportFifoMatch[];
  internal_fee_units: number;
  unmatched_units: number;
};

export type AnnualReportAsset = {
  asset_id: number;
  broker: string;
  buys: AnnualReportBaseTransaction[];
  name: string;
  sells: AnnualReportSell[];
  summary: {
    fees: number;
    internal_fee_units: number;
    realized_gain_loss: number;
    total_invested: number;
    total_withdrawn: number;
  };
  ticker: string;
  type: string;
  warnings: AnnualReportWarning[];
};

export type AnnualInvestmentReport = {
  assets: AnnualReportAsset[];
  generated_at: string;
  summary: {
    annual_roi_percentage: number;
    annual_roi_value: number;
    beginning_value: number;
    ending_value: number;
    fees: number;
    realized_gain_loss: number;
    return_metrics: PeriodReturnMetrics;
    total_invested: number;
    total_withdrawn: number;
  };
  warnings: AnnualReportWarning[];
  year: number;
};

type AnnualReportRoi = {
  beginning_value?: number;
  ending_value?: number;
  roi_percentage?: number;
  roi_value?: number;
  return_metrics?: PeriodReturnMetrics;
};

type FifoLot = {
  remaining_units: number;
  transaction: AnnualReportTransaction;
};

const roundMoney = (value: number) => Number(value.toFixed(2));
const roundUnits = (value: number) => Number(value.toFixed(6));
const toNumber = (value: bigint | number | string | null | undefined) => Number(value ?? 0);

const getYearStartTimestamp = (year: number) =>
  DateTimeUtils.getUnixTimestampFromDate(new Date(year, 0, 1, 0, 0, 0));

const getYearEndTimestamp = (year: number) =>
  DateTimeUtils.getUnixTimestampFromDate(new Date(year, 11, 31, 23, 59, 59));

const isInYear = (transaction: AnnualReportTransaction, year: number) => {
  const timestamp = toNumber(transaction.date_timestamp);
  return timestamp >= getYearStartTimestamp(year) && timestamp <= getYearEndTimestamp(year);
};

const getTransactionId = (transaction: AnnualReportTransaction) =>
  toNumber(transaction.transaction_id);

const getAssetId = (transaction: AnnualReportTransaction) => toNumber(transaction.asset_id);

const getTotalPrice = (transaction: AnnualReportTransaction) => toNumber(transaction.total_price);

const getUnits = (transaction: AnnualReportTransaction) => toNumber(transaction.units);

const getFeesAmount = (transaction: AnnualReportTransaction) =>
  toNumber(transaction.fees_taxes_amount);

const getFeesUnits = (transaction: AnnualReportTransaction) =>
  toNumber(transaction.fees_taxes_units);

const getExternalFees = (transaction: AnnualReportTransaction) =>
  getFeesUnits(transaction) > UNIT_EPSILON ? 0 : getFeesAmount(transaction);

const toBaseTransaction = (transaction: AnnualReportTransaction): AnnualReportBaseTransaction => ({
  date_timestamp: toNumber(transaction.date_timestamp),
  fees_amount: roundMoney(getFeesAmount(transaction)),
  fees_units: roundUnits(getFeesUnits(transaction)),
  note: transaction.note ?? '',
  total_price: roundMoney(getTotalPrice(transaction)),
  transaction_id: getTransactionId(transaction),
  units: roundUnits(getUnits(transaction)),
});

const compareTransactions = (a: AnnualReportTransaction, b: AnnualReportTransaction) => {
  const assetDiff = getAssetId(a) - getAssetId(b);
  if (assetDiff !== 0) return assetDiff;

  const timestampDiff = toNumber(a.date_timestamp) - toNumber(b.date_timestamp);
  if (timestampDiff !== 0) return timestampDiff;

  return getTransactionId(a) - getTransactionId(b);
};

const createAssetReport = (transaction: AnnualReportTransaction): AnnualReportAsset => ({
  asset_id: getAssetId(transaction),
  broker: transaction.asset_broker ?? '',
  buys: [],
  name: transaction.asset_name,
  sells: [],
  summary: {
    fees: 0,
    internal_fee_units: 0,
    realized_gain_loss: 0,
    total_invested: 0,
    total_withdrawn: 0,
  },
  ticker: transaction.asset_ticker ?? '',
  type: transaction.asset_type,
  warnings: [],
});

const buildWarningKey = (warning: AnnualReportWarning) =>
  `${warning.code}:${warning.asset_id ?? ''}:${warning.transaction_id ?? ''}:${warning.units ?? ''}`;

const addWarning = (
  reportWarnings: AnnualReportWarning[],
  asset: AnnualReportAsset | undefined,
  warning: AnnualReportWarning,
  seenWarningKeys: Set<string>
) => {
  const key = buildWarningKey(warning);
  if (seenWarningKeys.has(key)) return;

  seenWarningKeys.add(key);
  reportWarnings.push(warning);
  asset?.warnings.push(warning);
};

const buildInternalUnitFeesWarning = (
  transaction: AnnualReportTransaction
): AnnualReportWarning => ({
  amount: roundMoney(getFeesAmount(transaction)),
  asset_id: getAssetId(transaction),
  code: INTERNAL_UNIT_FEES_WARNING,
  message:
    'Transaction has internal unit fees. Those units are displayed separately and excluded from FIFO tax math.',
  transaction_id: getTransactionId(transaction),
  units: roundUnits(getFeesUnits(transaction)),
});

const buildUnmatchedSellWarning = (
  transaction: AnnualReportTransaction,
  unmatchedUnits: number
): AnnualReportWarning => ({
  asset_id: getAssetId(transaction),
  code: UNMATCHED_SELL_UNITS_WARNING,
  message:
    'Sell transaction has units that could not be matched to prior buy lots. FIFO data may be incomplete.',
  transaction_id: getTransactionId(transaction),
  units: roundUnits(unmatchedUnits),
});

const finalizeAsset = (asset: AnnualReportAsset): AnnualReportAsset => ({
  ...asset,
  buys: asset.buys.map((buy) => ({ ...buy })),
  sells: asset.sells.map((sell) => ({
    ...sell,
    fifo_matches: sell.fifo_matches.map((match) => ({ ...match })),
    internal_fee_units: roundUnits(sell.internal_fee_units),
    unmatched_units: roundUnits(sell.unmatched_units),
  })),
  summary: {
    fees: roundMoney(asset.summary.fees),
    internal_fee_units: roundUnits(asset.summary.internal_fee_units),
    realized_gain_loss: roundMoney(asset.summary.realized_gain_loss),
    total_invested: roundMoney(asset.summary.total_invested),
    total_withdrawn: roundMoney(asset.summary.total_withdrawn),
  },
});

export const buildAnnualReportFromTransactions = (
  year: number,
  transactions: AnnualReportTransaction[],
  roi: AnnualReportRoi = {},
  generatedAt = new Date().toISOString()
): AnnualInvestmentReport => {
  const sortedTransactions = [...transactions].sort(compareTransactions);
  const assetsById = new Map<string, AnnualReportAsset>();
  const lotsByAssetId = new Map<string, FifoLot[]>();
  const warnings: AnnualReportWarning[] = [];
  const seenWarningKeys = new Set<string>();

  const getAsset = (transaction: AnnualReportTransaction) => {
    const assetId = String(getAssetId(transaction));
    let asset = assetsById.get(assetId);
    if (!asset) {
      asset = createAssetReport(transaction);
      assetsById.set(assetId, asset);
    }
    return asset;
  };

  for (const transaction of sortedTransactions) {
    const assetId = String(getAssetId(transaction));
    const selectedYearTransaction = isInYear(transaction, year);
    const lots = lotsByAssetId.get(assetId) ?? [];
    lotsByAssetId.set(assetId, lots);

    if (transaction.trx_type === MYFIN.INVEST.TRX_TYPE.BUY) {
      const units = getUnits(transaction);
      if (units > UNIT_EPSILON) {
        lots.push({
          remaining_units: units,
          transaction,
        });
      }
    }

    if (!selectedYearTransaction && transaction.trx_type !== MYFIN.INVEST.TRX_TYPE.SELL) {
      continue;
    }

    const asset = getAsset(transaction);

    if (selectedYearTransaction) {
      const feesUnits = getFeesUnits(transaction);
      if (feesUnits > UNIT_EPSILON) {
        asset.summary.internal_fee_units += feesUnits;
        addWarning(warnings, asset, buildInternalUnitFeesWarning(transaction), seenWarningKeys);
      } else {
        asset.summary.fees += getFeesAmount(transaction);
      }

      if (transaction.trx_type === MYFIN.INVEST.TRX_TYPE.COST) {
        asset.summary.fees += getTotalPrice(transaction);
      }
    }

    if (selectedYearTransaction && transaction.trx_type === MYFIN.INVEST.TRX_TYPE.BUY) {
      asset.summary.total_invested += getTotalPrice(transaction);
      asset.buys.push(toBaseTransaction(transaction));
      continue;
    }

    if (transaction.trx_type !== MYFIN.INVEST.TRX_TYPE.SELL) {
      continue;
    }

    const sellUnits = getUnits(transaction);
    let remainingSellUnits = sellUnits;
    const sellReport: AnnualReportSell | undefined = selectedYearTransaction
      ? {
          ...toBaseTransaction(transaction),
          fifo_matches: [],
          internal_fee_units: roundUnits(getFeesUnits(transaction)),
          unmatched_units: 0,
        }
      : undefined;

    if (selectedYearTransaction) {
      asset.summary.total_withdrawn += getTotalPrice(transaction);
      asset.sells.push(sellReport as AnnualReportSell);
    }

    while (remainingSellUnits > UNIT_EPSILON) {
      const lot = lots[0];
      if (!lot) break;

      const matchedUnits = Math.min(remainingSellUnits, lot.remaining_units);
      const buyUnits = getUnits(lot.transaction);

      if (selectedYearTransaction && sellReport && buyUnits > UNIT_EPSILON) {
        const matchRatioToBuy = matchedUnits / buyUnits;
        const matchRatioToSell = sellUnits > UNIT_EPSILON ? matchedUnits / sellUnits : 0;
        const acquisitionCost = getTotalPrice(lot.transaction) * matchRatioToBuy;
        const acquisitionFees = getExternalFees(lot.transaction) * matchRatioToBuy;
        const proceeds = getTotalPrice(transaction) * matchRatioToSell;
        const sellFees = getExternalFees(transaction) * matchRatioToSell;
        const gainLoss = proceeds - sellFees - acquisitionCost - acquisitionFees;

        if (getFeesUnits(lot.transaction) > UNIT_EPSILON) {
          addWarning(
            warnings,
            asset,
            buildInternalUnitFeesWarning(lot.transaction),
            seenWarningKeys
          );
        }

        sellReport.fifo_matches.push({
          acquisition_cost: roundMoney(acquisitionCost),
          acquisition_fees: roundMoney(acquisitionFees),
          allocated_fees: roundMoney(acquisitionFees + sellFees),
          buy_transaction: toBaseTransaction(lot.transaction),
          gain_loss: roundMoney(gainLoss),
          matched_units: roundUnits(matchedUnits),
          proceeds: roundMoney(proceeds),
          sell_fees: roundMoney(sellFees),
        });
        asset.summary.realized_gain_loss += gainLoss;
      }

      lot.remaining_units -= matchedUnits;
      remainingSellUnits -= matchedUnits;

      if (lot.remaining_units <= UNIT_EPSILON) {
        lots.shift();
      }
    }

    if (selectedYearTransaction && remainingSellUnits > UNIT_EPSILON) {
      if (sellReport) {
        sellReport.unmatched_units = remainingSellUnits;
      }
      addWarning(
        warnings,
        asset,
        buildUnmatchedSellWarning(transaction, remainingSellUnits),
        seenWarningKeys
      );
    }
  }

  const assets = [...assetsById.values()]
    .map(finalizeAsset)
    .filter(
      (asset) =>
        asset.buys.length > 0 ||
        asset.sells.length > 0 ||
        asset.summary.fees !== 0 ||
        asset.summary.internal_fee_units !== 0 ||
        asset.warnings.length > 0
    );

  const totalInvested = assets.reduce((total, asset) => total + asset.summary.total_invested, 0);
  const totalWithdrawn = assets.reduce((total, asset) => total + asset.summary.total_withdrawn, 0);
  const realizedGainLoss = assets.reduce(
    (total, asset) => total + asset.summary.realized_gain_loss,
    0
  );
  const fees = assets.reduce((total, asset) => total + asset.summary.fees, 0);

  return {
    assets,
    generated_at: generatedAt,
    summary: {
      annual_roi_percentage: roundMoney(roi.roi_percentage ?? 0),
      annual_roi_value: roundMoney(roi.roi_value ?? 0),
      beginning_value: roundMoney(roi.beginning_value ?? 0),
      ending_value: roundMoney(roi.ending_value ?? 0),
      fees: roundMoney(fees),
      realized_gain_loss: roundMoney(realizedGainLoss),
      return_metrics: roi.return_metrics ?? createEmptyReturnMetrics(),
      total_invested: roundMoney(totalInvested),
      total_withdrawn: roundMoney(totalWithdrawn),
    },
    warnings,
    year,
  };
};

class InvestReportService {
  static async getAnnualReportForUser(userId: bigint, year: number, dbClient = prisma) {
    return performDatabaseRequest(async (prismaTx) => {
      const yearEndTimestamp = getYearEndTimestamp(year);
      const transactions = await prismaTx.$queryRaw<AnnualReportTransaction[]>`
        SELECT
          invest_transactions.transaction_id,
          invest_transactions.date_timestamp,
          invest_transactions.type as trx_type,
          (invest_transactions.total_price / 100) as total_price,
          invest_transactions.units,
          (COALESCE(invest_transactions.fees_taxes_amount, 0) / 100) as fees_taxes_amount,
          COALESCE(invest_transactions.fees_taxes_units, 0) as fees_taxes_units,
          invest_transactions.note,
          invest_assets.asset_id,
          invest_assets.name as asset_name,
          invest_assets.ticker as asset_ticker,
          invest_assets.type as asset_type,
          invest_assets.broker as asset_broker
        FROM invest_transactions
          INNER JOIN invest_assets
            ON invest_assets.asset_id = invest_transactions.invest_assets_asset_id
        WHERE invest_assets.users_user_id = ${userId}
          AND invest_transactions.date_timestamp <= ${yearEndTimestamp}
        ORDER BY
          invest_assets.asset_id ASC,
          invest_transactions.date_timestamp ASC,
          invest_transactions.transaction_id ASC
      `;
      const roiByYear = await InvestAssetService.getCombinedROIByYear(userId, year, prismaTx);
      return buildAnnualReportFromTransactions(year, transactions, roiByYear[year]);
    }, dbClient);
  }
}

export default InvestReportService;
