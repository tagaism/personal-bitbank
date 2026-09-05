import Decimal from "decimal.js";
import type { BitbankTrade } from "./bitbank/types";
import { splitPair } from "./cost-basis";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export function emptyQuantities(): Map<string, Decimal> {
  return new Map();
}

function add(qty: Map<string, Decimal>, asset: string, delta: Decimal) {
  const current = qty.get(asset) ?? new Decimal(0);
  qty.set(asset, current.plus(delta));
}

/** Apply a spot fill to asset quantities, including JPY cash. */
export function applySpotFill(qty: Map<string, Decimal>, trade: BitbankTrade) {
  if (trade.position_side === "long" || trade.position_side === "short") return;

  const { base, quote } = splitPair(trade.pair);
  const amount = new Decimal(trade.amount);
  const price = new Decimal(trade.price);
  const feeBase = new Decimal(trade.fee_amount_base || "0");
  const feeQuote = new Decimal(trade.fee_amount_quote || "0");
  const quoteGross = amount.mul(price);
  const side = trade.side.toLowerCase();

  if (side === "buy") {
    add(qty, quote, quoteGross.plus(feeQuote).neg());
    add(qty, base, amount.minus(feeBase));
    return;
  }
  if (side === "sell") {
    add(qty, base, amount.plus(feeBase).neg());
    add(qty, quote, Decimal.max(quoteGross.minus(feeQuote), new Decimal(0)));
  }
}
