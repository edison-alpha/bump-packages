/** Why bump refused to build an order before anything was signed. */
export type OrderErrorCode = "leverage" | "too-small" | "close-too-small" | "no-stops" | "stops-too-tight" | "bad-price";

export class OrderError extends Error {
  constructor(
    readonly code: OrderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrderError";
  }
}

/**
 * Contract reverts the player can hit, as short lines for the console LCD (`flash()`) and the Progress screen's
 * blocker. Keyed by the decoded Solidity error name, which the SDK puts on ContractRevertError#errorName.
 */
const REVERTS: Record<string, string> = {
  InsufficientMargin: "Not enough margin",
  InsufficientMarginForOrder: "Not enough margin",
  InsufficientMarginAtCreation: "Not enough margin",
  InsufficientCollateral: "Not enough balance",
  InsufficientBalance: "Not enough balance",
  InsufficientCredit: "Not enough balance",
  InsufficientSomiPayment: "Need STT for TP/SL",
  MarketRestricted: "Market is close-only",
  MaxPositionSizeExceeded: "Too big for this market",
  QuantityBelowMinimum: "Too small to trade",
  PositionBelowMinQuantity: "Too small to trade",
  InvalidLeverage: "Leverage too high",
  VoucherAccountLeverageLocked: "Leverage too high for voucher",
  VoucherLeverageCapNotSet: "Voucher can't open trades yet",
  VoucherMarketNotAllowed: "Voucher can't trade this",
  TriggerTooCloseToEma: "TP/SL too close to price",
  InvalidTriggerPrice: "TP/SL price not valid",
  NoOpenPosition: "No open position",
  NoPositionToFlatten: "No open position",
  MarkPriceUnavailable: "Price feed paused, try again",
  OraclePriceStale: "Price feed paused, try again",
  StalePrice: "Price feed paused, try again",
  CircuitBreakerTriggered: "Market paused, try again",
  FillPriceOutsideBand: "Price moved, try again",
  PriceOutOfBounds: "Price moved, try again",
  DeadlineExpired: "Took too long, try again",
};

/** The error and every `cause` beneath it: wallets and the SDK each wrap the one before. */
function* chain(error: unknown): Generator<Record<string, unknown>> {
  let e = error;
  for (let depth = 0; e && typeof e === "object" && depth < 8; depth++) {
    yield e as Record<string, unknown>;
    e = (e as { cause?: unknown }).cause;
  }
}

/** A short message for any failure on the trade path. Unknown failures read as a generic retry line. */
export function shortError(error: unknown): string {
  for (const e of chain(error)) {
    if (e instanceof OrderError) return e.message;
    if (e.name === "UserRejectedRequestError" || e.code === 4001) return "Cancelled";
    const name = typeof e.errorName === "string" ? e.errorName : undefined;
    if (name && REVERTS[name]) return REVERTS[name];
  }
  return "Trade failed, try again";
}
