"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { ValueHistoryResult } from "@/lib/value-history";
import { formatChartDate, formatYen, formatYenAxis } from "@/lib/format";

type Props = {
  nonce: number | null;
};

const PAD = { left: 52, right: 12, top: 12, bottom: 28 };

export function ValueChart({ nonce }: Props) {
  const [data, setData] = useState<ValueHistoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) {
        setWidth(Math.max(320, Math.floor(next)));
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/value-history", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as ValueHistoryResult;
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            ok: false,
            error: "unknown",
            message: "Could not load the value history.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const height = 240;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const geometry = useMemo(() => {
    if (!data?.ok || data.points.length < 2) return null;
    const xs = data.points.map((point) => point.t);
    const ys = data.points.map((point) => point.value);
    const minX = xs[0] ?? 0;
    const maxX = xs[xs.length - 1] ?? 1;
    const minY = Math.min(0, ...ys);
    const maxY = Math.max(...ys, 1);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const xOf = (t: number) => PAD.left + ((t - minX) / spanX) * innerW;
    const yOf = (v: number) => PAD.top + ((maxY - v) / spanY) * innerH;
    const line = data.points
      .map((point, index) => {
        const cmd = index === 0 ? "M" : "L";
        return `${cmd}${xOf(point.t).toFixed(2)} ${yOf(point.value).toFixed(2)}`;
      })
      .join(" ");
    const area = `${line} L${xOf(maxX).toFixed(2)} ${yOf(minY).toFixed(2)} L${xOf(minX).toFixed(2)} ${yOf(minY).toFixed(2)} Z`;
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((frac) => minY + spanY * frac);
    const years: number[] = [];
    for (const point of data.points) {
      const year = new Date(point.t).getUTCFullYear();
      if (years[years.length - 1] !== year) years.push(year);
    }
    return { xOf, yOf, line, area, minX, maxX, minY, maxY, yTicks, years };
  }, [data, innerH, innerW]);

  function onMove(event: MouseEvent<SVGSVGElement>) {
    if (!data?.ok || !geometry) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    data.points.forEach((point, i) => {
      const dist = Math.abs(geometry.xOf(point.t) - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setHover(best);
  }

  const hoverPoint =
    data?.ok && hover != null ? data.points[hover] : undefined;
  const lastPoint = data?.ok ? data.points[data.points.length - 1] : undefined;
  const shown = hoverPoint ?? lastPoint;

  return (
    <section className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
      <div className="flex flex-col gap-1 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm tracking-wide text-[var(--foam)]">
            Portfolio value
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Daily mark-to-market in JPY. Last point scaled to current exchange
            balances.
          </p>
        </div>
        {shown ? (
          <p className="font-mono text-sm tabular-nums text-[var(--foam)]">
            {formatYen(String(shown.value))}
            <span className="ml-2 text-xs text-[var(--muted)]">
              {formatChartDate(shown.t)}
            </span>
          </p>
        ) : null}
      </div>

      <div ref={wrapRef} className="px-2 pb-2 pt-1">
        {loading && !data ? (
          <p className="px-4 py-16 font-mono text-sm text-[var(--muted)]">
            Building daily value from trades and candles. First run can take a
            minute.
          </p>
        ) : null}

        {data && !data.ok ? (
          <p className="px-4 py-10 text-sm text-[var(--muted)]">{data.message}</p>
        ) : null}

        {data?.ok && geometry ? (
          <svg
            width={width}
            height={height}
            className="block max-w-full"
            onMouseMove={onMove}
            onMouseLeave={() => {
              setHover(null);
            }}
          >
            {geometry.yTicks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={geometry.yOf(tick)}
                  y2={geometry.yOf(tick)}
                  stroke="var(--line)"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 8}
                  y={geometry.yOf(tick) + 3}
                  textAnchor="end"
                  fill="var(--muted)"
                  fontSize="10"
                  fontFamily="ui-monospace, monospace"
                >
                  {formatYenAxis(tick)}
                </text>
              </g>
            ))}
            {geometry.years.map((year) => {
              const t = Math.max(Date.UTC(year, 0, 1), geometry.minX);
              if (t > geometry.maxX) return null;
              return (
                <text
                  key={year}
                  x={geometry.xOf(t)}
                  y={height - 8}
                  fill="var(--muted)"
                  fontSize="10"
                  fontFamily="ui-monospace, monospace"
                >
                  {year}
                </text>
              );
            })}
            <path d={geometry.area} fill="var(--accent)" fillOpacity="0.12" />
            <path
              d={geometry.line}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
            />
            {hoverPoint ? (
              <>
                <line
                  x1={geometry.xOf(hoverPoint.t)}
                  x2={geometry.xOf(hoverPoint.t)}
                  y1={PAD.top}
                  y2={height - PAD.bottom}
                  stroke="var(--foam)"
                  strokeOpacity="0.35"
                />
                <circle
                  cx={geometry.xOf(hoverPoint.t)}
                  cy={geometry.yOf(hoverPoint.value)}
                  r="3.5"
                  fill="var(--accent)"
                />
              </>
            ) : null}
          </svg>
        ) : null}

        {data?.ok ? (
          <p className="px-4 pb-3 font-mono text-[11px] text-[var(--muted)]">
            {Math.abs(Number(data.meta.scale) - 1) > 0.01
              ? `Scale ${Number(data.meta.scale).toFixed(3)}× to match exchange balances`
              : Math.abs(Number(data.meta.offsetJpy)) >= 1
                ? `Shifted ${formatYen(data.meta.offsetJpy)} so the latest point matches exchange balances`
                : "Latest point matches exchange balances"}
            {loading ? " · refreshing…" : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}
