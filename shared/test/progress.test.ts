import { describe, expect, it } from "bun:test";
import { dayKey, levelInfo, progressSummary, replayProgress, XP, type ProgressEvent } from "../src/index.ts";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 3, 3, 0); // 10:00 in WIB (UTC+7)
const WIB = -420;

const open = (tradeId: string, at: number): ProgressEvent => ({ kind: "open", tradeId, at });
const close = (tradeId: string, at: number, pnl: number, reason: "manual" | "target" | "stop" = "manual"): ProgressEvent => ({ kind: "close", tradeId, at, pnl, reason });

describe("replayProgress", () => {
  it("pays a clean target call 50 XP and marks it the first trade", () => {
    const s = replayProgress([open("a", T0), close("a", T0 + 60_000, 1, "target")], WIB);
    expect(s.xp).toBe(XP.call + XP.close + XP.win + XP.target + 30); // + "Hit a profit target" mission
    expect(s.lastReward).toEqual({ tradeId: "a", xp: 80, levelBefore: 1, levelAfter: 1, missions: ["Hit a profit target"], streak: 1, firstTrade: true });
  });

  it("completes each daily mission once and resets it at local midnight", () => {
    const day1 = [1, 2, 3].flatMap((i) => [open(`t${i}`, T0 + i * 1000), close(`t${i}`, T0 + i * 1000 + 500, 2)]);
    const s1 = replayProgress(day1, WIB);
    const summary = progressSummary(s1, T0 + 10_000, WIB);
    expect(summary.missions.map((m) => [m.id, m.progress, m.done])).toEqual([["calls", 3, true], ["wins", 2, true], ["target", 0, false]]);
    // 3 calls + 3 winning closes + two missions
    expect(s1.xp).toBe(3 * XP.call + 3 * (XP.close + XP.win) + 60);
    expect(s1.lastReward?.firstTrade).toBe(false);
    const nextDay = progressSummary(s1, T0 + DAY, WIB);
    expect(nextDay.missions.every((m) => m.progress === 0)).toBe(true);
    expect(nextDay.streak).toBe(1);
    expect(nextDay.tradedToday).toBe(false);
  });

  it("extends the streak on consecutive local days and drops it after a gap", () => {
    const s = replayProgress([open("a", T0), open("b", T0 + DAY), open("c", T0 + 2 * DAY)], WIB);
    expect(s.streak.count).toBe(3);
    expect(progressSummary(s, T0 + 4 * DAY, WIB).streak).toBe(0);
    const gap = replayProgress([open("a", T0), open("b", T0 + 3 * DAY)], WIB);
    expect(gap.streak.count).toBe(1);
  });

  it("orders events by time, whatever order they arrive in", () => {
    const events = [close("a", T0 + 500, -1, "stop"), open("a", T0)];
    expect(replayProgress(events).xp).toBe(XP.call + XP.close);
  });

  it("uses the player's timezone for the day boundary", () => {
    const lateUtc = Date.UTC(2026, 10, 3, 20, 0); // 03:00 next day in WIB
    expect(dayKey(lateUtc)).toBe("2026-11-03");
    expect(dayKey(lateUtc, WIB)).toBe("2026-11-04");
  });
});

describe("levelInfo", () => {
  it("costs 100 more XP for each level", () => {
    expect(levelInfo(0)).toEqual({ level: 1, into: 0, size: 100 });
    expect(levelInfo(100)).toEqual({ level: 2, into: 0, size: 200 });
    expect(levelInfo(650)).toEqual({ level: 4, into: 50, size: 400 });
  });
});
