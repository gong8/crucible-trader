import type { DataRequest } from "@crucible-trader/sdk";

import type { Bar, IDataSource } from "./IDataSource.js";

/**
 * Phase 0 CSV data source returning deterministic mocked bars.
 */
export class CsvSource implements IDataSource {
  public readonly id = "csv";

  public async loadBars(request: DataRequest): Promise<ReadonlyArray<Bar>> {
    const basePrice = 100;
    const bars: Bar[] = Array.from({ length: 3 }).map((_, idx) => {
      const close = basePrice + idx;
      return {
        timestamp: deriveTimestamp(request.start, idx),
        open: close - 0.5,
        high: close + 1,
        low: close - 1,
        close,
        volume: 1_000 + idx * 100,
      };
    });

    // TODO[phase-0-next]: implement CSV parsing and caching under storage/datasets/.cache.
    return bars;
  }
}

const deriveTimestamp = (start: string, offset: number): string => {
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) {
    return start;
  }

  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString();
};

/**
 * Factory used by callers to construct the CSV data source.
 */
export const createCsvSource = (): CsvSource => {
  return new CsvSource();
};
