import { ValkeyStreamService } from '../service/valkey-stream.service.js';
import { DelayedJobRegistryService } from './delayed-job-registry.service.js';
import { DelayedJobEnvelope } from './delayed-job.type.js';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class DelayedJobWorker implements OnModuleInit {
  private readonly logger = new Logger(DelayedJobWorker.name);

  private readonly stream = 'delayed:jobs';
  private readonly group = 'delayed-job-group';
  private readonly consumer = `consumer-${process.pid}`;
  private running = true;

  constructor(
    private readonly streamService: ValkeyStreamService,
    private readonly registry: DelayedJobRegistryService,
  ) {}

  async onModuleInit() {
    await this.streamService.ensureGroup(this.stream, this.group);
    this.run();
  }

  async onModuleDestroy() {
    this.running = false;
  }

  private async run() {
    while (this.running) {
      try {
        const messages = await this.streamService.consume<DelayedJobEnvelope>(
          this.stream,
          this.group,
          this.consumer,
          10,
          50,
        );

        for (const msg of messages) {
          await this.handle(msg.id, msg.data);
        }
      } catch (err) {
        this.logger.error('Worker loop error', err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private async handle(id: string, data: DelayedJobEnvelope) {
    const { type, payload, executeAt } = data;

    const delay = executeAt - Date.now();

    // 🔥 KEIN REQUEUE MEHR
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const parsed =
        typeof payload === 'string' ? JSON.parse(payload) : payload;

      await this.registry.execute(type, parsed);

      await this.streamService.ack(this.stream, this.group, id);
    } catch (err) {
      this.logger.error(`Failed job ${type}`, err);
    }
  }
}
