declare module "@crucible-trader/api/queue" {
  export { enqueue, onJob } from "../../api/src/queue";
  export type { QueueJob } from "../../api/src/queue";
}
