import type { BitbankTrade } from "./bitbank/types";

const HEADER_ALIASES: Record<string, string> = {
  注文id: "order_id",
  取引id: "trade_id",
  通貨ペア: "pair",
  "現物/信用": "spot_margin",
  タイプ: "type",
  "売/買": "side",
  数量: "amount",
  価格: "price",
  実現損益: "profit_loss",
  発生手数料: "fee_occurred",
  実現手数料: "fee_realized",
  実現利息: "interest",
  "m/t": "maker_taker",
  取引日時: "executed_at",
  order_id: "order_id",
  trade_id: "trade_id",
  pair: "pair",
  side: "side",
  amount: "amount",
  price: "price",
  executed_at: "executed_at",
};

function detectDelimiter(headerLine: string): string {
  const pipes = (headerLine.match(/\|/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return pipes > commas ? "|" : ",";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizePair(raw: string): string {
  return raw.trim().toLowerCase().replace(/\//g, "_");
}

function parseSide(raw: string): "buy" | "sell" | null {
  const value = raw.trim().toLowerCase();
  if (value === "買" || value === "buy") return "buy";
  if (value === "売" || value === "sell") return "sell";
  return null;
}

function isMargin(raw: string | undefined): boolean {
  if (!raw) return false;
  const value = raw.trim().toLowerCase();
  return value === "信用" || value === "margin" || value === "short" || value === "long";
}

function parseExecutedAt(raw: string): number {
  const trimmed = raw.trim();
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && trimmed.length >= 12) {
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }
  const match = trimmed.match(
    /(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) {
    throw new Error(`Unrecognized trade timestamp: ${raw}`);
  }
  const [, year, month, day, hour, minute, second] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${(second ?? "00").padStart(2, "0")}+09:00`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`Unrecognized trade timestamp: ${raw}`);
  return ms;
}

function parseTypedFee(
  raw: string | undefined,
  base: string,
  quote: string,
): { base: string; quote: string } {
  const text = (raw ?? "").trim().replace(/,/g, "");
  if (!text || text === "-" || text === "—") {
    return { base: "0", quote: "0" };
  }
  const match = text.match(/^([+-]?\d+(?:\.\d+)?)\s*([A-Za-z]+)?$/);
  if (!match) {
    return { base: "0", quote: "0" };
  }
  const amount = match[1];
  const unit = (match[2] ?? "").toLowerCase();
  if (!unit || unit === quote) return { base: "0", quote: amount };
  if (unit === base) return { base: amount, quote: "0" };
  if (unit === "jpy") return { base: "0", quote: quote === "jpy" ? amount : "0" };
  return { base: "0", quote: amount };
}

export function parseBitbankTradeCsv(text: string): BitbankTrade[] {
  const stripped = text.replace(/^\uFEFF/, "").trim();
  if (!stripped) return [];
  const lines = stripped.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((header) => {
    const key = header.replace(/^\|+|\|+$/g, "").trim();
    return HEADER_ALIASES[key] ?? key;
  });

  const trades: BitbankTrade[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i], delimiter).map((cell) =>
      cell.replace(/^\|+|\|+$/g, "").trim(),
    );
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });

    if (isMargin(row.spot_margin)) continue;
    const side = parseSide(row.side);
    if (!side) continue;
    const pair = normalizePair(row.pair);
    if (!pair.includes("_")) continue;

    const { base, quote } = (() => {
      const index = pair.lastIndexOf("_");
      return { base: pair.slice(0, index), quote: pair.slice(index + 1) };
    })();

    const feeSource = row.fee_realized || row.fee_occurred;
    const fees = parseTypedFee(feeSource, base, quote);

    trades.push({
      trade_id: Number(row.trade_id),
      pair,
      order_id: Number(row.order_id || 0),
      side,
      type: row.type || "limit",
      amount: row.amount.replace(/,/g, ""),
      price: row.price.replace(/,/g, ""),
      maker_taker: row.maker_taker || "",
      fee_amount_base: fees.base,
      fee_amount_quote: fees.quote,
      executed_at: parseExecutedAt(row.executed_at),
    });
  }

  return trades.filter((trade) => Number.isFinite(trade.trade_id));
}
