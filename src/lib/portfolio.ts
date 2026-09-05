import Decimal from "decimal.js";
import { BitbankClient, readBitbankCredentials } from "./bitbank/client";
import type { BitbankTrade } from "./bitbank/types";
import { loadTradeCache, mergeTrades, saveTradeCache } from "./cache";
import { computeCostBasis, quantitiesDiffer } from "./cost-basis";
import { assetName } from "./format";

export type HoldingRow = {
  asset: string;
  name: string;
  quantity: string;
  averageCostJpy: string | null;
  quantityPrecision: number;
  mismatch: boolean;
};

export type PortfolioMeta = {
  tradeCount: number;
  skippedMargin: number;
  syncedAt: number | null;
  oldestTradeAt: number | null;
  newestTradeAt: number | null;
  pagesFetched: number;
  incompleteHistory: boolean;
  mismatches: { asset: string; onhand: string; fromTrades: string }[];
};

export type PortfolioOk = {
  ok: true;
  holdings: HoldingRow[];
  meta: PortfolioMeta;
};

export type PortfolioErr = {
  ok: false;
  error: "missing_keys" | "bitbank" | "unknown";
  message: string;
};

export type PortfolioResult = PortfolioOk | PortfolioErr;

function extrema(trades: BitbankTrade[]): {
  oldestTradeAt: number | null;
  newestTradeAt: number | null;
} {
  if (trades.length === 0) {
    return { oldestTradeAt: null, newestTradeAt: null };
  }
  let oldest = trades[0].executed_at;
  let newest = trades[0].executed_at;
  for (const trade of trades) {
    if (trade.executed_at < oldest) oldest = trade.executed_at;
    if (trade.executed_at > newest) newest = trade.executed_at;
  }
  return { oldestTradeAt: oldest, newestTradeAt: newest };
}

export async function loadPortfolio(): Promise<PortfolioResult> {
  const creds = readBitbankCredentials();
  if (!creds) {
    return {
      ok: false,
      error: "missing_keys",
      message:
        "Add BITBANK_API_KEY and BITBANK_API_SECRET to .env.local and restart the dev server.",
    };
  }

  try {
    const client = new BitbankClient(creds);
    const cache = await loadTradeCache();
    const since =
      cache.trades.length > 0
        ? Math.max(...cache.trades.map((trade) => trade.executed_at))
        : undefined;

    const { trades: fetched, pagesFetched } = await client.getAllTradeHistory({
      since,
    });
    const trades = mergeTrades(cache.trades, fetched);
    const syncedAt = Date.now();
    await saveTradeCache({ version: 1, trades, syncedAt });

    const assets = await client.getAssets();
    const basis = computeCostBasis(trades);
    const mismatches: PortfolioMeta["mismatches"] = [];

    const holdings: HoldingRow[] = assets
      .filter((asset) => new Decimal(asset.onhand_amount || "0").gt(0))
      .map((asset) => {
        const code = asset.asset.toLowerCase();
        const lot = basis.lots[code];
        const mismatch =
          code !== "jpy" &&
          quantitiesDiffer(
            asset.onhand_amount,
            lot?.quantity,
            asset.amount_precision,
          );
        if (mismatch) {
          mismatches.push({
            asset: code,
            onhand: asset.onhand_amount,
            fromTrades: lot?.quantity ?? "0",
          });
        }
        return {
          asset: code,
          name: assetName(code),
          quantity: asset.onhand_amount,
          averageCostJpy: code === "jpy" ? null : (lot?.averageCostJpy ?? null),
          quantityPrecision: asset.amount_precision,
          mismatch,
        };
      })
      .sort((a, b) => {
        if (a.asset === "jpy") return 1;
        if (b.asset === "jpy") return -1;
        const aCost = Number(basis.lots[a.asset]?.costJpy ?? 0);
        const bCost = Number(basis.lots[b.asset]?.costJpy ?? 0);
        if (aCost !== bCost) return bCost - aCost;
        return a.asset.localeCompare(b.asset);
      });

    const { oldestTradeAt, newestTradeAt } = extrema(trades);

    return {
      ok: true,
      holdings,
      meta: {
        tradeCount: trades.length,
        skippedMargin: basis.skippedMargin,
        syncedAt,
        oldestTradeAt,
        newestTradeAt,
        pagesFetched,
        incompleteHistory: basis.incompleteHistory || mismatches.length > 0,
        mismatches,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error talking to bitbank.";
    return { ok: false, error: "bitbank", message };
  }
}

export async function importTrades(incoming: BitbankTrade[]): Promise<{
  imported: number;
  total: number;
}> {
  const cache = await loadTradeCache();
  const before = cache.trades.length;
  const trades = mergeTrades(cache.trades, incoming);
  await saveTradeCache({
    version: 1,
    trades,
    syncedAt: cache.syncedAt,
  });
  return { imported: trades.length - before, total: trades.length };
}
