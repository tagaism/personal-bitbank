"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { ValueHistoryResult, ValuePoint } from "@/lib/value-history";
import {
  RANGE_PRESETS,
  clampWindow,
  matchingPreset,
  panWindow,
  windowFromPreset,
  type ChartWindow,
  type RangePreset,
} from "@/lib/chart-range";
import { formatChartDate, formatChartTick, formatYen, formatYenAxis } from "@/lib/format";

type Props = {
  nonce: number | null;
};

const PAD = { left: 52, right: 12, top: 12, bottom: 28 };
const OVERVIEW_H = 48;
const MIN_SPAN = 7;

export function ValueChart({ nonce }: Props) {
  const [data, setData] = useState<ValueHistoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const [win, setWin] = useState<ChartWindow>({ start: 0, end: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const dragRef = useRef<null | { mode: "start" | "end" | "move"; origin: number; start: number; end: number }>(
    null,
  );

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

  const points = useMemo(() => (data?.ok ? data.points : []), [data]);
  const times = useMemo(() => points.map((point) => point.t), [points]);
  const view = useMemo(() => {
    if (points.length < 2) return { start: 0, end: 0 };
    if (win.start === 0 && win.end === 0) {
      return { start: 0, end: points.length - 1 };
    }
    return clampWindow(win.start, win.end, points.length, MIN_SPAN);
  }, [points.length, win.end, win.start]);

  const visible = useMemo(() => {
    if (points.length < 2) return [];
    return points.slice(view.start, view.end + 1);
  }, [points, view.end, view.start]);

  const height = 240;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const preset = matchingPreset(times, view);

  const geometry = useMemo(() => {
    if (visible.length < 2) return null;
    const xs = visible.map((point) => point.t);
    const ys = visible.map((point) => point.value);
    const minX = xs[0] ?? 0;
    const maxX = xs[xs.length - 1] ?? 1;
    const rawMin = Math.min(...ys);
    const rawMax = Math.max(...ys);
    const full = view.start === 0 && view.end === points.length - 1;
    const minY = full ? Math.min(0, rawMin) : rawMin - (rawMax - rawMin) * 0.08;
    const maxY = rawMax + (rawMax - rawMin) * 0.08 || 1;
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const xOf = (t: number) => PAD.left + ((t - minX) / spanX) * innerW;
    const yOf = (v: number) => PAD.top + ((maxY - v) / spanY) * innerH;
    const line = visible
      .map((point, index) => {
        const cmd = index === 0 ? "M" : "L";
        return `${cmd}${xOf(point.t).toFixed(2)} ${yOf(point.value).toFixed(2)}`;
      })
      .join(" ");
    const area = `${line} L${xOf(maxX).toFixed(2)} ${yOf(minY).toFixed(2)} L${xOf(minX).toFixed(2)} ${yOf(minY).toFixed(2)} Z`;
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((frac) => minY + spanY * frac);
    const tickCount = Math.min(6, visible.length);
    const xTicks: ValuePoint[] = [];
    const seenX = new Set<number>();
    for (let i = 0; i < tickCount; i += 1) {
      const index = Math.round((i * (visible.length - 1)) / (tickCount - 1));
      const point = visible[index];
      if (seenX.has(point.t)) continue;
      seenX.add(point.t);
      xTicks.push(point);
    }
    return { xOf, yOf, line, area, minX, maxX, minY, maxY, yTicks, xTicks, spanX };
  }, [innerH, innerW, points.length, view.end, view.start, visible]);

  const overview = useMemo(() => {
    if (points.length < 2) return null;
    const minX = points[0]?.t ?? 0;
    const maxX = points[points.length - 1]?.t ?? 1;
    const ys = points.map((point) => point.value);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const xOf = (t: number) => ((t - minX) / spanX) * width;
    const yOf = (v: number) => 4 + ((maxY - v) / spanY) * (OVERVIEW_H - 8);
    const line = points
      .map((point, index) => {
        const cmd = index === 0 ? "M" : "L";
        return `${cmd}${xOf(point.t).toFixed(2)} ${yOf(point.value).toFixed(2)}`;
      })
      .join(" ");
    const startT = points[view.start]?.t ?? minX;
    const endT = points[view.end]?.t ?? maxX;
    return {
      line,
      x0: xOf(startT),
      x1: xOf(endT),
    };
  }, [points, view.end, view.start, width]);

  function applyWindow(next: ChartWindow) {
    setHover(null);
    setWin(clampWindow(next.start, next.end, points.length, MIN_SPAN));
  }

  function onPreset(next: RangePreset) {
    applyWindow(windowFromPreset(times, next, MIN_SPAN));
  }

  function onMove(event: MouseEvent<SVGSVGElement>) {
    if (!geometry || visible.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let best = view.start;
    let bestDist = Number.POSITIVE_INFINITY;
    visible.forEach((point, offset) => {
      const dist = Math.abs(geometry.xOf(point.t) - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = view.start + offset;
      }
    });
    setHover(best);
  }

  function indexFromOverviewX(clientX: number, target: Element) {
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * (points.length - 1));
  }

  function onOverviewPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!overview || points.length < 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const index = indexFromOverviewX(event.clientX, event.currentTarget);
    const handlePx = 10;
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    let mode: "start" | "end" | "move" = "move";
    if (Math.abs(x - overview.x0) <= handlePx) mode = "start";
    else if (Math.abs(x - overview.x1) <= handlePx) mode = "end";
    else if (x < overview.x0 || x > overview.x1) {
      const span = view.end - view.start;
      applyWindow({ start: index, end: index + span });
      mode = "move";
    }
    dragRef.current = { mode, origin: index, start: view.start, end: view.end };
  }

  function onOverviewPointerMove(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const index = indexFromOverviewX(event.clientX, event.currentTarget);
    if (drag.mode === "start") {
      applyWindow({ start: index, end: drag.end });
      return;
    }
    if (drag.mode === "end") {
      applyWindow({ start: drag.start, end: index });
      return;
    }
    applyWindow(panWindow({ start: drag.start, end: drag.end }, index - drag.origin, points.length));
  }

  function onOverviewPointerUp() {
    dragRef.current = null;
  }

  const hoverPoint = hover != null ? points[hover] : undefined;
  const lastVisible = visible[visible.length - 1];
  const shown = hoverPoint ?? lastVisible;

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
        {visible.length > 0 ? (
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
          <>
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
              {geometry.xTicks.map((tick, index) => (
                <text
                  key={`${tick.t}-${index}`}
                  x={geometry.xOf(tick.t)}
                  y={height - 8}
                  textAnchor="middle"
                  fill="var(--muted)"
                  fontSize="10"
                  fontFamily="ui-monospace, monospace"
                >
                  {formatChartTick(tick.t, geometry.spanX)}
                </text>
              ))}
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

            <div className="mt-2 flex flex-wrap gap-1 px-3">
              {RANGE_PRESETS.map((name) => {
                const active = preset === name;
                return (
                  <button
                    key={name}
                    type="button"
                    className={`rounded-full px-3 py-1 font-mono text-[11px] tracking-wide ${
                      active
                        ? "bg-[var(--accent)] text-[#2a1408]"
                        : "border border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    }`}
                    onClick={() => {
                      onPreset(name);
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>

            {overview ? (
              <svg
                width={width}
                height={OVERVIEW_H}
                className="mt-2 block max-w-full cursor-ew-resize"
                onPointerDown={onOverviewPointerDown}
                onPointerMove={onOverviewPointerMove}
                onPointerUp={onOverviewPointerUp}
                onPointerCancel={onOverviewPointerUp}
              >
                <path
                  d={overview.line}
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth="1.25"
                  opacity="0.7"
                />
                <rect
                  x={Math.min(overview.x0, overview.x1)}
                  y="0"
                  width={Math.max(8, Math.abs(overview.x1 - overview.x0))}
                  height={OVERVIEW_H}
                  fill="var(--accent)"
                  fillOpacity="0.16"
                  stroke="var(--accent)"
                  strokeWidth="1"
                />
                <rect x={overview.x0 - 2} y="8" width="4" height={OVERVIEW_H - 16} rx="1" fill="var(--accent)" />
                <rect x={overview.x1 - 2} y="8" width="4" height={OVERVIEW_H - 16} rx="1" fill="var(--accent)" />
              </svg>
            ) : null}

            <div className="mt-1 px-3">
              <div className="relative mb-1 h-1 rounded-full bg-[var(--line)]">
                <div
                  className="absolute h-1 rounded-full bg-[var(--accent)]"
                  style={{
                    left: `${points.length > 1 ? (view.start / (points.length - 1)) * 100 : 0}%`,
                    width: `${
                      points.length > 1
                        ? ((view.end - view.start) / (points.length - 1)) * 100
                        : 100
                    }%`,
                  }}
                />
              </div>
              <div className="chart-dual-range">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, points.length - 1)}
                  value={view.start}
                  aria-label="Range start"
                  onChange={(event) => {
                    applyWindow({ start: Number(event.target.value), end: view.end });
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, points.length - 1)}
                  value={view.end}
                  aria-label="Range end"
                  onChange={(event) => {
                    applyWindow({ start: view.start, end: Number(event.target.value) });
                  }}
                />
              </div>
              <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                {formatChartDate(visible[0].t)} → {formatChartDate(shown.t)}
              </p>
            </div>
          </>
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
