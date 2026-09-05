import { describe, expect, it } from "vitest";
import { parseCandles } from "./candles";

describe("parseCandles", () => {
  it("reads ohlcv rows", () => {
    const candles = parseCandles("btc_jpy", {
      success: 1,
      data: {
        candlestick: [
          {
            type: "1day",
            ohlcv: [["1", "2", "0.5", "1.5", "10", 1609459200000]],
          },
        ],
      },
    });
    expect(candles).toEqual([
      {
        pair: "btc_jpy",
        ts: 1609459200000,
        open: "1",
        high: "2",
        low: "0.5",
        close: "1.5",
        volume: "10",
      },
    ]);
  });

  it("returns empty on failure", () => {
    expect(parseCandles("btc_jpy", { success: 0, data: { code: 10000 } })).toEqual(
      [],
    );
  });
});
