import { describe, expect, it } from "vitest";
import type { HoldingRow } from "./portfolio";
import { nextHoldingSort, sortHoldings } from "./sort-holdings";

function row(
  partial: Partial<HoldingRow> & Pick<HoldingRow, "asset">,
): HoldingRow {
  return {
    name: partial.asset,
    quantity: "0",
    averageCostJpy: null,
    currentPriceJpy: null,
    quantityPrecision: 8,
    mismatch: false,
    ...partial,
  };
}

describe("sortHoldings", () => {
  it("sorts assets A–Z then Z–A", () => {
    const rows = [row({ asset: "eth" }), row({ asset: "btc" }), row({ asset: "jpy" })];
    expect(sortHoldings(rows, "asset", "asc").map((item) => item.asset)).toEqual([
      "btc",
      "eth",
      "jpy",
    ]);
    expect(sortHoldings(rows, "asset", "desc").map((item) => item.asset)).toEqual([
      "jpy",
      "eth",
      "btc",
    ]);
  });

  it("compares quantity numerically, not lexicographically", () => {
    const rows = [
      row({ asset: "a", quantity: "10" }),
      row({ asset: "b", quantity: "2" }),
      row({ asset: "c", quantity: "9" }),
    ];
    expect(sortHoldings(rows, "quantity", "asc").map((item) => item.asset)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortHoldings(rows, "quantity", "desc").map((item) => item.asset)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("keeps missing prices last in both directions", () => {
    const rows = [
      row({ asset: "jpy", currentPriceJpy: null }),
      row({ asset: "btc", currentPriceJpy: "15000000" }),
      row({ asset: "eth", currentPriceJpy: "500000" }),
    ];
    expect(
      sortHoldings(rows, "currentPriceJpy", "desc").map((item) => item.asset),
    ).toEqual(["btc", "eth", "jpy"]);
    expect(
      sortHoldings(rows, "currentPriceJpy", "asc").map((item) => item.asset),
    ).toEqual(["eth", "btc", "jpy"]);
  });

  it("breaks numeric ties by asset code", () => {
    const rows = [
      row({ asset: "eth", averageCostJpy: "100" }),
      row({ asset: "btc", averageCostJpy: "100" }),
    ];
    expect(
      sortHoldings(rows, "averageCostJpy", "desc").map((item) => item.asset),
    ).toEqual(["btc", "eth"]);
  });
});

describe("nextHoldingSort", () => {
  it("starts names ascending and numbers descending", () => {
    expect(nextHoldingSort(null, "asset")).toEqual({ key: "asset", dir: "asc" });
    expect(nextHoldingSort(null, "quantity")).toEqual({
      key: "quantity",
      dir: "desc",
    });
  });

  it("toggles the active column and resets when switching", () => {
    expect(nextHoldingSort({ key: "asset", dir: "asc" }, "asset")).toEqual({
      key: "asset",
      dir: "desc",
    });
    expect(nextHoldingSort({ key: "asset", dir: "desc" }, "currentPriceJpy")).toEqual({
      key: "currentPriceJpy",
      dir: "desc",
    });
  });
});
