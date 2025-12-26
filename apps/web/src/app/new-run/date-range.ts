import type { DataSource, Timeframe } from "@crucible-trader/sdk";
import type { DatasetRecord } from "./helpers";

export interface CoverageRange {
  readonly start: string;
  readonly end: string;
  readonly source: DataSource | "auto";
  readonly contributingSources: ReadonlyArray<DataSource>;
}

const SUPPORTED_REMOTE_SOURCES: ReadonlyArray<DataSource> = ["tiingo", "polygon"];

export const computeAvailableRange = ({
  datasets,
  symbol,
  timeframe,
  source,
}: {
  datasets: ReadonlyArray<DatasetRecord>;
  symbol: string;
  timeframe: Timeframe;
  source: DataSource;
}): CoverageRange | null => {
  const matching = datasets
    .filter(
      (record) =>
        record.symbol.toLowerCase() === symbol.toLowerCase() && record.timeframe === timeframe,
    )
    .map((record) => ({
      source: record.source as DataSource,
      start: normalizeDate(record.start),
      end: normalizeDate(record.end),
    }))
    .filter((record): record is { source: DataSource; start: string; end: string } => {
      return Boolean(record.start && record.end);
    });

  const selectRangeForSource = (src: DataSource): CoverageRange | null => {
    const candidate = matching.find((record) => record.source === src);
    if (!candidate) {
      return null;
    }
    return {
      start: candidate.start,
      end: candidate.end,
      source: src,
      contributingSources: [src],
    };
  };

  if (source === "auto") {
    const remoteCandidates = matching.filter((record) =>
      SUPPORTED_REMOTE_SOURCES.includes(record.source),
    );
    const pool = remoteCandidates.length > 0 ? remoteCandidates : matching;
    if (pool.length === 0) {
      return null;
    }
    const start = pool.reduce(
      (min, record) => (record.start < min ? record.start : min),
      pool[0]!.start,
    );
    const end = pool.reduce((max, record) => (record.end > max ? record.end : max), pool[0]!.end);
    const sources = Array.from(new Set(pool.map((record) => record.source)));
    return {
      start,
      end,
      source: "auto",
      contributingSources: sources,
    };
  }

  return selectRangeForSource(source);
};

const normalizeDate = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length >= 10) {
    return trimmed.slice(0, 10);
  }
  return trimmed;
};
