import { describe, expect, it } from "vitest";
import { parseBitbankTradeCsv } from "./csv";

const SAMPLE = `注文id,取引id,通貨ペア,現物/信用,タイプ,売/買,数量,価格,実現損益,発生手数料,実現手数料,実現利息,m/t,取引日時
100,200,btc_jpy,現物,指値,買,1,10000000,0,1000JPY,1000JPY,0,taker,2020/01/15 12:34:56
101,201,BTC/JPY,現物,成行,売,0.4,12000000,0,0,0,0,maker,2020-02-01 09:00:00
102,202,eth_jpy,信用,指値,買,10,200000,0,0,0,0,taker,2021/03/01 00:00:00
`;

describe("parseBitbankTradeCsv", () => {
  it("parses spot rows and skips margin", () => {
    const trades = parseBitbankTradeCsv(SAMPLE);
    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({
      trade_id: 200,
      pair: "btc_jpy",
      side: "buy",
      amount: "1",
      price: "10000000",
      fee_amount_quote: "1000",
      fee_amount_base: "0",
    });
    expect(trades[1].side).toBe("sell");
    expect(trades[1].pair).toBe("btc_jpy");
    expect(trades[0].executed_at).toBe(Date.parse("2020-01-15T12:34:56+09:00"));
  });

  it("accepts pipe-delimited tables", () => {
    const trades = parseBitbankTradeCsv(
      `| 注文id | 取引id | 通貨ペア | 現物/信用 | タイプ | 売/買 | 数量 | 価格 | 実現損益 | 発生手数料 | 実現手数料 | 実現利息 | m/t | 取引日時 |\n| 1 | 9 | xrp_jpy | 現物 | 指値 | 買 | 100 | 80 | 0 | 0 | 0 | 0 | taker | 2022/05/05 10:00:00 |`,
    );
    expect(trades).toHaveLength(1);
    expect(trades[0].trade_id).toBe(9);
    expect(trades[0].amount).toBe("100");
  });
});
