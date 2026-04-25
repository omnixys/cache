import { ValkeyService } from './valkey.service.js';
import { Injectable } from '@nestjs/common';
import { CacheObservabilityService } from '@omnixys/observability';

export interface StreamMessage<T = unknown> {
  id: string;
  data: T;
}

@Injectable()
export class ValkeyStreamService {
  constructor(
    private readonly valkey: ValkeyService,
    private readonly observability: CacheObservabilityService,
  ) {}

  /**
   * 🔥 Ensure consumer group exists (idempotent)
   */
  async ensureGroup(stream: string, group: string): Promise<void> {
    try {
      await this.valkey.client.xGroupCreate(stream, group, '0', {
        MKSTREAM: true,
      });

      console.log(`Stream group created: ${stream} (${group})`);
    } catch (err: any) {
      if (err?.message?.includes('BUSYGROUP')) {
        // already exists → ignore
        return;
      }

      throw err;
    }
  }

  async enqueue(stream: string, payload: unknown): Promise<string> {
    return this.observability.trace('stream.enqueue', stream, async (span) => {
      span?.setAttribute('cache.stream', stream);

      return this.valkey.client.xAdd(stream, '*', {
        data: JSON.stringify(payload),
      });
    });
  }

  async consume<T = unknown>(
    stream: string,
    group: string,
    consumer: string,
    count = 10,
    blockMs = 5000,
  ): Promise<Array<StreamMessage<T>>> {
    return this.observability.trace('stream.consume', stream, async (span) => {
      span?.setAttribute('cache.stream', stream);
      span?.setAttribute('cache.stream.group', group);
      span?.setAttribute('cache.stream.consumer', consumer);
      span?.setAttribute('cache.stream.count', count);
      span?.setAttribute('cache.stream.block_ms', blockMs);

      const response = await this.valkey.client.xReadGroup(
        group,
        consumer,
        [{ key: stream, id: '>' }],
        {
          COUNT: count,
          BLOCK: blockMs,
        },
      );

      if (!response) {
        return [];
      }

      return response.flatMap((entry) => {
        return entry.messages.map((message) => ({
          id: message.id,
          data: JSON.parse(message.message.data) as T,
        }));
      });
    });
  }

  async ack(stream: string, group: string, id: string): Promise<void> {
    await this.valkey.client.xAck(stream, group, id);
  }

  async readPending(
    stream: string,
    group: string,
    consumer: string,
    count = 10,
  ): Promise<Array<StreamMessage>> {
    const response = await this.valkey.client.xReadGroup(
      group,
      consumer,
      [{ key: stream, id: '0' }], // 🔥 important: read pending
      { COUNT: count },
    );

    if (!response) return [];

    return response.flatMap((entry) =>
      entry.messages.map((message) => ({
        id: message.id,
        data: JSON.parse(message.message.data),
      })),
    );
  }
}
