# bump-packages

Shared code for [bump](../bump) and [bump-backend](../bump-backend), as a Bun workspace of `@bump/*` packages. Each
package exports its TypeScript source directly (`exports: ./src/index.ts`); there is no build step.

| Package | What it holds |
|---|---|
| `@bump/shared` | Domain types (`Draft`, `Position`, `ClosedTrade`), trade math and `STYLES`, XP/mission/streak rules with a pure `replayProgress` the server uses, zod schemas for every request body |
| `@bump/api-types` | The HTTP contract of bump-backend. Self-contained, so `types:export` can copy it into the frontend |
| `@bump/dreamdex` | dreamDEX perps on Somnia Hideki: `HIDEKI` config, market mapping (`btc` → the WBTC perp row), raw unit conversion, `draftToOrder` / `closeToOrder` / `limitsToStops`, and `shortError` for revert → LCD message |
| `@bump/testkit` | Perp market fixtures with base decimals from 6 (XRP) to 24 (NEAR) |

```sh
bun install
bun test          # unit tests
bun run typecheck
bun run types:export   # copy api-types into ../bump/lib/api/types.ts
```

## dreamDEX notes

- Orders take no leverage: size = stake × leverage ÷ mark, floored to `lotSize`. A market order is an IOC limit at the
  mark ± slippage (default 50 bps), aligned outward to `tickSize`.
- There is no reduce-only flag on `placePerpOrder`. A close is an opposite-side order that nets against the position.
- TP and SL go out as one linked pair (`placePerpStopOrder` with `pair`): one transaction, one-cancels-other, 2× the
  SOMI/STT trigger payment. Both legs use quantity 0 = "the whole position when it fires".
- Price math runs on raw bigints, so `0.52 × 0.995` is exactly `0.5174` and never `0.51739999…`.
