// src/lib/broker/index.ts — mlango mmoja wa Capacity Broker.
export { brokerRun, brokerComplete, brokerClient, brokerStatus, peekLane, continuationMessages, trimForContinuation, joinContinuation, looksCut, BrokerExhaustedError, isBrokerExhausted } from "./broker";
export type { AcquireSpec, Lease, Run, WaitInfo, CompleteSpec, CompleteResult, WorkClass, Priority, Lane } from "./broker";
export { estimateTokens, classOf } from "./estimate";
export { allLanes } from "./lanes";
export { idleGuard, isStall, stallFirstMs, stallGapMs, type IdleGuard } from "./idle";
export { isNetworkError, isOnline, waitOnline, onNetState } from "./online";
