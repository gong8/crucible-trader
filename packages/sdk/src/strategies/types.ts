export interface StrategyBar {
  readonly timestamp: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface StrategyContext {
  readonly symbol: string;
}

export interface StrategySignal {
  readonly side: "buy" | "sell";
  readonly timestamp: string;
  readonly reason: string;
  readonly strength?: number;
}

export interface Strategy {
  readonly name: string;
  readonly params: Record<string, unknown>;
  onInit(context: StrategyContext): void;
  onBar(context: StrategyContext, bar: StrategyBar): StrategySignal | null;
  onStop(context: StrategyContext): StrategySignal | null;
}

export type StrategyFactory<P> = (params: P) => Strategy;
