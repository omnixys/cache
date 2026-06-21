import { ValkeyStreamService } from '../service/valkey-stream.service.js';
import { ValkeyService } from '../service/valkey.service.js';
import { DelayedJobRegistry } from './delayed-job-registry.js';
import { DelayedJobEnvelope, DelayedJobSchedule, DelayedJobStatus } from './delayed-job.type.js';
import { Injectable, Optional } from '@nestjs/common';
import { ContextAccessor } from '@omnixys/context';
import { OmnixysLogger } from '@omnixys/logger';
import { randomUUID } from 'node:crypto';

const DEFAULT_STREAM = 'delayed:jobs';
const RECORD_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class DelayedJobService {
  constructor(
    private readonly streamService: ValkeyStreamService,
    @Optional() private readonly valkey?: ValkeyService,
    @Optional() private readonly logger?: OmnixysLogger,
  ) {}

  async schedule<T extends keyof DelayedJobRegistry>(
    input: DelayedJobSchedule<T>,
  ): Promise<string> {
    if (!Number.isFinite(input.delayMs) || input.delayMs < 0) {
      throw new RangeError('Delayed job delayMs must be a finite non-negative number');
    }
    if (input.maxRetries !== undefined && input.maxRetries < 0) {
      throw new RangeError('Delayed job maxRetries must be non-negative');
    }

    const now = Date.now();
    const context = ContextAccessor.get();
    const job: DelayedJobStatus<T> = {
      id: randomUUID(),
      type: input.type,
      payload: input.payload,
      executeAt: now + input.delayMs,
      retries: input.retries ?? 0,
      maxRetries: input.maxRetries ?? 3,
      retryDelayMs: input.retryDelayMs ?? 1_000,
      stream: input.stream ?? DEFAULT_STREAM,
      context: {
        requestId: context?.requestId ?? 'unscoped',
        correlationId: context?.correlationId ?? context?.requestId ?? 'unscoped',
        traceId: context?.trace?.traceId,
        actorId: context?.principal?.actorId,
        tenantId: context?.tenant?.tenantId ?? context?.principal?.tenantId,
      },
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
    };

    if (!this.valkey) {
      await this.streamService.enqueue(job.stream!, job);
      return job.id;
    }

    await this.persist(job);
    await this.valkey.client.zAdd(this.queueKey(), {
      score: job.executeAt,
      value: job.id,
    });
    this.logger?.child(DelayedJobService.name).info('Delayed job scheduled', {
      jobId: job.id,
      jobType: job.type,
      executeAt: job.executeAt,
    });
    return job.id;
  }

  async cancel(id: string): Promise<boolean> {
    const job = await this.status(id);
    if (!job || job.status === 'completed' || job.status === 'running') return false;
    if (!this.valkey) return false;

    await this.valkey.client.zRem(this.queueKey(), id);
    await this.persist({ ...job, status: 'canceled', updatedAt: Date.now() });
    return true;
  }

  async retry(id: string, delayMs = 0): Promise<boolean> {
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new RangeError('Delayed job retry delay must be non-negative');
    }
    const job = await this.status(id);
    if (!job || !this.valkey || job.status === 'running') return false;

    const retried: DelayedJobStatus = {
      ...job,
      status: 'scheduled',
      executeAt: Date.now() + delayMs,
      updatedAt: Date.now(),
      lastError: undefined,
    };
    await this.persist(retried);
    await this.valkey.client.zAdd(this.queueKey(), {
      score: retried.executeAt,
      value: retried.id,
    });
    return true;
  }

  async status(id: string): Promise<DelayedJobStatus | null> {
    if (!this.valkey) return null;
    const raw = await this.valkey.rawGet(this.recordKey(id));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DelayedJobStatus;
    } catch {
      return null;
    }
  }

  async claimDue(count = 10, _stream = DEFAULT_STREAM): Promise<DelayedJobStatus[]> {
    if (!this.valkey) return [];
    const script = `
      local ids = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, ARGV[2])
      for _, id in ipairs(ids) do redis.call('ZREM', KEYS[1], id) end
      return ids
    `;
    const result = await this.valkey.client.eval(script, {
      keys: [this.queueKey()],
      arguments: [String(Date.now()), String(count)],
    });
    const ids = Array.isArray(result) ? result.map(String) : [];
    const jobs: DelayedJobStatus[] = [];
    for (const id of ids) {
      const job = await this.status(id);
      if (!job || job.status !== 'scheduled') continue;
      const running = { ...job, status: 'running' as const, updatedAt: Date.now() };
      await this.persist(running);
      jobs.push(running);
    }
    return jobs;
  }

  async complete(job: DelayedJobStatus): Promise<void> {
    if (!this.valkey) return;
    await this.persist({ ...job, status: 'completed', updatedAt: Date.now() });
  }

  async fail(job: DelayedJobStatus, error: unknown): Promise<void> {
    if (!this.valkey) return;
    const retries = job.retries + 1;
    const lastError = error instanceof Error ? error.message : String(error);
    if (retries <= job.maxRetries) {
      const executeAt = Date.now() + (job.retryDelayMs ?? 1_000) * retries;
      const retrying: DelayedJobStatus = {
        ...job,
        retries,
        executeAt,
        status: 'scheduled',
        updatedAt: Date.now(),
        lastError,
      };
      await this.persist(retrying);
      await this.valkey.client.zAdd(this.queueKey(), {
        score: executeAt,
        value: job.id,
      });
      return;
    }

    await this.persist({
      ...job,
      retries,
      status: 'failed',
      updatedAt: Date.now(),
      lastError,
    });
  }

  private async persist(job: DelayedJobStatus): Promise<void> {
    await this.valkey?.rawSet(this.recordKey(job.id), JSON.stringify(job), RECORD_TTL_SECONDS);
  }

  private recordKey(id: string): string {
    return `delayed:job:${id}`;
  }

  private queueKey(): string {
    return this.valkey!.key(`${DEFAULT_STREAM}:scheduled`);
  }
}
