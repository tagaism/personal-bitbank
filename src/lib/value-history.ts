import Decimal from "decimal.js";
import { BitbankClient, readBitbankCredentials } from "./bitbank/client";
import { ensureDailyCandles, loadCloses } from "./bitbank/candles";
import { getTickers, lastPriceByPair, priceInJpy } from "./bitbank/tickers";
import type { BitbankTrade } from "./bitbank/types";
import { loadTradeCache } from "./cache";
import { splitPair } from "./cost-basis";
import { applySpotFill, emptyQuantities } from "./quantities";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

const DUST = new Decimal("1e-16");
const DAY_MS = 86_400_000;

export type ValuePoint = {
  t: number;
  value: number;
};

export type ValueHistoryOk = {
  ok: true;
  points: ValuePoint[];
  meta: {
    from: number;
    to: number;
    scale: string;
    actualJpy: string | null;
    reconstructedEndJpy: string;
    offsetJpy: string;
    yearsFetched: number;
    pairCount: number;
  };
};

export type ValueHistoryErr = {
  ok: false;
  error: "missing_keys" | "no_trades" | "bitbank" | "unknown";
  message: string;
};

export type ValueHistoryResult = ValueHistoryOk | ValueHistoryErr;

export function utcDay(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function eachUtcDay(fromMs: number, toMs: number): number[] {
  const days: number[] = [];
  const end = utcDay(toMs);
  for (let day = utcDay(fromMs); day <= end; day += DAY_MS) days.push(day);
  return days;
}

export function pairsForTrades(trades: BitbankTrade[]): string[] {
  const pairs = new Set<string>(["btc_jpy"]);
  for (const trade of trades) {
    if (trade.position_side === "long" || trade.position_side === "short") continue;
    const { base, quote } = splitPair(trade.pair);
    if (base !== "jpy") {
      pairs.add(`${base}_jpy`);
      pairs.add(`${base}_btc`);
    }
    if (quote !== "jpy" && quote !== "btc") {
      pairs.add(`${quote}_jpy`);
      pairs.add(`${quote}_btc`);
    }
  }
  return [...pairs].sort();
}

function closeOnOrBefore(
  series: { ts: number; close: string }[] | undefined,
  dayTs: number,
): Decimal | null {
  if (!series || series.length === 0) return null;
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const point = series[mid];
    if (point.ts <= dayTs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;
  const close = series[found]?.close;
  if (!close) return null;
  const value = new Decimal(close);
  return value.gt(0) ? value : null;
}

export function priceAt(
  asset: string,
  dayTs: number,
  closes: Map<string, { ts: number; close: string }[]>,
  live?: Map<string, string>,
): Decimal | null {
  const code = asset.toLowerCase();
  if (code === "jpy") return new Decimal(1);

  const direct = closeOnOrBefore(closes.get(`${code}_jpy`), dayTs);
  if (direct) return direct;

  const vsBtc = closeOnOrBefore(closes.get(`${code}_btc`), dayTs);
  const btcJpy = closeOnOrBefore(closes.get("btc_jpy"), dayTs);
  if (vsBtc && btcJpy) return vsBtc.mul(btcJpy);

  if (live) {
    const livePrice = priceInJpy(code, live);
    if (livePrice && Number(livePrice) > 0) return new Decimal(livePrice);
  }
  return null;
}

export function markToMarket(
  qty: Map<string, Decimal>,
  dayTs: number,
  closes: Map<string, { ts: number; close: string }[]>,
  live?: Map<string, string>,
): Decimal {
  let total = new Decimal(0);
  for (const [asset, amount] of qty) {
    if (amount.abs().lte(DUST)) continue;
    const px = priceAt(asset, dayTs, closes, live);
    if (!px) continue;
    total = total.plus(amount.mul(px));
  }
  return total;
}

export type QtySnapshot = { t: number; qty: Map<string, Decimal> };

export function reconstructDailyQuantities(
  trades: BitbankTrade[],
  fromMs: number,
  toMs: number,
): QtySnapshot[] {
  const sorted = [...trades].sort((a, b) => {
    if (a.executed_at !== b.executed_at) return a.executed_at - b.executed_at;
    return a.trade_id - b.trade_id;
  });
  const qty = emptyQuantities();
  const days = eachUtcDay(fromMs, toMs);
  const points: QtySnapshot[] = [];
  let index = 0;

  for (const day of days) {
    const dayEnd = day + DAY_MS;
    while (index < sorted.length) {
      const trade = sorted[index];
      if (trade.executed_at >= dayEnd) break;
      applySpotFill(qty, trade);
      index += 1;
    }
    points.push({ t: day, qty: new Map(qty) });
  }
  return points;
}

type AssetFit =
  | { mode: "mul"; k: Decimal }
  | { mode: "offset"; delta: Decimal }
  | { mode: "const"; value: Decimal };

export function fitAsset(reconEnd: Decimal, actual: Decimal, cash: boolean): AssetFit {
  if (cash || reconEnd.lt(0) || actual.lt(0)) {
    return { mode: "offset", delta: actual.minus(reconEnd) };
  }
  if (reconEnd.abs().gt(DUST)) {
    return { mode: "mul", k: actual.div(reconEnd) };
  }
  return { mode: "const", value: actual };
}

export function applyFit(recon: Decimal, fit: AssetFit): Decimal {
  if (fit.mode === "mul") return recon.mul(fit.k);
  if (fit.mode === "offset") return recon.plus(fit.delta);
  return fit.value;
}

export function scaleQuantitiesToActual(
  snapshots: QtySnapshot[],
  actualQty: Map<string, Decimal>,
): QtySnapshot[] {
  if (snapshots.length === 0) return snapshots;
  const last = snapshots[snapshots.length - 1];
  const assets = new Set([...last.qty.keys(), ...actualQty.keys()]);
  const fits = new Map<string, AssetFit>();
  for (const asset of assets) {
    const reconEnd = last.qty.get(asset) ?? new Decimal(0);
    const actual = actualQty.get(asset) ?? new Decimal(0);
    fits.set(asset, fitAsset(reconEnd, actual, asset === "jpy"));
  }
  return snapshots.map((snap) => {
    const qty = new Map<string, Decimal>();
    for (const asset of assets) {
      const fit = fits.get(asset);
      if (!fit) continue;
      qty.set(asset, applyFit(snap.qty.get(asset) ?? new Decimal(0), fit));
    }
    return { t: snap.t, qty };
  });
}

export function scaleToActual(
  reconstructed: Decimal[],
  actual: Decimal | null,
): { values: Decimal[]; scale: Decimal; offset: Decimal } {
  const end = reconstructed[reconstructed.length - 1] ?? new Decimal(0);
  if (actual == null) {
    return { values: reconstructed, scale: new Decimal(1), offset: new Decimal(0) };
  }
  if (end.gt(0) && actual.gt(0)) {
    const scale = actual.div(end);
    return {
      values: reconstructed.map((value) => value.mul(scale)),
      scale,
      offset: new Decimal(0),
    };
  }
  const offset = actual.minus(end);
  return {
    values: reconstructed.map((value) => value.plus(offset)),
    scale: new Decimal(1),
    offset,
  };
}

export async function loadValueHistory(): Promise<ValueHistoryResult> {
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
    const cache = await loadTradeCache();
    const trades = cache.trades;
    if (trades.length === 0) {
      return {
        ok: false,
        error: "no_trades",
        message: "Refresh holdings once so trade history is cached, then open the chart.",
      };
    }

    const fromMs = Math.min(...trades.map((trade) => trade.executed_at));
    const toMs = Date.now();
    const pairs = pairsForTrades(trades);
    const { yearsFetched } = await ensureDailyCandles(pairs, fromMs, toMs);
    const closes = loadCloses(pairs);

    const client = new BitbankClient(creds);
    const [assets, tickers] = await Promise.all([
      client.getAssets(),
      getTickers().catch(() => []),
    ]);
    const live = lastPriceByPair(tickers);

    const actualQty = new Map<string, Decimal>();
    let actual: Decimal | null = new Decimal(0);
    for (const asset of assets) {
      const amount = new Decimal(asset.onhand_amount || "0");
      if (amount.lte(0)) continue;
      const code = asset.asset.toLowerCase();
      actualQty.set(code, amount);
      const livePrice = code === "jpy" ? "1" : priceInJpy(code, live);
      const px = livePrice
        ? new Decimal(livePrice)
        : priceAt(code, utcDay(toMs), closes, live);
      if (!px) continue;
      actual = actual.plus(amount.mul(px));
    }
    if (actual.lte(0)) actual = null;

    const qtySeries = scaleQuantitiesToActual(
      reconstructDailyQuantities(trades, fromMs, toMs),
      actualQty,
    );
    const reconstructed = qtySeries.map((snap, index) => {
      const isLast = index === qtySeries.length - 1;
      return {
        t: snap.t,
        reconstructed: markToMarket(
          snap.qty,
          snap.t,
          closes,
          isLast ? live : undefined,
        ),
      };
    });
    const scaled = scaleToActual(
      reconstructed.map((point) => point.reconstructed),
      actual,
    );
    const points: ValuePoint[] = reconstructed.map((point, index) => ({
      t: point.t,
      value: Number(scaled.values[index]?.toFixed(2) ?? "0"),
    }));

    return {
      ok: true,
      points,
      meta: {
        from: fromMs,
        to: toMs,
        scale: scaled.scale.toFixed(),
        actualJpy: actual?.toFixed() ?? null,
        reconstructedEndJpy: (
          reconstructed[reconstructed.length - 1]?.reconstructed ?? new Decimal(0)
        ).toFixed(),
        offsetJpy: scaled.offset.toFixed(),
        yearsFetched,
        pairCount: pairs.length,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error building value history.";
    return { ok: false, error: "bitbank", message };
  }
}
