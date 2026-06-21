import { ValkeyStreamService } from '../service/valkey-stream.service.js';
import { DelayedJobRegistryService } from './delayed-job-registry.service.js';
import { DelayedJobService } from './delayed-job.service.js';
import type {
  DelayedJobEnvelope,
  DelayedJobStatus,
} from './delayed-job.type.js';
import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ContextAccessor } from '@omnixys/context';
import { OmnixysLogger } from '@omnixys/logger';

const STREAM = 'delayed:jobs';

@Injectable()
export class DelayedJobWorker implements OnModuleInit, OnModuleDestroy {
  private readonly group = 'delayed-job-group';
  private readonly consumer = `consumer-${process.pid}`;
  private running = false;
  private inFlight = 0;
  private loop?: Promise<void>;

  constructor(
    private readonly streamService: ValkeyStreamService,
    private readonly registry: DelayedJobRegistryService,
    @Optional() private readonly jobs?: DelayedJobService,
    @Optional() private readonly logger?: OmnixysLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.loop = this.run();
  }

  ready(): boolean {
    return this.running;
  }

  status(): 'draining' | 'idle' | 'running' | 'stopped' {
    if (!this.running) return this.inFlight > 0 ? 'draining' : 'stopped';
    return this.inFlight > 0 ? 'running' : 'idle';
  }

  health(): {
    healthy: boolean;
    status: ReturnType<DelayedJobWorker['status']>;
  } {
    return { healthy: this.running, status: this.status() };
  }

  diagnostics() {
    return {
      status: this.status(),
      inFlight: this.inFlight,
      consumer: this.consumer,
    };
  }

  async drain(timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.inFlight > 0) {
      if (Date.now() >= deadline) {
        throw new Error(`Delayed job drain timed out after ${timeoutMs}ms`);
      }
      await sleep(10);
    }
  }

  async close(): Promise<void> {
    if (!this.running && !this.loop) return;
    this.running = false;
    await this.drain();
    await this.loop;
    this.loop = undefined;
  }

  shutdown(): Promise<void> {
    return this.close();
  }

  onModuleDestroy(): Promise<void> {
    return this.close();
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        const persistent = await this.jobs?.claimDue(10, STREAM);
        if (persistent && persistent.length > 0) {
          for (const job of persistent) await this.handlePersistent(job);
          continue;
        }

        if (this.jobs) {
          await sleep(50);
          continue;
        }

        await this.streamService.ensureGroup(STREAM, this.group);
        const messages = await this.streamService.consume<DelayedJobEnvelope>(
          STREAM,
          this.group,
          this.consumer,
          10,
          50,
        );
        for (const message of messages) {
          await this.handleLegacy(message.id, message.data);
        }
      } catch (error) {
        if (!this.running) break;
        this.logger
          ?.child(DelayedJobWorker.name)
          .error('Worker loop failed', { error });
        await sleep(1_000);
      }
    }
  }

  private async handlePersistent(job: DelayedJobStatus): Promise<void> {
    this.inFlight += 1;
    try {
      await this.runInJobContext(job, () =>
        this.registry.execute(job.type, job.payload),
      );
      await this.jobs!.complete(job);
    } catch (error) {
      await this.jobs!.fail(job, error);
      this.logger?.child(DelayedJobWorker.name).error('Delayed job failed', {
        error,
        jobId: job.id,
        jobType: job.type,
      });
    } finally {
      this.inFlight -= 1;
    }
  }

  private async handleLegacy(
    id: string,
    job: DelayedJobEnvelope,
  ): Promise<void> {
    if (job.executeAt > Date.now()) await sleep(job.executeAt - Date.now());
    this.inFlight += 1;
    try {
      const payload =
        typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
      await this.runInJobContext(job, () =>
        this.registry.execute(job.type, payload),
      );
      await this.streamService.ack(STREAM, this.group, id);
    } catch (error) {
      this.logger
        ?.child(DelayedJobWorker.name)
        .error('Legacy delayed job failed', {
          error,
          jobId: job.id,
          jobType: job.type,
        });
    } finally {
      this.inFlight -= 1;
    }
  }

  private runInJobContext<T>(job: DelayedJobEnvelope, fn: () => T): T {
    return job.context ? ContextAccessor.run(job.context, fn) : fn();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
