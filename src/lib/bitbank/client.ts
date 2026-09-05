import { createHmac } from "node:crypto";
import type {
  BitbankAsset,
  BitbankSuccess,
  BitbankTrade,
  TradeHistoryQuery,
} from "./types";

const PRIVATE_BASE = "https://api.bitbank.cc";
const TIME_WINDOW_MS = 5000;
const QUERY_GAP_MS = 120;
const MAX_RETRIES = 6;

export class BitbankConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BitbankConfigError";
  }
}

export class BitbankApiError extends Error {
  constructor(
    readonly code: number | null,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BitbankApiError";
  }
}

export type BitbankCredentials = {
  apiKey: string;
  apiSecret: string;
};

export function readBitbankCredentials(): BitbankCredentials | null {
  const apiKey = process.env.BITBANK_API_KEY?.trim();
  const apiSecret = process.env.BITBANK_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

function sign(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(code: number | null, status: number): string {
  if (status === 401 || code === 20001 || code === 20002 || code === 20003) {
    return "bitbank rejected the API key. Check BITBANK_API_KEY and BITBANK_API_SECRET.";
  }
  if (status === 429 || code === 20024) {
    return "bitbank rate limit hit. Wait a moment and retry.";
  }
  if (code != null) return `bitbank API error ${code}`;
  return `bitbank HTTP ${status}`;
}

export class BitbankClient {
  constructor(private readonly creds: BitbankCredentials) {}

  async getAssets(): Promise<BitbankAsset[]> {
    const data = await this.privateGet<{ assets: BitbankAsset[] }>(
      "/v1/user/assets",
    );
    return data.assets;
  }

  async getTradeHistory(query: TradeHistoryQuery = {}): Promise<BitbankTrade[]> {
    const params = new URLSearchParams();
    if (query.pair) params.set("pair", query.pair);
    if (query.count != null) params.set("count", String(query.count));
    if (query.order_id != null) params.set("order_id", String(query.order_id));
    if (query.since != null) params.set("since", String(query.since));
    if (query.end != null) params.set("end", String(query.end));
    if (query.order) params.set("order", query.order);
    const search = params.toString();
    const path = search
      ? `/v1/user/spot/trade_history?${search}`
      : "/v1/user/spot/trade_history";
    const data = await this.privateGet<{ trades?: BitbankTrade[] }>(path);
    return data.trades ?? [];
  }

  /**
   * Walks trade history newest → oldest. `end` is exclusive of the previous
   * page's oldest timestamp once a full page is consumed.
   */
  async getAllTradeHistory(options?: {
    since?: number;
    onPage?: (info: { page: number; added: number; total: number }) => void;
  }): Promise<{ trades: BitbankTrade[]; pagesFetched: number }> {
    const byId = new Map<number, BitbankTrade>();
    let end: number | undefined;
    let pagesFetched = 0;
    const since = options?.since;

    for (let page = 1; page <= 500; page += 1) {
      const trades = await this.getTradeHistory({
        count: 1000,
        order: "desc",
        end,
        since,
      });
      pagesFetched += 1;

      let added = 0;
      let oldest = Number.POSITIVE_INFINITY;
      for (const trade of trades) {
        if (!byId.has(trade.trade_id)) {
          byId.set(trade.trade_id, trade);
          added += 1;
        }
        if (trade.executed_at < oldest) oldest = trade.executed_at;
      }

      options?.onPage?.({ page, added, total: byId.size });

      if (trades.length === 0) break;
      if (added === 0) break;
      if (trades.length < 1000) break;
      if (!Number.isFinite(oldest)) break;

      const nextEnd = oldest;
      if (end != null && nextEnd >= end) {
        end = nextEnd - 1;
      } else {
        end = nextEnd;
      }

      await sleep(QUERY_GAP_MS);
    }

    return {
      trades: [...byId.values()],
      pagesFetched,
    };
  }

  private async privateGet<T>(pathWithQuery: string): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const requestTime = Date.now().toString();
      const timeWindow = TIME_WINDOW_MS.toString();
      const message = `${requestTime}${timeWindow}${pathWithQuery}`;
      const signature = sign(this.creds.apiSecret, message);

      const response = await fetch(`${PRIVATE_BASE}${pathWithQuery}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          "ACCESS-KEY": this.creds.apiKey,
          "ACCESS-REQUEST-TIME": requestTime,
          "ACCESS-TIME-WINDOW": timeWindow,
          "ACCESS-SIGNATURE": signature,
        },
      });

      const body = (await response.json()) as
        | BitbankSuccess<T>
        | { success: 0; data: { code: number } };

      if (response.status === 429) {
        lastError = new BitbankApiError(
          20024,
          429,
          errorMessage(20024, 429),
        );
        await sleep(500 * 2 ** attempt);
        continue;
      }

      if (!response.ok || body.success !== 1) {
        const code = body.success === 0 ? body.data.code : null;
        throw new BitbankApiError(
          code,
          response.status,
          errorMessage(code, response.status),
        );
      }

      return body.data;
    }

    throw lastError ?? new BitbankApiError(null, 429, errorMessage(20024, 429));
  }
}
