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
}

export interface DelayedJobSchedule<K extends JobKey = JobKey> {
  stream?: string;
  type: K;
  payload: DelayedJobRegistry[K];
  delayMs: number;

  retries?: number;
  maxRetries?: number;
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
