import { DelayedJobRegistry } from './delayed-job-registry.js';
import { DelayedJobKeys } from './delayed-job.keys.js';

export interface IDelayedJobHandler<T = any> {
  handle(payload: T): Promise<void>;
}

type JobKey = keyof DelayedJobRegistry;

export interface DelayedJobEnvelope<K extends JobKey = JobKey> {
  id: string;
  type: K;
  payload: DelayedJobRegistry[K];
  executeAt: number;

  retries: number;
  maxRetries: number;
  retryDelayMs?: number;
  stream?: string;
  context?: DelayedJobContext;
}

export interface DelayedJobContext {
  requestId: string;
  correlationId: string;
  traceId?: string;
  actorId?: string;
  tenantId?: string;
}

export type DelayedJobState =
  | 'canceled'
  | 'completed'
  | 'failed'
  | 'running'
  | 'scheduled';

export interface DelayedJobStatus<
  K extends JobKey = JobKey,
> extends DelayedJobEnvelope<K> {
  status: DelayedJobState;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
}

export interface DelayedJobSchedule<K extends JobKey = JobKey> {
  stream?: string;
  type: K;
  payload: DelayedJobRegistry[K];
  delayMs: number;

  retries?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export type DelayedJobKeysType = typeof DelayedJobKeys;

/**
 * Flatten helper (same pattern as Kafka)
 */
type Flatten<T> =
  T extends Record<string, any>
    ? {
        [K in keyof T]: T[K] extends string ? T[K] : Flatten<T[K]>;
      }[keyof T]
    : never;

export type DelayedJobKey = Flatten<DelayedJobKeysType>;

export interface DelayedJobHandlerInterface<
  K extends keyof DelayedJobRegistry = keyof DelayedJobRegistry,
> {
  handle(payload: DelayedJobRegistry[K]): Promise<void>;
}
