// delayed-job.service.ts
import { ValkeyStreamService } from '../service/valkey-stream.service.js';
import { ValkeyService } from '../service/valkey.service.js';
import { DelayedJobRegistry } from './delayed-job-registry.js';
import { DelayedJobEnvelope, DelayedJobSchedule } from './delayed-job.type.js';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

@Injectable()
export class DelayedJobService {
  private readonly stream = 'delayed:jobs';

  constructor(private readonly streamService: ValkeyStreamService) {}
  async schedule<T extends keyof DelayedJobRegistry>(input: DelayedJobSchedule<T>) {
    const id = randomUUID();
    const executeAt = Date.now() + input.delayMs;

    const job: DelayedJobEnvelope<T> = {
      id,
      type: input.type,
      payload: input.payload,
      executeAt,
      retries: 0,
      maxRetries: input.maxRetries ?? 3,
    };

    await this.streamService.enqueue(this.stream, job);
    return id;
  }
}
