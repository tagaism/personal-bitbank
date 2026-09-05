import { describe, expect, it } from "vitest";
import type { BitbankTrade } from "./bitbank/types";
import {
  computeCostBasis,
  splitPair,
  type CostBasisResult,
  type LotSnapshot,
} from "./cost-basis";

let nextId = 1;

function trade(
  partial: Omit<Partial<BitbankTrade>, "pair" | "side" | "amount" | "price"> & {
    pair: string;
    side: "buy" | "sell";
    amount: string;
    price: string;
    executed_at?: number;
  },
): BitbankTrade {
  nextId += 1;
  return {
    trade_id: partial.trade_id ?? nextId,
    pair: partial.pair,
    order_id: partial.order_id ?? nextId,
    side: partial.side,
    position_side: partial.position_side,
    type: partial.type ?? "limit",
    amount: partial.amount,
    price: partial.price,
    maker_taker: partial.maker_taker ?? "taker",
    fee_amount_base: partial.fee_amount_base ?? "0",
    fee_amount_quote: partial.fee_amount_quote ?? "0",
    executed_at: partial.executed_at ?? nextId,
  };
}

function lotOf(result: CostBasisResult, asset: string): LotSnapshot {
  const lot = result.lots[asset];
  if (!lot) throw new Error(`expected lot for ${asset}`);
  return lot;
}

describe("splitPair", () => {
  it("splits base and quote", () => {
    expect(splitPair("btc_jpy")).toEqual({ base: "btc", quote: "jpy" });
    expect(splitPair("eth_btc")).toEqual({ base: "eth", quote: "btc" });
  });
});

describe("computeCostBasis", () => {
  it("uses a single buy as the average", () => {
    const result = computeCostBasis([
      trade({ pair: "btc_jpy", side: "buy", amount: "1", price: "10000000" }),
    ]);
    expect(lotOf(result, "btc").quantity).toBe("1");
    expect(lotOf(result, "btc").averageCostJpy).toBe("10000000");
    expect(result.incompleteHistory).toBe(false);
  });

  it("weights two buys", () => {
    const result = computeCostBasis([
      trade({ pair: "btc_jpy", side: "buy", amount: "1", price: "10000000" }),
      trade({ pair: "btc_jpy", side: "buy", amount: "1", price: "12000000" }),
    ]);
    expect(lotOf(result, "btc").quantity).toBe("2");
    expect(lotOf(result, "btc").averageCostJpy).toBe("11000000");
  });

  it("keeps average after a partial sell", () => {
    const result = computeCostBasis([
      trade({ pair: "btc_jpy", side: "buy", amount: "2", price: "10000000" }),
      trade({ pair: "btc_jpy", side: "sell", amount: "1", price: "15000000" }),
    ]);
    expect(lotOf(result, "btc").quantity).toBe("1");
    expect(lotOf(result, "btc").averageCostJpy).toBe("10000000");
    expect(lotOf(result, "btc").costJpy).toBe("10000000");
  });

  it("adds quote fees on buys into cost", () => {
    const result = computeCostBasis([
      trade({
        pair: "btc_jpy",
        side: "buy",
        amount: "1",
        price: "10000000",
        fee_amount_quote: "1000",
      }),
    ]);
    expect(lotOf(result, "btc").quantity).toBe("1");
    expect(lotOf(result, "btc").averageCostJpy).toBe("10001000");
  });

  it("subtracts base fees from quantity received", () => {
    const result = computeCostBasis([
      trade({
        pair: "btc_jpy",
        side: "buy",
        amount: "1",
        price: "10000000",
        fee_amount_base: "0.001",
      }),
    ]);
    expect(lotOf(result, "btc").quantity).toBe("0.999");
    expect(Number(lotOf(result, "btc").averageCostJpy)).toBeCloseTo(
      10000000 / 0.999,
      6,
    );
  });

  it("transfers JPY cost across a BTC-quoted buy", () => {
    const result = computeCostBasis([
      trade({ pair: "btc_jpy", side: "buy", amount: "1", price: "10000000" }),
      trade({ pair: "eth_btc", side: "buy", amount: "10", price: "0.05" }),
    ]);
    expect(lotOf(result, "btc").quantity).toBe("0.5");
    expect(lotOf(result, "btc").averageCostJpy).toBe("10000000");
    expect(lotOf(result, "eth").quantity).toBe("10");
    expect(lotOf(result, "eth").averageCostJpy).toBe("500000");
  });

  it("skips margin trades", () => {
    const result = computeCostBasis([
      trade({ pair: "btc_jpy", side: "buy", amount: "1", price: "10000000" }),
      trade({
        pair: "btc_jpy",
        side: "buy",
        amount: "1",
        price: "1",
        position_side: "long",
      }),
    ]);
    expect(result.skippedMargin).toBe(1);
    expect(lotOf(result, "btc").quantity).toBe("1");
    expect(lotOf(result, "btc").averageCostJpy).toBe("10000000");
  });

  it("flags history gaps when selling more than remaining", () => {
    const result = computeCostBasis([
      trade({ pair: "btc_jpy", side: "buy", amount: "1", price: "10000000" }),
      trade({ pair: "btc_jpy", side: "sell", amount: "2", price: "12000000" }),
    ]);
    expect(lotOf(result, "btc").quantity).toBe("0");
    expect(lotOf(result, "btc").averageCostJpy).toBeNull();
    expect(result.incompleteHistory).toBe(true);
  });

  it("processes trades in chronological order regardless of input order", () => {
    const result = computeCostBasis([
      trade({
        pair: "btc_jpy",
        side: "sell",
        amount: "1",
        price: "12000000",
        executed_at: 200,
        trade_id: 2,
      }),
      trade({
        pair: "btc_jpy",
        side: "buy",
        amount: "2",
        price: "10000000",
        executed_at: 100,
        trade_id: 1,
      }),
    ]);
    expect(lotOf(result, "btc").quantity).toBe("1");
    expect(lotOf(result, "btc").averageCostJpy).toBe("10000000");
  });
});
