import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = path.join(process.cwd(), ".data", "portfolio.sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS candles (
  pair TEXT NOT NULL,
  ts INTEGER NOT NULL,
  open TEXT NOT NULL,
  high TEXT NOT NULL,
  low TEXT NOT NULL,
  close TEXT NOT NULL,
  volume TEXT NOT NULL,
  PRIMARY KEY (pair, ts)
);

CREATE TABLE IF NOT EXISTS candle_years (
  pair TEXT NOT NULL,
  year INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (pair, year)
);
`;

declare global {
  var __personalBitbankDb: DatabaseSync | undefined;
}

export function getDb(): DatabaseSync {
  if (globalThis.__personalBitbankDb) return globalThis.__personalBitbankDb;
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  globalThis.__personalBitbankDb = db;
  return db;
}
