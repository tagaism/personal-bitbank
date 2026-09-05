import Decimal from "decimal.js";
import type { BitbankTrade } from "./bitbank/types";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

const DUST = new Decimal("1e-16");

export type LotSnapshot = {
  quantity: string;
  costJpy: string;
  averageCostJpy: string | null;
};

export type CostBasisResult = {
  lots: Record<string, LotSnapshot>;
  incompleteHistory: boolean;
  skippedMargin: number;
};

function isDust(value: Decimal): boolean {
  return value.abs().lte(DUST);
}

export function splitPair(pair: string): { base: string; quote: string } {
  const index = pair.lastIndexOf("_");
  if (index <= 0 || index === pair.length - 1) {
    throw new Error(`Invalid pair: ${pair}`);
  }
  return {
    base: pair.slice(0, index).toLowerCase(),
    quote: pair.slice(index + 1).toLowerCase(),
  };
}

function emptyLot() {
  return { quantity: new Decimal(0), costJpy: new Decimal(0) };
}

/**
 * Weighted average cost of remaining spot holdings, measured in JPY.
 *
 * Buys raise quantity and JPY cost (quote fees included; base fees reduce qty).
 * Sells reduce quantity at the current average (average unchanged).
 * Cross-pair trades transfer JPY cost from the spent asset to the received one.
 * Margin trades are skipped.
 */
export function computeCostBasis(trades: BitbankTrade[]): CostBasisResult {
  const lots = new Map<string, { quantity: Decimal; costJpy: Decimal }>();
  let incompleteHistory = false;
  let skippedMargin = 0;

  const sorted = [...trades].sort((a, b) => {
    if (a.executed_at !== b.executed_at) return a.executed_at - b.executed_at;
    return a.trade_id - b.trade_id;
  });

  const get = (asset: string) => {
    let lot = lots.get(asset);
    if (!lot) {
      lot = emptyLot();
      lots.set(asset, lot);
    }
    return lot;
  };

  const jpyCostOf = (asset: string, qty: Decimal): Decimal => {
    if (asset === "jpy") return qty;
    const lot = get(asset);
    if (isDust(lot.quantity)) {
      if (!isDust(qty)) incompleteHistory = true;
      return new Decimal(0);
    }
    return qty.mul(lot.costJpy).div(lot.quantity);
  };

  const reduce = (asset: string, qty: Decimal) => {
    if (asset === "jpy" || isDust(qty) || qty.lte(0)) return;
    const lot = get(asset);
    if (isDust(lot.quantity)) {
      incompleteHistory = true;
      return;
    }
    let disposed = qty;
    if (disposed.gt(lot.quantity) && !isDust(disposed.minus(lot.quantity))) {
      incompleteHistory = true;
      disposed = lot.quantity;
    }
    const costRemoved = disposed.mul(lot.costJpy).div(lot.quantity);
    lot.quantity = lot.quantity.minus(disposed);
    lot.costJpy = lot.costJpy.minus(costRemoved);
    if (lot.quantity.lte(0) || isDust(lot.quantity)) {
      lot.quantity = new Decimal(0);
      lot.costJpy = new Decimal(0);
    }
  };

  const increase = (asset: string, qty: Decimal, costJpy: Decimal) => {
    if (asset === "jpy") return;
    if (qty.lte(0) || isDust(qty)) return;
    const lot = get(asset);
    lot.quantity = lot.quantity.plus(qty);
    lot.costJpy = lot.costJpy.plus(costJpy);
  };

  for (const trade of sorted) {
    if (trade.position_side === "long" || trade.position_side === "short") {
      skippedMargin += 1;
      continue;
    }

    const { base, quote } = splitPair(trade.pair);
    const amount = new Decimal(trade.amount);
    const price = new Decimal(trade.price);
    const feeBase = new Decimal(trade.fee_amount_base || "0");
    const feeQuote = new Decimal(trade.fee_amount_quote || "0");
    const quoteGross = amount.mul(price);
    const side = trade.side.toLowerCase();

    if (side === "buy") {
      const quoteSpent = quoteGross.plus(feeQuote);
      const baseReceived = amount.minus(feeBase);
      const cost = jpyCostOf(quote, quoteSpent);
      reduce(quote, quoteSpent);
      increase(base, baseReceived, cost);
    } else if (side === "sell") {
      const baseSold = amount.plus(feeBase);
      const quoteReceived = Decimal.max(quoteGross.minus(feeQuote), new Decimal(0));
      const transferredCost = jpyCostOf(base, amount);
      reduce(base, baseSold);
      increase(quote, quoteReceived, transferredCost);
    }
  }

  const snapshots: Record<string, LotSnapshot> = {};
  for (const [asset, lot] of lots) {
    snapshots[asset] = {
      quantity: lot.quantity.toFixed(),
      costJpy: lot.costJpy.toFixed(),
      averageCostJpy: isDust(lot.quantity)
        ? null
        : lot.costJpy.div(lot.quantity).toFixed(),
    };
  }

  return { lots: snapshots, incompleteHistory, skippedMargin };
}

export function quantitiesDiffer(
  onhand: string,
  fromTrades: string | undefined,
  precision: number,
): boolean {
  const held = new Decimal(onhand || "0");
  const computed = new Decimal(fromTrades || "0");
  const step = new Decimal(10).pow(-Math.max(precision, 8));
  return held.minus(computed).abs().gt(step);
}
