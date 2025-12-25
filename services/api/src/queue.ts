import type { BacktestRequest } from "@crucible-trader/sdk";
import type { ApiDatabase } from "./db/index.js";

export interface QueueJob {
  readonly runId: string;
  readonly request: BacktestRequest;
}

export interface QueueOptions {
  readonly database: ApiDatabase;
  readonly pollIntervalMs?: number;
}

export type JobHandler = (job: QueueJob) => Promise<void>;

/**
 * SQLite-based job queue for backtest workers.
 * Jobs are stored in the runs table with status tracking.
 */
export class JobQueue {
  private readonly database: ApiDatabase;
  private readonly pollIntervalMs: number;
  private readonly handlers: Set<JobHandler> = new Set();
  private pollingTimer: NodeJS.Timeout | null = null;
  private processing = false;

  public constructor(options: QueueOptions) {
    this.database = options.database;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
  }

  /**
   * Enqueues a job by creating a run record with status="queued".
   * The job is already in the database at this point.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async enqueue(_job: QueueJob): Promise<void> {
    // Job is already in database with status="queued"
    // Trigger immediate poll if workers are listening
    if (this.handlers.size > 0 && !this.processing) {
      await this.poll();
    }
  }

  /**
   * Registers a handler that will process jobs.
   * Starts polling when the first handler is added.
   */
  public onJob(handler: JobHandler): void {
    this.handlers.add(handler);
    if (this.pollingTimer === null) {
      this.startPolling();
    }
  }

  /**
   * Stops polling for jobs.
   */
  public stop(): void {
    if (this.pollingTimer !== null) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private startPolling(): void {
    this.pollingTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    // Immediate first poll
    void this.poll();
  }

  private async poll(): Promise<void> {
    if (this.processing || this.handlers.size === 0) {
      return;
    }

    this.processing = true;
    try {
      const job = await this.dequeue();
      if (job) {
        await this.processJob(job);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Dequeues the next pending job atomically.
   * Updates status to "processing" to prevent other workers from picking it up.
   */
  private async dequeue(): Promise<QueueJob | null> {
    const queued = await this.database.getOldestQueuedRun();

    if (!queued) {
      return null;
    }

    // Atomically claim the job by updating status
    await this.database.updateRunStatus(queued.runId, "processing");

    const run = await this.database.getRun(queued.runId);
    if (!run) {
      return null;
    }

    try {
      const request = JSON.parse(run.requestJson) as BacktestRequest;
      return {
        runId: run.runId,
        request,
      };
    } catch {
      // Invalid JSON, mark as failed
      await this.database.updateRunStatus(queued.runId, "failed");
      return null;
    }
  }

  private async processJob(job: QueueJob): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(job);
      } catch (error) {
        // Handler errors should be logged by the handler itself
        // Mark job as failed if handler throws
        await this.database.updateRunStatus(job.runId, "failed");
      }
    }
  }
}

// Singleton queue instance for API server
let globalQueue: JobQueue | null = null;

/**
 * Initialize the global queue instance.
 * Used by the API server for enqueueing jobs.
 */
export function initializeQueue(database: ApiDatabase): JobQueue {
  globalQueue = new JobQueue({ database });
  return globalQueue;
}

/**
 * Enqueue a job using the global queue instance.
 */
export async function enqueue(job: QueueJob): Promise<void> {
  if (!globalQueue) {
    throw new Error("Queue not initialized. Call initializeQueue first.");
  }
  await globalQueue.enqueue(job);
}

/**
 * Register a job handler with the global queue instance.
 */
export function onJob(handler: JobHandler): void {
  if (!globalQueue) {
    throw new Error("Queue not initialized. Call initializeQueue first.");
  }
  globalQueue.onJob(handler);
}
