import { VALKEY_PUB, VALKEY_SUB } from '../core/cache-constants.js';
import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { CacheTrace } from '@omnixys/observability';
import type { ValkeyClientType } from '@valkey/client';

@Injectable()
export class ValkeyPubSubService implements OnModuleDestroy {
  constructor(
    @Optional()
    @Inject(VALKEY_PUB)
    private readonly publisher: ValkeyClientType | null,
    @Optional()
    @Inject(VALKEY_SUB)
    private readonly subscriber: ValkeyClientType | null,
  ) {}

  private ensurePubSubEnabled(): void {
    if (!this.publisher || !this.subscriber) {
      throw new Error(
        'Valkey Pub/Sub is not enabled. Set pubSub.enabled=true in ValkeyModule options.',
      );
    }
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    this.ensurePubSubEnabled();

    await CacheTrace.publish(channel, async (span) => {
      span?.setAttribute('messaging.system', 'valkey');
      span?.setAttribute('messaging.destination', channel);
      await this.publisher!.publish(channel, JSON.stringify(payload));
    });
  }

  async subscribe<T>(channel: string, handler: (data: T) => void | Promise<void>): Promise<void> {
    this.ensurePubSubEnabled();

    await this.subscriber!.subscribe(channel, async (message) => {
      await CacheTrace.subscribe(channel, async (span) => {
        span?.setAttribute('messaging.system', 'valkey');
        span?.setAttribute('messaging.destination', channel);
        await handler(JSON.parse(message) as T);
      });
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.subscriber) {
      return;
    }

    await this.subscriber.unsubscribe(channel);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.publisher?.isOpen) {
      await this.publisher.quit();
    }

    if (this.subscriber?.isOpen) {
      await this.subscriber.quit();
    }
  }
}
