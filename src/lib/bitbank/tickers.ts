import Decimal from "decimal.js";

const PUBLIC_BASE = "https://public.bitbank.cc";

export type BitbankTicker = {
  pair: string;
  last: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseTickers(body: unknown): BitbankTicker[] {
  if (!isRecord(body) || body.success !== 1 || !Array.isArray(body.data)) {
    return [];
  }
  const tickers: BitbankTicker[] = [];
  for (const row of body.data) {
    if (!isRecord(row)) continue;
    if (typeof row.pair !== "string" || typeof row.last !== "string") continue;
    tickers.push({ pair: row.pair.toLowerCase(), last: row.last });
  }
  return tickers;
}

export function lastPriceByPair(tickers: BitbankTicker[]): Map<string, string> {
  const byPair = new Map<string, string>();
  for (const ticker of tickers) byPair.set(ticker.pair, ticker.last);
  return byPair;
}

export function priceInJpy(
  asset: string,
  lastByPair: Map<string, string>,
): string | null {
  const code = asset.toLowerCase();
  if (code === "jpy") return null;

  const direct = lastByPair.get(`${code}_jpy`);
  if (direct && Number(direct) > 0) return direct;

  const vsBtc = lastByPair.get(`${code}_btc`);
  const btcJpy = lastByPair.get("btc_jpy");
  if (vsBtc && btcJpy && Number(vsBtc) > 0 && Number(btcJpy) > 0) {
    return new Decimal(vsBtc).mul(btcJpy).toFixed();
  }
  return null;
}

export async function getTickers(): Promise<BitbankTicker[]> {
  const response = await fetch(`${PUBLIC_BASE}/tickers`, { cache: "no-store" });
  const body: unknown = await response.json();
  const tickers = parseTickers(body);
  if (!response.ok || tickers.length === 0) {
    throw new Error(
      response.ok
        ? "bitbank public tickers returned no pairs."
        : `bitbank public HTTP ${response.status}`,
    );
  }
  return tickers;
}
