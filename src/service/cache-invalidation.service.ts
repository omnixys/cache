import { VALKEY_OPTIONS, VALKEY_PUB, VALKEY_SUB } from '../core/cache-constants.js';
import type { ValkeyModuleOptions } from '../core/cache-options.js';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ContextAccessor } from '@omnixys/context';
import { OmnixysLogger } from '@omnixys/logger';
import type { ValkeyClientType } from '@valkey/client';

export type CacheInvalidationOperation = 'delete' | 'set';

export interface CacheInvalidationEvent {
  readonly key: string;
  readonly operation: CacheInvalidationOperation;
  readonly source: string;
  readonly occurredAtEpochMs: number;
  readonly requestId: string;
  readonly correlationId: string;
}

export type CacheInvalidationHandler = (event: CacheInvalidationEvent) => void | Promise<void>;

@Injectable()
export class CacheInvalidationService implements OnModuleInit, OnModuleDestroy {
  private readonly handlers = new Set<CacheInvalidationHandler>();
  private subscribed = false;

  constructor(
    @Inject(VALKEY_OPTIONS) private readonly options: ValkeyModuleOptions,
    @Optional() @Inject(VALKEY_PUB) private readonly publisher?: ValkeyClientType | null,
    @Optional() @Inject(VALKEY_SUB) private readonly subscriber?: ValkeyClientType | null,
    @Optional() private readonly logger?: OmnixysLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.invalidation?.enabled || !this.subscriber) return;

    await this.subscriber.subscribe(this.channel, async (raw) => {
      try {
        const event = JSON.parse(raw) as CacheInvalidationEvent;
        for (const handler of this.handlers) await handler(event);
      } catch (error) {
        this.logger
          ?.child(CacheInvalidationService.name)
          .error('Cache invalidation event rejected', { error });
      }
    });
    this.subscribed = true;
  }

  onInvalidation(handler: CacheInvalidationHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async publish(key: string, operation: CacheInvalidationOperation): Promise<void> {
    if (!this.options.invalidation?.enabled || !this.publisher) return;
    const context = ContextAccessor.get();
    const event: CacheInvalidationEvent = {
      key,
      operation,
      source: this.options.serviceName,
      occurredAtEpochMs: Date.now(),
      requestId: context?.requestId ?? 'unscoped',
      correlationId: context?.correlationId ?? context?.requestId ?? 'unscoped',
    };

    await this.publisher.publish(this.channel, JSON.stringify(event));
  }

  status(): 'disabled' | 'ready' | 'starting' {
    if (!this.options.invalidation?.enabled) return 'disabled';
    return this.subscribed ? 'ready' : 'starting';
  }

  async close(): Promise<void> {
    if (this.subscribed && this.subscriber?.isOpen) {
      await this.subscriber.unsubscribe(this.channel);
      this.subscribed = false;
    }
    this.handlers.clear();
  }

  onModuleDestroy(): Promise<void> {
    return this.close();
  }

  private get channel(): string {
    return this.options.invalidation?.channel ?? 'omnixys:cache:invalidate';
  }
}
