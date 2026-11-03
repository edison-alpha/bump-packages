import { z } from "zod";
import { MARKET_ID_PATTERN } from "./markets.ts";

/** Validation for everything the app sends the backend. Bounds are generous; they only stop nonsense and abuse. */

export const sideSchema = z.enum(["long", "short"]);
export const closeReasonSchema = z.enum(["manual", "target", "stop"]);
/** Any dreamDEX market bump can find; the backend checks the id against the live listing before it trades. */
export const marketIdSchema = z.string().regex(MARKET_ID_PATTERN, "unknown market");
export const txHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte hash");

const usd = z.number().finite().positive().max(1_000_000);
const price = z.number().finite().positive();
const pct = z.number().finite().min(0.1).max(50);
/** dreamDEX caps BTC/ETH/SOL/XRP at 20x and BNB at 10x; the exchange enforces the per-market cap. */
const leverage = z.number().finite().min(1).max(20);
const ms = z.number().int().nonnegative();

export const draftSchema = z.object({ marketId: marketIdSchema, side: sideSchema, margin: usd, leverage, targetPct: pct, stopPct: pct });

export const closedTradeSchema = z.object({
  id: z.string().min(1).max(64),
  marketId: marketIdSchema,
  side: sideSchema,
  leverage,
  margin: usd,
  entry: price,
  exit: price,
  pnl: z.number().finite().min(-1_000_000).max(1_000_000),
  closedAt: ms,
  reason: closeReasonSchema.optional(),
});

/** Lowercase letters, digits and underscores; matched case-insensitively for uniqueness. */
export const usernameSchema = z.string().regex(/^[A-Za-z0-9_]{3,20}$/, "3–20 letters, digits or underscores");

export const profileInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  username: usernameSchema,
  showOnLeaderboard: z.boolean(),
});

/** A guest's local history, sent once when they sign in. */
export const guestImportSchema = z.object({
  history: z.array(closedTradeSchema).max(200),
  tutorialDone: z.boolean(),
});

/**
 * A position the player just opened on chain: the draft and the transaction that made it. The server reads the entry
 * from the transaction's fills; `entry` is only used when receipt checks are off (local development).
 */
export const openTradeSchema = draftSchema.extend({ entry: price.optional(), txHash: txHashSchema });

/**
 * A close, full or partial: the player's own transaction, or the stop registry's when a TP/SL fired. The server reads
 * size, exit price, PnL and reason from the fills; the other fields are only used when receipt checks are off.
 */
export const closeTradeSchema = z.object({
  txHash: txHashSchema,
  exit: price.optional(),
  pnl: z.number().finite().min(-1_000_000).max(1_000_000).optional(),
  reason: closeReasonSchema.optional(),
});

/** New TP/SL for an open trade, after the app re-armed its stops on chain. */
export const limitsSchema = z.object({ targetPct: pct, stopPct: pct });

/** A browser push subscription (PushSubscription#toJSON()). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type GuestImport = z.infer<typeof guestImportSchema>;
export type OpenTradeInput = z.infer<typeof openTradeSchema>;
export type CloseTradeInput = z.infer<typeof closeTradeSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
