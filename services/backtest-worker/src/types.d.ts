declare module "@crucible-trader/api/queue" {
  import type { BacktestRequest } from "@crucible-trader/sdk";

  export interface QueueJob {
    readonly runId: string;
    readonly request: BacktestRequest;
  }

  export type JobHandler = (job: QueueJob) => void;

  export function enqueue(job: QueueJob): void;
  export function onJob(handler: JobHandler): void;
}
