## Purpose

Document the Phase 0 data sources (`CsvSource`, `TiingoSource`, `PolygonSource`) and how they service `DataRequest` payloads with caching and deterministic file output.

## Inputs

- `DataRequest` including `symbol`, `timeframe`, `start`, `end`, `source`, `adjusted`.
- File system roots: `storage/datasets/` and `.cache/` folders.
- Remote vendor credentials (`TIINGO_API_KEY`, `POLYGON_API_KEY`).

## Outputs

- Normalised arrays of bars sorted chronologically.
- Cached JSON payloads so repeated calls avoid re-downloading.
- CSV files materialised under `storage/datasets/<symbol>_<timeframe>.csv`.

## Invariants

- All bars contain numeric OHLCV values with ISO timestamps.
- Cache entries are invalidated when the dataset mtime changes.
- Auto mode always prefers cached CSVs, then Tiingo, then Polygon.

## Example

`TiingoSource.loadBars({ source: "tiingo", symbol: "AAPL", timeframe: "1d", start: "...", end: "..." })` fetches HTTPS JSON, writes `storage/datasets/aapl_1d.csv`, caches `.cache/tiingo/aapl_1d_adj.json`, and returns 8 deduped bars.

## Test Checklist

- `packages/data/test/csv-source.test.ts`, `tiingo-source.test.ts`, `polygon-source.test.ts` all pass via `pnpm --filter @crucible-trader/data test`.
- Dataset fetch API returns 200 for CSV/auto mode and 4xx with meaningful errors otherwise.
