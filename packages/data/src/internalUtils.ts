import type { DataRequest } from "@crucible-trader/sdk";

import type { Bar } from "./IDataSource.js";

/**
 * Shared helpers used across data sources to enforce consistent behaviour.
 */
export const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
};

/**
 * Normalises bars that may come from caches or remote APIs.
 */
export const sanitizeBar = (maybeBar: Bar | null | undefined): Bar | null => {
  if (!maybeBar) {
    return null;
  }

  const { timestamp, open, high, low, close, volume } = maybeBar;
  if (
    typeof timestamp !== "string" ||
    typeof open !== "number" ||
    typeof high !== "number" ||
    typeof low !== "number" ||
    typeof close !== "number" ||
    typeof volume !== "number"
  ) {
    return null;
  }

  return { timestamp, open, high, low, close, volume };
};

const parseTimestamp = (value: string): number | null => {
  const epoch = Date.parse(value);
  if (Number.isNaN(epoch)) {
    return null;
  }
  return epoch;
};

/**
 * Filters bars by the optional start/end timestamps inside a {@link DataRequest}.
 */
export const filterBarsForRequest = (
  bars: ReadonlyArray<Bar>,
  request: DataRequest,
): ReadonlyArray<Bar> => {
  const startEpoch = parseTimestamp(request.start ?? "");
  const endEpoch = parseTimestamp(request.end ?? "");

  return bars.filter((bar) => {
    const barEpoch = parseTimestamp(bar.timestamp);
    if (barEpoch === null) {
      return false;
    }
    const afterStart = startEpoch === null ? true : barEpoch >= startEpoch;
    const beforeEnd = endEpoch === null ? true : barEpoch <= endEpoch;
    return afterStart && beforeEnd;
  });
};

/**
 * Ensures all connectors store bars in chronological order.
 */
export const sortBarsChronologically = (bars: ReadonlyArray<Bar>): Bar[] => {
  return [...bars].sort((a, b) => {
    const epochA = parseTimestamp(a.timestamp) ?? 0;
    const epochB = parseTimestamp(b.timestamp) ?? 0;
    return epochA - epochB;
  });
};
