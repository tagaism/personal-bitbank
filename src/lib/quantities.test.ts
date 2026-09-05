import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import type { BitbankTrade } from "./bitbank/types";
import { applySpotFill, emptyQuantities } from "./quantities";

function trade(
  partial: Pick<BitbankTrade, "pair" | "side" | "amount" | "price"> &
    Partial<BitbankTrade>,
): BitbankTrade {
  return {
    trade_id: 1,
    order_id: 1,
    type: "limit",
    maker_taker: "taker",
    fee_amount_base: "0",
    fee_amount_quote: "0",
    executed_at: 1,
    ...partial,
  };
}

describe("applySpotFill", () => {
  it("buys spend quote and receive base", () => {
    const qty = emptyQuantities();
    applySpotFill(
      qty,
      trade({
        pair: "btc_jpy",
        side: "buy",
        amount: "1",
        price: "10000000",
        fee_amount_quote: "1000",
      }),
    );
    expect(qty.get("btc")?.toFixed()).toBe("1");
    expect(qty.get("jpy")?.toFixed()).toBe("-10001000");
  });

  it("sells spend base and receive quote", () => {
    const qty = emptyQuantities();
    applySpotFill(
      qty,
      trade({ pair: "btc_jpy", side: "buy", amount: "2", price: "10000000" }),
    );
    applySpotFill(
      qty,
      trade({ pair: "btc_jpy", side: "sell", amount: "1", price: "15000000" }),
    );
    expect(qty.get("btc")?.toFixed()).toBe("1");
    expect(qty.get("jpy")?.eq(new Decimal("-5000000"))).toBe(true);
  });

  it("skips margin fills", () => {
    const qty = emptyQuantities();
    applySpotFill(
      qty,
      trade({
        pair: "btc_jpy",
        side: "buy",
        amount: "1",
        price: "1",
        position_side: "long",
      }),
    );
    expect(qty.size).toBe(0);
  });
});
