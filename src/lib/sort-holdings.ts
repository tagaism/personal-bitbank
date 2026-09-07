import Decimal from "decimal.js";
import type { HoldingRow } from "./portfolio";

export const HOLDING_SORT_KEYS = [
  "asset",
  "quantity",
  "averageCostJpy",
  "currentPriceJpy",
] as const;

export type HoldingSortKey = (typeof HOLDING_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export const DEFAULT_SORT_DIR: Record<HoldingSortKey, SortDir> = {
  asset: "asc",
  quantity: "desc",
  averageCostJpy: "desc",
  currentPriceJpy: "desc",
};

function numericValue(
  row: HoldingRow,
  key: Exclude<HoldingSortKey, "asset">,
): Decimal | null {
  const raw = row[key];
  if (raw == null) return null;
  try {
    const value = new Decimal(raw);
    return value.isFinite() ? value : null;
  } catch {
    return null;
  }
}

export function sortHoldings(
  rows: HoldingRow[],
  key: HoldingSortKey,
  dir: SortDir,
): HoldingRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "asset") {
      const byAsset = a.asset.localeCompare(b.asset);
      return byAsset === 0 ? 0 : mul * byAsset;
    }
    const left = numericValue(a, key);
    const right = numericValue(b, key);
    if (left == null && right == null) return a.asset.localeCompare(b.asset);
    if (left == null) return 1;
    if (right == null) return -1;
    const cmp = left.cmp(right);
    if (cmp !== 0) return mul * cmp;
    return a.asset.localeCompare(b.asset);
  });
}

export function nextHoldingSort(
  current: { key: HoldingSortKey; dir: SortDir } | null,
  clicked: HoldingSortKey,
): { key: HoldingSortKey; dir: SortDir } {
  if (current?.key === clicked) {
    return { key: clicked, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key: clicked, dir: DEFAULT_SORT_DIR[clicked] };
}
