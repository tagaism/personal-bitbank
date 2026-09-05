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

  it("parses closed-order CSVs and skips unfilled rows", () => {
    const trades = parseBitbankTradeCsv(`注文id,通貨ペア,現物/信用,タイプ,売/買,数量,指値価格,トリガー価格,約定数量,平均価格,注文日時,ステータス,有効期限,ポストオンリー
58496505888,ltc_jpy,現物,limit,buy,2.22000000,6666.00000000,,2.22000000,6666.0000000000,2026-06-24 07:55:29.986,FULLY_FILLED,2026-12-21 07:55:29.986,FALSE
60111987499,xym_jpy,現物,limit,buy,43900.00000000,0.50000000,,0.00000000,0.0000000000,2026-08-29 15:27:32.764,CANCELED_UNFILLED,2027-02-25 15:27:32.764,FALSE
57900000001,doge_jpy,現物,limit,buy,100.00000000,10.00000000,,40.00000000,9.5000000000,2026-06-05 15:54:43.934,CANCELED_PARTIALLY_FILLED,2026-12-02 15:54:43.934,FALSE
`);
    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({
      trade_id: 58496505888,
      order_id: 58496505888,
      pair: "ltc_jpy",
      side: "buy",
      amount: "2.22000000",
      price: "6666.0000000000",
      source: "order_csv",
    });
    expect(trades[0].executed_at).toBe(Date.parse("2026-06-24T07:55:29.986+09:00"));
    expect(trades[1]).toMatchObject({
      order_id: 57900000001,
      amount: "40.00000000",
      price: "9.5000000000",
      source: "order_csv",
    });
  });
});
