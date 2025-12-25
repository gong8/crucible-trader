import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import parquetjs from "parquetjs";

import type { ReportPayload } from "./report.js";
import { buildReportMarkdown } from "./report.js";

const { ParquetSchema, ParquetWriter } = parquetjs;

export interface EquityRow extends Record<string, unknown> {
  readonly time: string;
  readonly equity: number;
}

export interface TradeRow extends Record<string, unknown> {
  readonly time: string;
  readonly side: string;
  readonly qty: number;
  readonly price: number;
  readonly pnl: number;
  readonly fees: number;
  readonly reason: string;
}

export interface BarRow extends Record<string, unknown> {
  readonly time: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

const equitySchema = new ParquetSchema({
  time: { type: "UTF8" },
  equity: { type: "DOUBLE" },
});

const tradesSchema = new ParquetSchema({
  time: { type: "UTF8" },
  side: { type: "UTF8" },
  qty: { type: "DOUBLE" },
  price: { type: "DOUBLE" },
  pnl: { type: "DOUBLE" },
  fees: { type: "DOUBLE" },
  reason: { type: "UTF8" },
});

const barsSchema = new ParquetSchema({
  time: { type: "UTF8" },
  open: { type: "DOUBLE" },
  high: { type: "DOUBLE" },
  low: { type: "DOUBLE" },
  close: { type: "DOUBLE" },
  volume: { type: "DOUBLE" },
});

export interface ParquetArtifactInput {
  readonly equity: ReadonlyArray<EquityRow>;
  readonly trades: ReadonlyArray<TradeRow>;
  readonly bars: ReadonlyArray<BarRow>;
}

export const writeParquetArtifacts = async (
  runDir: string,
  rows: ParquetArtifactInput,
): Promise<void> => {
  await mkdir(runDir, { recursive: true });

  const safeEquity =
    rows.equity.length > 0 ? rows.equity : [{ time: new Date(0).toISOString(), equity: 0 }];
  const safeTrades =
    rows.trades.length > 0
      ? rows.trades
      : [
          {
            time: new Date(0).toISOString(),
            side: "buy",
            qty: 0,
            price: 0,
            pnl: 0,
            fees: 0,
            reason: "no_trades",
          },
        ];
  const safeBars =
    rows.bars.length > 0
      ? rows.bars
      : [
          {
            time: new Date(0).toISOString(),
            open: 0,
            high: 0,
            low: 0,
            close: 0,
            volume: 0,
          },
        ];

  await Promise.all([
    writeParquet(join(runDir, "equity.parquet"), equitySchema, safeEquity),
    writeParquet(join(runDir, "trades.parquet"), tradesSchema, safeTrades),
    writeParquet(join(runDir, "bars.parquet"), barsSchema, safeBars),
  ]);
};

const writeParquet = async <T extends Record<string, unknown>>(
  filePath: string,
  schema: InstanceType<typeof ParquetSchema>,
  rows: ReadonlyArray<T>,
): Promise<void> => {
  const writer = await ParquetWriter.openFile(schema, filePath);
  try {
    for (const row of rows) {
      await writer.appendRow(row);
    }
  } finally {
    await writer.close();
  }
};

export const writeReportArtifact = async (
  runDir: string,
  payload: ReportPayload,
): Promise<void> => {
  await mkdir(runDir, { recursive: true });
  const reportPath = join(runDir, "report.md");
  const markdown = buildReportMarkdown(payload);
  await writeFile(reportPath, markdown, { encoding: "utf-8" });
};
