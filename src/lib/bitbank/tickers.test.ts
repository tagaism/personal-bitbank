import { describe, expect, it } from "vitest";
import { lastPriceByPair, parseTickers, priceInJpy } from "./tickers";

describe("parseTickers", () => {
  it("reads last prices from a successful payload", () => {
    const tickers = parseTickers({
      success: 1,
      data: [
        { pair: "BTC_JPY", last: "10000000" },
        { pair: "eth_btc", last: "0.05" },
      ],
    });
    expect(tickers).toEqual([
      { pair: "btc_jpy", last: "10000000" },
      { pair: "eth_btc", last: "0.05" },
    ]);
  });

  it("returns empty on a failed payload", () => {
    expect(parseTickers({ success: 0, data: { code: 10000 } })).toEqual([]);
  });
});

describe("priceInJpy", () => {
  const lastByPair = lastPriceByPair([
    { pair: "btc_jpy", last: "10000000" },
    { pair: "eth_jpy", last: "400000" },
    { pair: "xyz_btc", last: "0.01" },
  ]);

  it("uses the JPY pair when present", () => {
    expect(priceInJpy("eth", lastByPair)).toBe("400000");
  });

  it("converts BTC-quoted pairs through btc_jpy", () => {
    expect(priceInJpy("xyz", lastByPair)).toBe("100000");
  });

  it("returns null for JPY and unknown assets", () => {
    expect(priceInJpy("jpy", lastByPair)).toBeNull();
    expect(priceInJpy("unknown", lastByPair)).toBeNull();
  });
});
