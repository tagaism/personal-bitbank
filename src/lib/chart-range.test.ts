import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESET,
  clampWindow,
  matchingPreset,
  panWindow,
  windowFromPreset,
} from "./chart-range";

const DAY = 86_400_000;
const times = Array.from({ length: 400 }, (_, i) => Date.UTC(2025, 0, 1) + i * DAY);

describe("clampWindow", () => {
  it("enforces order and a minimum span", () => {
    expect(clampWindow(10, 3, 20, 7)).toEqual({ start: 3, end: 10 });
    expect(clampWindow(-4, 80, 20, 7)).toEqual({ start: 0, end: 19 });
    expect(clampWindow(18, 19, 20, 7)).toEqual({ start: 13, end: 19 });
  });
});

describe("windowFromPreset", () => {
  it("returns the full series for ALL", () => {
    expect(windowFromPreset(times, "ALL")).toEqual({ start: 0, end: 399 });
  });

  it("takes the last 30 days for 1M", () => {
    const win = windowFromPreset(times, "1M");
    expect(win.end).toBe(399);
    expect(win.end - win.start).toBe(30);
  });

  it("starts at Jan 1 for YTD", () => {
    const late = Array.from({ length: 50 }, (_, i) => Date.UTC(2026, 5, 1) + i * DAY);
    const win = windowFromPreset(late, "YTD");
    expect(late[win.start]).toBe(Date.UTC(2026, 5, 1));
    expect(win.end).toBe(late.length - 1);
  });
});

describe("DEFAULT_PRESET", () => {
  it("is YTD", () => {
    expect(DEFAULT_PRESET).toBe("YTD");
    const win = windowFromPreset(times, DEFAULT_PRESET);
    expect(matchingPreset(times, win)).toBe("YTD");
    const endT = times[win.end] ?? 0;
    expect(times[win.start]).toBe(
      Date.UTC(new Date(endT).getUTCFullYear(), 0, 1),
    );
  });
});

describe("matchingPreset", () => {
  it("detects ALL vs 1M", () => {
    expect(matchingPreset(times, { start: 0, end: 399 })).toBe("ALL");
    expect(matchingPreset(times, windowFromPreset(times, "1M"))).toBe("1M");
  });
});

describe("panWindow", () => {
  it("slides the window without changing span", () => {
    expect(panWindow({ start: 10, end: 20 }, 5, 40)).toEqual({
      start: 15,
      end: 25,
    });
    expect(panWindow({ start: 0, end: 10 }, -3, 40)).toEqual({
      start: 0,
      end: 10,
    });
  });
});
