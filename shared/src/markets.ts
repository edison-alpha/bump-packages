/**
 * bump's id for a dreamDEX market: its base symbol, lowercased (BTC → btc, 1000PEPE → 1000pepe). The list of markets is
 * whatever dreamDEX has listed and tradeable, not a fixed set, so ids are only checked for shape here.
 */
export type MarketId = string;

export const marketIdFromSymbol = (symbol: string): MarketId => symbol.toLowerCase().replace(/[^a-z0-9]/g, "");

export const MARKET_ID_PATTERN = /^[a-z0-9]{1,16}$/;

export const isMarketId = (id: string): id is MarketId => MARKET_ID_PATTERN.test(id);
