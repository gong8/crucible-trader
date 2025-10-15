export interface EquityPoint {
  readonly timestamp: string;
  readonly equity: number;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const TRADING_DAYS_PER_YEAR = 252;

export const calculateReturns = (points: ReadonlyArray<EquityPoint>): number[] => {
  if (points.length < 2) {
    return [];
  }
  const returns: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    if (prev.equity <= 0) {
      continue;
    }
    returns.push((current.equity - prev.equity) / prev.equity);
  }
  return returns;
};

const mean = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
};

const standardDeviation = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) {
    return 0;
  }
  const avg = mean(values);
  const variance = values.reduce((acc, value) => {
    const diff = value - avg;
    return acc + diff * diff;
  }, 0) / values.length;
  return Math.sqrt(variance);
};

export const calculateSharpe = (
  points: ReadonlyArray<EquityPoint>,
  riskFreeRate = 0,
): number => {
  const returns = calculateReturns(points);
  if (returns.length === 0) {
    return 0;
  }
  const excessReturns = returns.map((value) => value - riskFreeRate / TRADING_DAYS_PER_YEAR);
  const avg = mean(excessReturns);
  const std = standardDeviation(excessReturns);
  if (std === 0) {
    return 0;
  }
  return avg / std * Math.sqrt(TRADING_DAYS_PER_YEAR);
};

export const calculateSortino = (
  points: ReadonlyArray<EquityPoint>,
  riskFreeRate = 0,
): number => {
  const returns = calculateReturns(points);
  if (returns.length === 0) {
    return 0;
  }
  const excessReturns = returns.map((value) => value - riskFreeRate / TRADING_DAYS_PER_YEAR);
  const downside = excessReturns.filter((value) => value < 0);
  if (downside.length === 0) {
    return 0;
  }
  const downsideVariance = downside.reduce((acc, value) => acc + value * value, 0) / downside.length;
  const downsideStd = Math.sqrt(downsideVariance);
  if (downsideStd === 0) {
    return 0;
  }
  const avg = mean(excessReturns);
  return avg / downsideStd * Math.sqrt(TRADING_DAYS_PER_YEAR);
};

export const calculateMaxDrawdown = (points: ReadonlyArray<EquityPoint>): number => {
  if (points.length === 0) {
    return 0;
  }
  let peak = points[0].equity;
  let maxDrawdown = 0;
  for (const point of points) {
    if (point.equity > peak) {
      peak = point.equity;
    }
    if (peak > 0) {
      const drawdown = (point.equity - peak) / peak;
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }
  return maxDrawdown;
};

export const calculateCagr = (points: ReadonlyArray<EquityPoint>): number => {
  if (points.length < 2) {
    return 0;
  }
  const start = points[0];
  const end = points[points.length - 1];
  if (start.equity <= 0 || end.equity <= 0) {
    return 0;
  }
  const startTime = Date.parse(start.timestamp);
  const endTime = Date.parse(end.timestamp);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime >= endTime) {
    return 0;
  }
  const years = (endTime - startTime) / MS_PER_YEAR;
  if (years <= 0) {
    return 0;
  }
  return Math.pow(end.equity / start.equity, 1 / years) - 1;
};

export interface MetricSummary {
  readonly sharpe: number;
  readonly sortino: number;
  readonly maxDrawdown: number;
  readonly cagr: number;
}

export const calculateMetricsSummary = (
  points: ReadonlyArray<EquityPoint>,
): MetricSummary => ({
  sharpe: calculateSharpe(points),
  sortino: calculateSortino(points),
  maxDrawdown: calculateMaxDrawdown(points),
  cagr: calculateCagr(points),
});

export const DEFAULT_METRICS: (keyof MetricSummary)[] = [
  "sharpe",
  "sortino",
  "maxDrawdown",
  "cagr",
];
