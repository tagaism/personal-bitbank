import { getDb } from "../db";

const PUBLIC_BASE = "https://public.bitbank.cc";
const QUERY_GAP_MS = 120;
const YEAR_TTL_MS = 12 * 60 * 60 * 1000;

export type Candle = {
  pair: string;
  ts: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseCandles(pair: string, body: unknown): Candle[] {
  if (!isRecord(body) || body.success !== 1 || !isRecord(body.data)) return [];
  const series = body.data.candlestick;
  if (!Array.isArray(series)) return [];
  const candles: Candle[] = [];
  for (const item of series) {
    if (!isRecord(item) || !Array.isArray(item.ohlcv)) continue;
    for (const rawRow of item.ohlcv) {
      if (!Array.isArray(rawRow) || rawRow.length < 6) continue;
      const row: unknown[] = rawRow;
      const open = row[0];
      const high = row[1];
      const low = row[2];
      const close = row[3];
      const volume = row[4];
      const ts = row[5];
      if (
        typeof open !== "string" ||
        typeof high !== "string" ||
        typeof low !== "string" ||
        typeof close !== "string" ||
        typeof volume !== "string" ||
        typeof ts !== "number"
      ) {
        continue;
      }
      candles.push({ pair, ts, open, high, low, close, volume });
    }
  }
  return candles;
}

function upsertCandles(candles: Candle[]) {
  if (candles.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO candles(pair, ts, open, high, low, close, volume)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pair, ts) DO UPDATE SET
       open = excluded.open,
       high = excluded.high,
       low = excluded.low,
       close = excluded.close,
       volume = excluded.volume`,
  );
  db.exec("BEGIN");
  try {
    for (const candle of candles) {
      stmt.run(
        candle.pair,
        candle.ts,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function fetchYear(pair: string, year: number): Promise<Candle[]> {
  const response = await fetch(
    `${PUBLIC_BASE}/${pair}/candlestick/1day/${year}`,
    { cache: "no-store" },
  );
  const body: unknown = await response.json();
  return parseCandles(pair, body);
}

function yearFetchedAt(pair: string, year: number): number | null {
  const row = getDb()
    .prepare("SELECT fetched_at FROM candle_years WHERE pair = ? AND year = ?")
    .get(pair, year) as { fetched_at: number } | undefined;
  return row?.fetched_at ?? null;
}

function markYearFetched(pair: string, year: number) {
  getDb()
    .prepare(
      `INSERT INTO candle_years(pair, year, fetched_at) VALUES (?, ?, ?)
       ON CONFLICT(pair, year) DO UPDATE SET fetched_at = excluded.fetched_at`,
    )
    .run(pair, year, Date.now());
}

function shouldFetchYear(pair: string, year: number, currentYear: number): boolean {
  const fetchedAt = yearFetchedAt(pair, year);
  if (fetchedAt == null) return true;
  if (year < currentYear) return false;
  return Date.now() - fetchedAt > YEAR_TTL_MS;
}

export async function ensureDailyCandles(
  pairs: string[],
  fromMs: number,
  toMs: number,
): Promise<{ pairs: number; yearsFetched: number }> {
  const startYear = new Date(fromMs).getUTCFullYear();
  const currentYear = new Date(toMs).getUTCFullYear();
  let yearsFetched = 0;

  for (const pair of pairs) {
    for (let year = startYear; year <= currentYear; year += 1) {
      if (!shouldFetchYear(pair, year, currentYear)) continue;
      const candles = await fetchYear(pair, year);
      upsertCandles(candles);
      markYearFetched(pair, year);
      yearsFetched += 1;
      await sleep(QUERY_GAP_MS);
    }
  }

  return { pairs: pairs.length, yearsFetched };
}

export function loadCloses(
  pairs: string[],
): Map<string, { ts: number; close: string }[]> {
  const byPair = new Map<string, { ts: number; close: string }[]>();
  if (pairs.length === 0) return byPair;
  const placeholders = pairs.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT pair, ts, close FROM candles
       WHERE pair IN (${placeholders})
       ORDER BY pair, ts`,
    )
    .all(...pairs) as { pair: string; ts: number; close: string }[];
  for (const row of rows) {
    let list = byPair.get(row.pair);
    if (!list) {
      list = [];
      byPair.set(row.pair, list);
    }
    list.push({ ts: row.ts, close: row.close });
  }
  return byPair;
}
