import { describe, expect, it } from "vitest";
import { mergeTrades } from "./cache";
import type { BitbankTrade } from "./bitbank/types";

function trade(partial: Partial<BitbankTrade> & Pick<BitbankTrade, "trade_id" | "order_id">): BitbankTrade {
  return {
    pair: "ltc_jpy",
    side: "buy",
    type: "limit",
    amount: "1",
    price: "100",
    maker_taker: "taker",
    fee_amount_base: "0",
    fee_amount_quote: "0",
    executed_at: 1,
    ...partial,
  };
}

describe("mergeTrades", () => {
  it("drops closed-order rows when real fills already exist for the order", () => {
    const merged = mergeTrades(
      [
        trade({
          trade_id: 10,
          order_id: 58496505888,
          amount: "1.1",
          price: "6666",
        }),
      ],
      [
        trade({
          trade_id: 58496505888,
          order_id: 58496505888,
          amount: "2.22",
          price: "6666",
          source: "order_csv",
        }),
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].trade_id).toBe(10);
    expect(merged[0].amount).toBe("1.1");
  });

  it("keeps closed-order rows when the order is missing from fill history", () => {
    const merged = mergeTrades(
      [],
      [
        trade({
          trade_id: 58496505888,
          order_id: 58496505888,
          source: "order_csv",
        }),
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("order_csv");
  });
});
