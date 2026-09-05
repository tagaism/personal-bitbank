"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PortfolioResult } from "@/lib/portfolio";
import { formatQuantity, formatTimestamp, formatYen } from "@/lib/format";

type ImportResult = {
  ok: boolean;
  parsed?: number;
  imported?: number;
  total?: number;
  message?: string;
};

export function Dashboard() {
  const [data, setData] = useState<PortfolioResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/holdings", { cache: "no-store" });
      const body = (await response.json()) as PortfolioResult;
      setData(body);
    } catch {
      setData({
        ok: false,
        error: "unknown",
        message: "Could not reach the local API. Is the dev server running?",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onImport(file: File) {
    setImporting(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/import-csv", {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as ImportResult;
      if (!body.ok) {
        setNotice(body.message ?? "CSV import failed.");
        return;
      }
      setNotice(
        `Imported ${body.imported} new trades (${body.parsed} in file, ${body.total} stored).`,
      );
      await load();
    } catch {
      setNotice("CSV import failed.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
      <header className="flex flex-col gap-6 border-b border-[var(--line)] pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-[0.22em] text-[var(--accent)] uppercase">
            Personal · read-only
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-[var(--foam)]">
            Onigiri Coffee
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
            Spot holdings on bitbank. Quantity from the exchange, average cost
            from your remaining inventory (weighted).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onImport(file);
            }}
          />
          <button
            type="button"
            className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--foam)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
            disabled={importing || loading}
            onClick={() => fileRef.current?.click()}
          >
            {importing ? "Importing…" : "Import CSV"}
          </button>
          <button
            type="button"
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#2a1408] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </header>

      {notice ? (
        <p className="mt-4 text-sm text-[var(--accent)]">{notice}</p>
      ) : null}

      {loading && !data ? (
        <p className="mt-12 font-mono text-sm text-[var(--muted)]">
          Fetching assets and trade history. First sync can take a minute if you
          have years of fills.
        </p>
      ) : null}

      {data && !data.ok ? (
        <section className="mt-12 max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-lg text-[var(--foam)]">
            {data.error === "missing_keys" ? "API keys needed" : "Could not load"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{data.message}</p>
          {data.error === "missing_keys" ? (
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--muted)]">
              <li>
                In bitbank, create a <strong className="text-[var(--foam)]">read-only</strong> API
                key (no order or withdraw).
              </li>
              <li>
                Copy <code className="font-mono text-[var(--foam)]">.env.example</code> to{" "}
                <code className="font-mono text-[var(--foam)]">.env.local</code>.
              </li>
              <li>Paste the key and secret, then restart <code className="font-mono">npm run dev</code>.</li>
            </ol>
          ) : null}
        </section>
      ) : null}

      {data?.ok ? (
        <>
          <p className="mt-6 font-mono text-xs tracking-wide text-[var(--muted)]">
            {data.holdings.length} assets · {data.meta.tradeCount.toLocaleString("en-US")}{" "}
            trades
            {data.meta.oldestTradeAt
              ? ` · ${formatTimestamp(data.meta.oldestTradeAt)} → ${formatTimestamp(data.meta.newestTradeAt)}`
              : ""}
            {data.meta.syncedAt ? ` · synced ${formatTimestamp(data.meta.syncedAt)}` : ""}
            {loading ? " · refreshing…" : ""}
          </p>

          {data.meta.incompleteHistory ? (
            <div className="mt-4 rounded-xl border border-[var(--warn-line)] bg-[var(--warn-bg)] px-4 py-3 text-sm leading-6 text-[var(--warn)]">
              Trade history does not fully explain current balances. If you have
              been on bitbank for years, import the 約定履歴 CSV from{" "}
              <span className="font-mono">Data → execution history</span>. Margin
              trades are ignored for now.
              {data.meta.mismatches.length > 0 ? (
                <ul className="mt-2 font-mono text-xs">
                  {data.meta.mismatches.map((row) => (
                    <li key={row.asset}>
                      {row.asset.toUpperCase()}: held {row.onhand}, from trades{" "}
                      {row.fromTrades}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--line)]">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[var(--surface)] text-[11px] tracking-[0.18em] text-[var(--muted)] uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Asset</th>
                  <th className="px-5 py-3 text-right font-medium">Quantity</th>
                  <th className="px-5 py-3 text-right font-medium">Average cost</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-5 py-12 text-center text-sm text-[var(--muted)]"
                    >
                      No balances on the account.
                    </td>
                  </tr>
                ) : (
                  data.holdings.map((row) => (
                    <tr
                      key={row.asset}
                      className="border-t border-[var(--line)] bg-[var(--bg)]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-sm text-[var(--foam)]">
                            {row.asset.toUpperCase()}
                          </span>
                          <span className="text-xs text-[var(--muted)]">{row.name}</span>
                          {row.mismatch ? (
                            <span className="text-[10px] tracking-wide text-[var(--warn)] uppercase">
                              history gap
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-sm tabular-nums text-[var(--foam)]">
                        {formatQuantity(row.quantity, row.quantityPrecision)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-sm tabular-nums text-[var(--foam)]">
                        {row.asset === "jpy" ? "—" : formatYen(row.averageCostJpy)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
