declare module "parquetjs" {
  export class ParquetSchema {
    constructor(schema: Record<string, unknown>);
  }

  export class ParquetWriter {
    static openFile(schema: ParquetSchema, path: string): Promise<ParquetWriter>;
    appendRow(row: Record<string, unknown>): Promise<void>;
    close(): Promise<void>;
  }

  export class ParquetReader {
    static openFile(path: string): Promise<ParquetReader>;
    getCursor(columns?: string[]): ParquetCursor;
    close(): Promise<void>;
  }

  export interface ParquetCursor {
    next(): Promise<Record<string, unknown> | null>;
  }
}
