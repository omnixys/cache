import { VALKEY_PUB, VALKEY_SUB } from '../core/cache-constants.js';
import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { OmnixysLogger } from '@omnixys/logger';
import { CacheTrace } from '@omnixys/observability';
import type { ValkeyClientType } from '@valkey/client';

@Injectable()
export class ValkeyPubSubService implements OnModuleDestroy {
  private readonly channels = new Set<string>();
  private activeHandlers = 0;
  private closing = false;

  constructor(
    @Optional() @Inject(VALKEY_PUB) private readonly publisher: ValkeyClientType | null,
    @Optional() @Inject(VALKEY_SUB) private readonly subscriber: ValkeyClientType | null,
    @Optional() private readonly logger?: OmnixysLogger,
  ) {}

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
      this.activeHandlers += 1;
      try {
        await CacheTrace.subscribe(channel, async (span) => {
          span?.setAttribute('messaging.system', 'valkey');
          span?.setAttribute('messaging.destination', channel);
          await handler(JSON.parse(message) as T);
        });
      } catch (error) {
        this.logger
          ?.child(ValkeyPubSubService.name)
          .error('Pub/Sub message handler failed', { channel, error });
      } finally {
        this.activeHandlers -= 1;
      }
    });
    this.channels.add(channel);
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.subscriber?.isOpen) return;
    await this.subscriber.unsubscribe(channel);
    this.channels.delete(channel);
  }

  status(): 'closing' | 'disabled' | 'ready' | 'unavailable' {
    if (this.closing) return 'closing';
    if (!this.publisher || !this.subscriber) return 'disabled';
    return this.publisher.isReady && this.subscriber.isReady ? 'ready' : 'unavailable';
  }

  async health() {
    const status = this.status();
    return { healthy: status === 'ready' || status === 'disabled', status };
  }

  diagnostics() {
    return {
      status: this.status(),
      channels: [...this.channels],
      activeHandlers: this.activeHandlers,
    };
  }

  async drain(timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.activeHandlers > 0) {
      if (Date.now() >= deadline) {
        throw new Error(`Valkey Pub/Sub drain timed out after ${timeoutMs}ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    try {
      for (const channel of [...this.channels]) await this.unsubscribe(channel);
      await this.drain();
      if (this.publisher?.isOpen) await this.publisher.quit();
      if (this.subscriber?.isOpen) await this.subscriber.quit();
    } finally {
      this.closing = false;
    }
  }

  onModuleDestroy(): Promise<void> {
    return this.close();
  }

  private ensurePubSubEnabled(): void {
    if (!this.publisher || !this.subscriber) {
      throw new Error(
        'Valkey Pub/Sub is not enabled. Set pubSub.enabled=true in ValkeyModule options.',
      );
    }
    if (this.closing) throw new Error('Valkey Pub/Sub is closing');
  }
}
