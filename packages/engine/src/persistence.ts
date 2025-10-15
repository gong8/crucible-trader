import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import parquetjs from "parquetjs";

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

  await Promise.all([
    writeParquet(join(runDir, "equity.parquet"), equitySchema, rows.equity),
    writeParquet(join(runDir, "trades.parquet"), tradesSchema, rows.trades),
    writeParquet(join(runDir, "bars.parquet"), barsSchema, rows.bars),
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
