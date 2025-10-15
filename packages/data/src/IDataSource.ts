import type { DataRequest } from "@crucible-trader/sdk";

/**
 * Basic OHLCV bar representation returned by data sources.
 */
export interface Bar {
  readonly timestamp: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/**
 * Generic contract for loading market data series.
 */
export interface IDataSource {
  readonly id: string;
  loadBars(request: DataRequest): Promise<ReadonlyArray<Bar>>;
}
