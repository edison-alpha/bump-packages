// Wire contract between bump-backend and the bump app. Self-contained on purpose: scripts/export-api-types.mjs copies
// this file into the frontend, so it may not import anything.

export type Side = "long" | "short";
export type CloseReason = "manual" | "target" | "stop";

/** Every error response. `requestId` matches the x-request-id header and the server log line. */
export type ApiError = { error: string; requestId?: string };

export type Health = { ok: true; database: "postgres" | "pglite"; chainId: number; privy: boolean; faucet: boolean; push: boolean } | { ok: false; database: "unreachable" };

// Session ------------------------------------------------------------------------------------------------------------

/** POST /api/session body: the Privy access token and the embedded wallet it signed in with. */
export type SessionRequest = { token: string; address: string };

export type SessionUser = {
  address: string;
  /** Empty until profile setup; the app sends a signed-in player without one to that screen. */
  username: string;
  name: string;
  email: string | null;
  showOnLeaderboard: boolean;
  tutorialDone: boolean;
  /** True once guest data was imported (or there was none to import); the app stops offering it. */
  guestImported: boolean;
};

export type SessionResponse = { user: SessionUser | null };

// Profile ------------------------------------------------------------------------------------------------------------

/** POST /api/me/profile. Usernames are unique, case-insensitively; a taken one answers 409. */
export type ProfileRequest = { name: string; username: string; showOnLeaderboard: boolean };

/** POST /api/me/prefs. `tzOffsetMin` is `new Date().getTimezoneOffset()`, so missions reset at the player's midnight. */
export type PrefsRequest = { tzOffsetMin?: number; tutorialDone?: boolean; showOnLeaderboard?: boolean };

/** POST /api/me/import: a guest's local closed trades. Accepted once; they count for XP, never for the leaderboard. */
export type GuestImportRequest = {
  history: { id: string; marketId: string; side: Side; leverage: number; margin: number; entry: number; exit: number; pnl: number; closedAt: number; reason?: CloseReason }[];
  tutorialDone: boolean;
};
export type GuestImportResponse = { imported: number; progress: ProgressView };

// Trades -------------------------------------------------------------------------------------------------------------

/**
 * POST /api/trades: logged after the open transaction is confirmed. The server reads the entry price and size from the
 * transaction's fills; `entry` is only used when the server runs without receipt checks (local development).
 */
export type OpenTradeRequest = { marketId: string; side: Side; margin: number; leverage: number; targetPct: number; stopPct: number; txHash: string; entry?: number };

/**
 * POST /api/trades/:id/close, for a full or partial close. The server reads size, exit, PnL and reason from the fills
 * (the player's own tx is "manual"; the stop registry's is "target" or "stop"). Closes the app never reports, such as a
 * TP/SL firing while it is shut, are picked up by the server's watcher.
 */
export type CloseTradeRequest = { txHash: string; exit?: number; pnl?: number; reason?: CloseReason };

export type Trade = {
  id: string;
  /** "chain" trades are dreamDEX orders; "guest" trades were imported from practice play. */
  source: "chain" | "guest";
  marketId: string;
  side: Side;
  margin: number;
  leverage: number;
  targetPct: number;
  stopPct: number;
  /** Average fill price of the open, from the chain. */
  entry: number;
  openedAt: number;
  openTx: string | null;
  /** PnL realized so far by partial closes (the whole PnL once closed). */
  realizedPnl: number;
  /** Share of the position still open, 1 → 0. */
  openFraction: number;
  exit: number | null;
  pnl: number | null;
  reason: CloseReason | null;
  closedAt: number | null;
  closeTx: string | null;
};

/** POST /api/trades/:id/limits: the TP/SL the app just re-armed on chain. */
export type LimitsRequest = { targetPct: number; stopPct: number };

export type TradesResponse = { open: Trade | null; history: Trade[] };
export type OpenTradeResponse = { trade: Trade; progress: ProgressView };
export type CloseTradeResponse = { trade: Trade; progress: ProgressView };

// Progress -----------------------------------------------------------------------------------------------------------

export type Reward = { tradeId: string; xp: number; levelBefore: number; levelAfter: number; missions: string[]; streak: number; firstTrade: boolean };

/** Computed on the server from the trade log, so it cannot be edited from the browser. */
export type ProgressView = {
  xp: number;
  level: { level: number; into: number; size: number };
  streak: number;
  tradedToday: boolean;
  missions: { id: string; label: string; goal: number; progress: number; done: boolean }[];
  tutorialDone: boolean;
  lastReward: Reward | null;
};

// Leaderboard --------------------------------------------------------------------------------------------------------

export type LeaderboardPeriod = "today" | "week" | "month";
export type LeaderboardKind = "wins" | "losses";

export type LeaderboardEntry = {
  rank: number;
  /** Username, stable across renames of the display name. */
  id: string;
  name: string;
  /** Net price PnL in USD over the period, realized by on-chain closes and read from their fills. */
  pnl: number;
  /** Sum of margin put up over the period; pnl / volume is the % metric. */
  volume: number;
  trades: number;
  isYou?: boolean;
};

/** The viewer is always ranked (on the side their PnL falls on) even while hidden from others. */
export type LeaderboardResponse = { period: LeaderboardPeriod; kind: LeaderboardKind; entries: LeaderboardEntry[] };

// Gas ----------------------------------------------------------------------------------------------------------------

/** POST /api/gas/drip: STT for gas and TP/SL trigger fees. `txHash` is null when the wallet already had enough. */
export type GasDripResponse = { txHash: string | null; amount: string; balance: string; nextAt: number | null };

// Push ---------------------------------------------------------------------------------------------------------------

/** GET /api/push/key: the VAPID public key for PushManager.subscribe, or null when push is off on this server. */
export type PushKeyResponse = { publicKey: string | null };

/** POST /api/me/push: PushSubscription#toJSON(). DELETE /api/me/push takes { endpoint }. */
export type PushSubscribeRequest = { endpoint: string; keys: { p256dh: string; auth: string } };

/** The payload the service worker receives. */
export type PushMessage = { title: string; body: string; url: string; tag: string };
