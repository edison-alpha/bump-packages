import { round2, roundPrice } from "./format.ts";
import type { Side } from "./types.ts";

type Plan = { side: Side; margin: number; leverage: number; targetPct: number; stopPct: number };

export const MARGIN_PRESETS = [10, 20, 50] as const;
/** Quick picks for leverage; every market also offers its own cap (5x, 10x or 20x on dreamDEX) and any whole step to it. */
export const LEVERAGE_PRESETS = [1, 2, 3, 5, 10, 15, 20] as const;
export const TARGET_PRESETS = [1, 2, 3, 5, 10] as const;
export const STOP_PRESETS = [0.5, 1, 1.5, 2, 3, 5] as const;

/**
 * One-turn trade styles: each sets leverage, profit target and stop loss together, so a beginner makes one choice
 * instead of three. "Tune it" on Build still edits the three values one by one (the style then reads as custom).
 */
// Targets / stops are small price moves on purpose: a trade should play out in minutes, not hours.
export const STYLES = [
  { id: "chill", label: "Chill", blurb: "Gentle swings, a calm start", leverage: 2, targetPct: 1, stopPct: 0.5 },
  { id: "spicy", label: "Spicy", blurb: "5x the action", leverage: 5, targetPct: 1.5, stopPct: 1 },
  { id: "wild", label: "Wild", blurb: "Big wins, big losses", leverage: 10, targetPct: 2, stopPct: 1 },
] as const;

export type StyleId = (typeof STYLES)[number]["id"];

/** The style a plan matches exactly, or null when it was tuned by hand. */
export const styleOf = (p: Pick<Plan, "leverage" | "targetPct" | "stopPct">) =>
  STYLES.find((s) => s.leverage === p.leverage && s.targetPct === p.targetPct && s.stopPct === p.stopPct) ?? null;

const direction = (side: Side) => (side === "long" ? 1 : -1);

/* ---- wheel steps (one detent each) ---- */

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** $1 per detent, 1..max (the free balance). */
export const stepMargin = (margin: number, dir: 1 | -1, max = 1000) => clamp(Math.round(margin) + dir, 1, Math.max(1, Math.floor(max)));

/** Next / previous style; from a hand-tuned plan the wheel starts at Chill. */
export const stepStyle = (p: Pick<Plan, "leverage" | "targetPct" | "stopPct">, dir: 1 | -1) => {
  const i = STYLES.findIndex((s) => s.id === styleOf(p)?.id);
  return STYLES[i < 0 ? 0 : clamp(i + dir, 0, STYLES.length - 1)];
};

/** Leverage choices for a market whose cap is `max`: the presets below it, then the cap itself. */
export const leverageChoices = (max: number): number[] => [...new Set([...LEVERAGE_PRESETS.filter((v) => v < max), Math.max(1, Math.floor(max))])];

/** 1x per detent, 1..max. */
export const stepLeverage = (leverage: number, dir: 1 | -1, max: number) => clamp(Math.round(leverage) + dir, 1, Math.max(1, Math.floor(max)));

/** `leverage` held to a market's cap, so a style picked on a 20x coin still works on a 5x one. */
export const capLeverage = (leverage: number, max: number) => Math.min(leverage, Math.max(1, Math.floor(max)));

/** 0.5% per detent within [min, max]. */
export const stepPct = (pct: number, dir: 1 | -1, min = 0.5, max = 20) => clamp(Math.round((pct + dir * 0.5) * 2) / 2, min, max);

/** Close amount: 5% per detent, 5..100. */
export const stepClosePct = (pct: number, dir: 1 | -1) => clamp(Math.round(pct / 5) * 5 + dir * 5, 5, 100);

export const positionSize = (p: Pick<Plan, "margin" | "leverage">) => p.margin * p.leverage;

/** Price at which the profit target triggers. */
export const targetPrice = (entry: number, p: Pick<Plan, "side" | "targetPct">) =>
  roundPrice(entry * (1 + (direction(p.side) * p.targetPct) / 100));

/** Price at which the stop loss triggers. */
export const stopPrice = (entry: number, p: Pick<Plan, "side" | "stopPct">) =>
  roundPrice(entry * (1 - (direction(p.side) * p.stopPct) / 100));

export const profitAtTarget = (p: Plan) => round2((positionSize(p) * p.targetPct) / 100);
export const lossAtStop = (p: Plan) => round2((positionSize(p) * p.stopPct) / 100);

/** Gross unrealized profit of an open position at `price`. */
export const unrealizedPnl = (
  p: Pick<Plan, "side" | "margin" | "leverage">,
  entry: number,
  price: number,
) => round2(positionSize(p) * (price / entry - 1) * direction(p.side));

export const pnlOnMarginPct = (pnl: number, margin: number) => (margin ? (pnl / margin) * 100 : 0);

/** How far the price has moved from entry towards the target (positive) or the stop (negative): -1 at the stop, 1 at the target. */
export const targetProgress = (side: Side, entry: number, price: number, targetPct: number, stopPct: number) => {
  const move = priceMovePct(side, entry, price);
  return move >= 0 ? move / targetPct : move / stopPct;
};

export const priceMovePct = (side: Side, entry: number, price: number) =>
  (price / entry - 1) * 100 * direction(side);
