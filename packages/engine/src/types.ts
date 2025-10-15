import type { ISODate, MetricKey } from "@crucible-trader/sdk";

/**
 * Basic OHLCV bar representation used for deterministic simulations.
 */
export interface Bar {
  readonly timestamp: ISODate;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/**
 * Equity snapshot captured after processing a bar.
 */
export interface EquityPoint {
  readonly timestamp: ISODate;
  readonly equity: number;
}

/**
 * Simplified trade fill used for diagnostics.
 */
export interface TradeFill {
  readonly id: string;
  readonly symbol: string;
  readonly side: "buy" | "sell";
  readonly quantity: number;
  readonly price: number;
  readonly timestamp: ISODate;
}

/**
 * Collection of bars keyed by instrument symbol.
 */
export type BarsBySymbol = Record<string, ReadonlyArray<Bar>>;

/**
 * Diagnostics emitted by the engine to aid reproducibility.
 */
export interface EngineDiagnostics {
  readonly seed: number;
  readonly processedBars: number;
  readonly equityCurve: ReadonlyArray<EquityPoint>;
  readonly trades: ReadonlyArray<TradeFill>;
  readonly requestedMetrics: ReadonlyArray<MetricKey>;
}
