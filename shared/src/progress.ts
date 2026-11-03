import type { CloseReason } from "./types.ts";

/** XP per action. A target hit stacks with the win, so a clean call pays 50. */
export const XP = { call: 10, close: 10, win: 15, target: 25 } as const;

export type MissionCounter = "calls" | "wins" | "targets";

/** Daily missions; counters reset at the player's local midnight. */
export const MISSIONS = [
  { id: "calls", label: "Make 3 calls", counter: "calls", goal: 3, xp: 30 },
  { id: "wins", label: "Close 2 trades in profit", counter: "wins", goal: 2, xp: 30 },
  { id: "target", label: "Hit a profit target", counter: "targets", goal: 1, xp: 30 },
] as const satisfies readonly { id: string; label: string; counter: MissionCounter; goal: number; xp: number }[];

/** XP needed to reach `level` from zero: 0, 100, 300, 600, 1000 … (each level costs 100 more than the last). */
const levelFloor = (level: number) => 50 * level * (level - 1);

/** Level for an XP total, plus progress through it. */
export function levelInfo(xp: number) {
  let level = 1;
  while (levelFloor(level + 1) <= xp) level++;
  const floor = levelFloor(level);
  const size = levelFloor(level + 1) - floor;
  return { level, into: xp - floor, size };
}

export type Counters = Record<MissionCounter, number>;

/** What a closed trade earned; the Closed screen shows it. */
export type Reward = {
  tradeId: string;
  xp: number;
  levelBefore: number;
  levelAfter: number;
  /** Labels of daily missions this trade completed. */
  missions: string[];
  streak: number;
  /** The first trade this player ever closed. */
  firstTrade: boolean;
};

/** A trade opening or closing, the only two things that earn XP. */
export type ProgressEvent =
  | { kind: "open"; tradeId: string; at: number }
  | { kind: "close"; tradeId: string; at: number; pnl: number; reason: CloseReason };

export type ProgressState = {
  xp: number;
  /** Consecutive days with at least one trade; `day` is the last of them (local YYYY-MM-DD). */
  streak: { count: number; day: string | null };
  /** Mission counters of `day`; a later day starts from zero. */
  daily: { day: string | null; counters: Counters };
  lastReward: Reward | null;
};

const ZERO: Counters = { calls: 0, wins: 0, targets: 0 };

export const INITIAL_PROGRESS: ProgressState = { xp: 0, streak: { count: 0, day: null }, daily: { day: null, counters: ZERO }, lastReward: null };

/**
 * Local calendar day of `ms` as YYYY-MM-DD. `tzOffsetMin` is what the player's `Date#getTimezoneOffset()` returns
 * (minutes behind UTC, so WIB is -420); the server has no other way to know where the player's midnight falls.
 */
export const dayKey = (ms: number, tzOffsetMin = 0) => new Date(ms - tzOffsetMin * 60_000).toISOString().slice(0, 10);

const countersOn = (s: ProgressState, day: string): Counters => (s.daily.day === day ? s.daily.counters : ZERO);

function bumpStreak(streak: ProgressState["streak"], at: number, tz: number): ProgressState["streak"] {
  const today = dayKey(at, tz);
  if (streak.day === today) return streak;
  return { count: streak.day === dayKey(at - 86_400_000, tz) ? streak.count + 1 : 1, day: today };
}

/** Mission XP for counters going from `before` to `after`, and the labels of missions that just completed. */
function completed(before: Counters, after: Counters) {
  const done = MISSIONS.filter((m) => before[m.counter] < m.goal && after[m.counter] >= m.goal);
  return { xp: done.reduce((sum, m) => sum + m.xp, 0), labels: done.map((m) => m.label) };
}

/** One event applied to the state. Pure, so the server can rebuild progress from the trade log at any time. */
export function applyEvent(s: ProgressState, e: ProgressEvent, tz = 0): ProgressState {
  const day = dayKey(e.at, tz);
  const before = countersOn(s, day);
  const streak = bumpStreak(s.streak, e.at, tz);
  if (e.kind === "open") {
    const after = { ...before, calls: before.calls + 1 };
    return { ...s, xp: s.xp + XP.call + completed(before, after).xp, streak, daily: { day, counters: after } };
  }
  const win = e.pnl > 0;
  const target = e.reason === "target";
  const after = { ...before, wins: before.wins + (win ? 1 : 0), targets: before.targets + (target ? 1 : 0) };
  const missions = completed(before, after);
  const gained = XP.close + (win ? XP.win : 0) + (target ? XP.target : 0) + missions.xp;
  const reward: Reward = {
    tradeId: e.tradeId,
    xp: gained,
    levelBefore: levelInfo(s.xp).level,
    levelAfter: levelInfo(s.xp + gained).level,
    missions: missions.labels,
    streak: streak.count,
    firstTrade: s.lastReward === null,
  };
  return { xp: s.xp + gained, streak, daily: { day, counters: after }, lastReward: reward };
}

/** Events in time order, folded from zero. Ties keep their given order (an open always precedes its close). */
export function replayProgress(events: readonly ProgressEvent[], tz = 0): ProgressState {
  return [...events].sort((a, b) => a.at - b.at).reduce((s, e) => applyEvent(s, e, tz), INITIAL_PROGRESS);
}

/** What the Home screen shows at `now`: a streak only counts while it is alive (traded today or yesterday). */
export function progressSummary(s: ProgressState, now: number, tz = 0) {
  const today = dayKey(now, tz);
  const counters = countersOn(s, today);
  const alive = s.streak.day === today || s.streak.day === dayKey(now - 86_400_000, tz);
  return {
    xp: s.xp,
    level: levelInfo(s.xp),
    streak: alive ? s.streak.count : 0,
    tradedToday: s.streak.day === today,
    missions: MISSIONS.map((m) => ({
      id: m.id,
      label: m.label,
      goal: m.goal,
      progress: Math.min(m.goal, counters[m.counter]),
      done: counters[m.counter] >= m.goal,
    })),
    lastReward: s.lastReward,
  };
}
