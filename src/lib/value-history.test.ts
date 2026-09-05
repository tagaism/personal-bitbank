import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import type { BitbankTrade } from "./bitbank/types";
import {
  applyFit,
  eachUtcDay,
  fitAsset,
  markToMarket,
  pairsForTrades,
  priceAt,
  reconstructDailyQuantities,
  scaleQuantitiesToActual,
  scaleToActual,
  utcDay,
} from "./value-history";

function trade(
  partial: Pick<BitbankTrade, "pair" | "side" | "amount" | "price" | "executed_at"> &
    Partial<BitbankTrade>,
): BitbankTrade {
  return {
    trade_id: partial.trade_id ?? partial.executed_at,
    order_id: 1,
    type: "limit",
    maker_taker: "taker",
    fee_amount_base: "0",
    fee_amount_quote: "0",
    ...partial,
  };
}

describe("utcDay", () => {
  it("floors to UTC midnight", () => {
    expect(utcDay(Date.parse("2021-02-25T15:00:00Z"))).toBe(
      Date.parse("2021-02-25T00:00:00Z"),
    );
  });
});

describe("eachUtcDay", () => {
  it("includes both endpoints", () => {
    const days = eachUtcDay(
      Date.parse("2021-02-25T12:00:00Z"),
      Date.parse("2021-02-27T03:00:00Z"),
    );
    expect(days).toEqual([
      Date.parse("2021-02-25T00:00:00Z"),
      Date.parse("2021-02-26T00:00:00Z"),
      Date.parse("2021-02-27T00:00:00Z"),
    ]);
  });
});

describe("priceAt", () => {
  const closes = new Map([
    ["btc_jpy", [{ ts: Date.parse("2021-02-25T00:00:00Z"), close: "100" }]],
    ["xyz_btc", [{ ts: Date.parse("2021-02-25T00:00:00Z"), close: "0.5" }]],
  ]);

  it("uses JPY pair close and BTC conversion", () => {
    const day = Date.parse("2021-02-25T00:00:00Z");
    expect(priceAt("btc", day, closes)?.toFixed()).toBe("100");
    expect(priceAt("xyz", day, closes)?.toFixed()).toBe("50");
    expect(priceAt("jpy", day, closes)?.toFixed()).toBe("1");
  });
});

describe("reconstructDailyQuantities", () => {
  it("applies fills by UTC day", () => {
    const day1 = Date.parse("2021-02-25T00:00:00Z");
    const day2 = Date.parse("2021-02-26T00:00:00Z");
    const snaps = reconstructDailyQuantities(
      [
        trade({
          pair: "btc_jpy",
          side: "buy",
          amount: "1",
          price: "10000000",
          executed_at: day1 + 1000,
        }),
      ],
      day1,
      day2,
    );
    expect(snaps).toHaveLength(2);
    expect(snaps[0]?.qty.get("btc")?.toFixed()).toBe("1");
    expect(snaps[1]?.qty.get("btc")?.toFixed()).toBe("1");
  });
});

describe("fitAsset / applyFit", () => {
  it("multiplies crypto when reconstruction is positive", () => {
    const fit = fitAsset(new Decimal("2"), new Decimal("1"), false);
    expect(fit.mode).toBe("mul");
    expect(applyFit(new Decimal("2"), fit).toFixed()).toBe("1");
  });

  it("offsets JPY cash", () => {
    const fit = fitAsset(new Decimal("-100"), new Decimal("40"), true);
    expect(fit.mode).toBe("offset");
    expect(applyFit(new Decimal("-100"), fit).toFixed()).toBe("40");
  });
});

describe("scaleQuantitiesToActual", () => {
  it("pins last crypto qty to the exchange balance", () => {
    const day1 = Date.parse("2021-02-25T00:00:00Z");
    const scaled = scaleQuantitiesToActual(
      [
        { t: day1, qty: new Map([["btc", new Decimal("2")]]) },
        { t: day1 + 86400000, qty: new Map([["btc", new Decimal("2")]]) },
      ],
      new Map([["btc", new Decimal("0.5")]]),
    );
    expect(scaled[1]?.qty.get("btc")?.toFixed()).toBe("0.5");
    expect(scaled[0]?.qty.get("btc")?.toFixed()).toBe("0.5");
  });
});

describe("scaleToActual", () => {
  it("scales the series so the last point matches actual", () => {
    const { values, scale } = scaleToActual(
      [new Decimal(10), new Decimal(20)],
      new Decimal(40),
    );
    expect(scale.toFixed()).toBe("2");
    expect(values[0]?.toFixed()).toBe("20");
    expect(values[1]?.toFixed()).toBe("40");
  });

  it("offsets when reconstructed end is not positive", () => {
    const { values, offset } = scaleToActual(
      [new Decimal(-5), new Decimal(-10)],
      new Decimal(40),
    );
    expect(offset.toFixed()).toBe("50");
    expect(values[1]?.toFixed()).toBe("40");
  });
});

describe("pairsForTrades", () => {
  it("includes jpy and btc quote variants", () => {
    const pairs = pairsForTrades([
      trade({
        pair: "eth_btc",
        side: "buy",
        amount: "1",
        price: "0.05",
        executed_at: 1,
      }),
    ]);
    expect(pairs).toContain("btc_jpy");
    expect(pairs).toContain("eth_jpy");
    expect(pairs).toContain("eth_btc");
  });
});

describe("markToMarket", () => {
  it("adds JPY cash to crypto value", () => {
    const qty = new Map([
      ["jpy", new Decimal("1000")],
      ["btc", new Decimal("1")],
    ]);
    const day = Date.parse("2021-02-25T00:00:00Z");
    const total = markToMarket(
      qty,
      day,
      new Map([["btc_jpy", [{ ts: day, close: "50" }]]]),
    );
    expect(total.toFixed()).toBe("1050");
  });
});
