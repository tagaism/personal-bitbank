import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BitbankTrade } from "./bitbank/types";

const CACHE_VERSION = 1;
const CACHE_PATH = path.join(process.cwd(), ".data", "trades.json");

export type TradeCache = {
  version: number;
  trades: BitbankTrade[];
  syncedAt: number | null;
};

const emptyCache = (): TradeCache => ({
  version: CACHE_VERSION,
  trades: [],
  syncedAt: null,
});

export async function loadTradeCache(): Promise<TradeCache> {
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as TradeCache;
    if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.trades)) {
      return emptyCache();
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyCache();
    throw error;
  }
}

export async function saveTradeCache(cache: TradeCache): Promise<void> {
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const payload: TradeCache = {
    version: CACHE_VERSION,
    trades: cache.trades,
    syncedAt: cache.syncedAt,
  };
  await writeFile(CACHE_PATH, JSON.stringify(payload), "utf8");
}

export function mergeTrades(
  existing: BitbankTrade[],
  incoming: BitbankTrade[],
): BitbankTrade[] {
  const byId = new Map<number, BitbankTrade>();
  for (const trade of existing) byId.set(trade.trade_id, trade);
  for (const trade of incoming) byId.set(trade.trade_id, trade);
  return [...byId.values()].sort((a, b) => {
    if (a.executed_at !== b.executed_at) return a.executed_at - b.executed_at;
    return a.trade_id - b.trade_id;
  });
}
