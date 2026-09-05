export const RANGE_PRESETS = ["1M", "3M", "6M", "1Y", "YTD", "ALL"] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export const DEFAULT_PRESET: RangePreset = "YTD";

export type ChartWindow = {
  start: number;
  end: number;
};

const PRESET_DAYS: Record<Exclude<RangePreset, "ALL" | "YTD">, number> = {
  "1M": 30,
  "3M": 91,
  "6M": 182,
  "1Y": 365,
};

const DAY_MS = 86_400_000;

export function clampWindow(
  start: number,
  end: number,
  length: number,
  minSpan = 7,
): ChartWindow {
  const last = Math.max(0, length - 1);
  const span = Math.min(Math.max(minSpan, 1), last + 1);
  let nextStart = Math.min(Math.max(0, start), last);
  let nextEnd = Math.min(Math.max(0, end), last);
  if (nextEnd < nextStart) {
    const swap = nextStart;
    nextStart = nextEnd;
    nextEnd = swap;
  }
  if (nextEnd - nextStart + 1 < span) {
    if (nextEnd + 1 >= span) nextStart = nextEnd - span + 1;
    else nextEnd = Math.min(last, nextStart + span - 1);
  }
  return { start: nextStart, end: nextEnd };
}

export function windowFromPreset(
  times: number[],
  preset: RangePreset,
  minSpan = 7,
): ChartWindow {
  const last = Math.max(0, times.length - 1);
  if (preset === "ALL" || times.length < 2) {
    return clampWindow(0, last, times.length, minSpan);
  }
  const endT = times[last] ?? 0;
  const startT =
    preset === "YTD"
      ? Date.UTC(new Date(endT).getUTCFullYear(), 0, 1)
      : endT - PRESET_DAYS[preset] * DAY_MS;
  let start = 0;
  for (let i = 0; i < times.length; i += 1) {
    const t = times[i] ?? 0;
    if (t >= startT) {
      start = i;
      break;
    }
  }
  return clampWindow(start, last, times.length, minSpan);
}

export function matchingPreset(
  times: number[],
  win: ChartWindow,
): RangePreset | null {
  if (times.length < 2) return "ALL";
  const last = times.length - 1;
  if (win.start === 0 && win.end === last) return "ALL";
  for (const preset of RANGE_PRESETS) {
    if (preset === "ALL") continue;
    const next = windowFromPreset(times, preset);
    if (next.start === win.start && next.end === win.end) return preset;
  }
  return null;
}

export function panWindow(
  win: ChartWindow,
  delta: number,
  length: number,
): ChartWindow {
  const span = win.end - win.start;
  const nextStart = win.start + delta;
  const nextEnd = win.end + delta;
  if (nextStart < 0) return { start: 0, end: span };
  if (nextEnd > length - 1) return { start: length - 1 - span, end: length - 1 };
  return { start: nextStart, end: nextEnd };
}
