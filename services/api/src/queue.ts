import { EventEmitter } from "node:events";

import type { BacktestRequest } from "@crucible-trader/sdk";

export interface QueueJob {
  readonly runId: string;
  readonly request: BacktestRequest;
}

type JobHandler = (job: QueueJob) => void;

const JOB_ENQUEUED = "job-enqueued";
const emitter = new EventEmitter();
const queue: QueueJob[] = [];
let draining = false;

/**
 * Adds a job to the in-memory FIFO queue.
 * TODO[phase-0-next]: replace with durable queue persisted to SQLite.
 */
export const enqueue = (job: QueueJob): void => {
  queue.push(job);
  scheduleDrain();
};

export const onJob = (handler: JobHandler): void => {
  emitter.on(JOB_ENQUEUED, handler);
};

const scheduleDrain = (): void => {
  if (!draining) {
    draining = true;
    setImmediate(drain);
  }
};

const drain = (): void => {
  while (queue.length > 0) {
    const pending = queue.shift();
    if (pending) {
      emitter.emit(JOB_ENQUEUED, pending);
    }
  }
  draining = false;
};
