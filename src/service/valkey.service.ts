import { CACHE_SERIALIZER, VALKEY_CLIENT, VALKEY_OPTIONS } from '../core/cache-constants.js';
import type { ValkeyModuleOptions } from '../core/cache-options.js';
import type { CacheSerializer } from '../core/cache-serializer.js';
import type { ValkeyKeyDefinition, ValkeyKeyValue } from '../keys/valkey.keys.js';
import { CacheInvalidationService } from './cache-invalidation.service.js';
import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ContextAccessor } from '@omnixys/context';
import { OmnixysLogger } from '@omnixys/logger';
import { CacheMetricsService, CacheObservabilityService } from '@omnixys/observability';
import type { ValkeyClientType } from '@valkey/client';
import { randomUUID } from 'node:crypto';

export type CacheConnectionStatus = 'closing' | 'offline' | 'ready' | 'unavailable';

export interface CacheHealth {
  readonly healthy: boolean;
  readonly status: CacheConnectionStatus;
  readonly latencyMs?: number;
  readonly error?: string;
}

export interface CacheDiagnostics {
  readonly status: CacheConnectionStatus;
  readonly activeOperations: number;
  readonly closing: boolean;
  readonly metrics: ReturnType<CacheMetricsService['snapshot']>;
}

export class CacheValidationError extends Error {
  readonly code = 'CACHE_VALUE_INVALID';
  readonly requestId: string;
  readonly correlationId: string;
  readonly traceId?: string;
  readonly actorId?: string;
  readonly tenantId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;

  constructor(
    readonly key: string,
    options?: ErrorOptions,
  ) {
    super(`Cached value failed validation for key "${key}"`, options);
    this.name = CacheValidationError.name;
    const context = ContextAccessor.get();
    this.requestId = context?.requestId ?? 'unscoped';
    this.correlationId = context?.correlationId ?? context?.requestId ?? 'unscoped';
    this.traceId = context?.trace?.traceId;
    this.actorId = context?.principal?.actorId;
    this.tenantId = context?.tenant?.tenantId ?? context?.principal?.tenantId;
    this.metadata = { key };
  }
}

@Injectable()
export class ValkeyService implements OnModuleDestroy {
  private activeOperations = 0;
  private closing = false;
  private readonly drainWaiters = new Set<() => void>();

  constructor(
    @Inject(VALKEY_CLIENT)
    public readonly client: ValkeyClientType,
    @Inject(VALKEY_OPTIONS)
    private readonly options: ValkeyModuleOptions,
    @Inject(CACHE_SERIALIZER)
    private readonly serializer: CacheSerializer,
    private readonly observability: CacheObservabilityService,
    private readonly metrics: CacheMetricsService,
    @Optional() private readonly invalidation?: CacheInvalidationService,
    @Optional() private readonly logger?: OmnixysLogger,
  ) {}

  /** Returns the fully namespaced key used by the backing store. */
  key(key: string): string {
    const prefix = this.options.keyPrefix ?? this.options.serviceName;
    return `${prefix}:${key}`;
  }

  async get<K extends ValkeyKeyDefinition<any>>(keyDef: K, token: string): Promise<string | null> {
    return this.read<string>(keyDef, token, false);
  }

  /** Typed, schema-validated cache read. Zod schemas work without an adapter. */
  async getValue<K extends ValkeyKeyDefinition<any>>(
    keyDef: K,
    token: string,
  ): Promise<ValkeyKeyValue<K> | null> {
    return this.read<ValkeyKeyValue<K>>(keyDef, token, true);
  }

  async getJson<K extends ValkeyKeyDefinition<any>, T>(
    keyDef: K,
    token: string,
  ): Promise<T | null> {
    return this.read<T>(keyDef, token, true);
  }

  async set<K extends ValkeyKeyDefinition<any>, T>(
    keyDef: K,
    value: T,
    ttlSeconds?: number,
  ): Promise<string> {
    return this.write(keyDef, value, ttlSeconds);
  }

  /** Typed write using the key's schema and default TTL policy. */
  async setValue<K extends ValkeyKeyDefinition<any>>(
    keyDef: K,
    value: ValkeyKeyValue<K>,
    ttlSeconds?: number,
  ): Promise<string> {
    return this.write(keyDef, value, ttlSeconds, true);
  }

  async setJson<K extends ValkeyKeyDefinition<any>, T>(
    keyDef: K,
    value: T,
    ttlSeconds?: number,
  ): Promise<string> {
    return this.write(keyDef, value, ttlSeconds, true);
  }

  async delete<K extends ValkeyKeyDefinition<any>>(keyDef: K, token: string): Promise<number> {
    const namespacedKey = keyDef.key(token);

    return this.withOperation(async () =>
      this.observability.trace('delete', namespacedKey, async () => {
        const deleted = await this.client.del(namespacedKey);
        if (deleted > 0) await this.invalidation?.publish(namespacedKey, 'delete');
        return deleted;
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    const namespacedKey = this.key(key);
    return this.withOperation(async () =>
      this.observability.trace(
        'exists',
        namespacedKey,
        async () => (await this.client.exists(namespacedKey)) > 0,
      ),
    );
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    assertTtl(ttlSeconds);
    const namespacedKey = this.key(key);
    return this.withOperation(async () =>
      this.observability.trace('expire', namespacedKey, async (span) => {
        span?.setAttribute('cache.ttl_seconds', ttlSeconds);
        return this.client.expire(namespacedKey, ttlSeconds);
      }),
    );
  }

  async ttl(key: string): Promise<number> {
    const namespacedKey = this.key(key);
    return this.withOperation(async () =>
      this.observability.trace('ttl', namespacedKey, async () =>
        this.client.ttl(namespacedKey),
      ),
    );
  }

  async increment(key: string): Promise<number> {
    const namespacedKey = this.key(key);
    return this.withOperation(async () =>
      this.observability.trace('increment', namespacedKey, async () =>
        this.client.incr(namespacedKey),
      ),
    );
  }

  async rawGet(key: string): Promise<string | null> {
    return this.withOperation(() => this.client.get(this.key(key)));
  }

  async rawSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) assertTtl(ttlSeconds);
    const namespacedKey = this.key(key);
    await this.withOperation(async () => {
      if (ttlSeconds !== undefined) {
        await this.client.set(namespacedKey, value, { EX: ttlSeconds });
      } else {
        await this.client.set(namespacedKey, value);
      }
    });
  }

  /**
   * Atomically stores a raw value only when the namespaced key does not exist.
   * Useful for replay guards, idempotency keys, and other first-writer-wins flows.
   */
  async rawSetIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    assertTtl(ttlSeconds);
    const namespacedKey = this.key(key);
    return this.withOperation(() =>
      this.observability.trace('set_if_absent', namespacedKey, async (span) => {
        span?.setAttribute('cache.ttl_seconds', ttlSeconds);
        const result = await this.client.set(namespacedKey, value, {
          EX: ttlSeconds,
          NX: true,
        });
        const stored = result === 'OK';
        span?.setAttribute('cache.stored', stored);
        if (stored) {
          this.metrics.write();
          await this.invalidation?.publish(namespacedKey, 'set');
        }
        return stored;
      }),
    );
  }

  status(): CacheConnectionStatus {
    if (this.closing) return 'closing';
    if (!this.client?.isOpen) return 'offline';
    return this.client.isReady ? 'ready' : 'unavailable';
  }

  diagnostics(): CacheDiagnostics {
    return {
      status: this.status(),
      activeOperations: this.activeOperations,
      closing: this.closing,
      metrics: this.metrics.snapshot(),
    };
  }

  async health(): Promise<CacheHealth> {
    const startedAt = Date.now();
    try {
      if (!this.client?.isOpen) return { healthy: false, status: this.status() };
      await this.client.ping();
      return {
        healthy: true,
        status: this.status(),
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'unavailable',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async drain(timeoutMs = 5_000): Promise<void> {
    if (this.activeOperations === 0) return;
    await new Promise<void>((resolve, reject) => {
      const waiter = () => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        this.drainWaiters.delete(waiter);
        reject(new Error(`Cache drain timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timeout.unref?.();
      this.drainWaiters.add(waiter);
    });
  }

  async close(): Promise<void> {
    if (this.closing || !this.client?.isOpen) return;
    this.closing = true;
    try {
      await this.drain();
      await this.client.quit();
      this.logger?.child(ValkeyService.name).info('Cache connection closed');
    } finally {
      this.closing = false;
    }
  }

  onModuleDestroy(): Promise<void> {
    return this.close();
  }

  private async read<T>(
    keyDef: ValkeyKeyDefinition<any>,
    token: string,
    validate: boolean,
  ): Promise<T | null> {
    const namespacedKey = keyDef.key(token);
    return this.withOperation(async () =>
      this.observability.trace('get', namespacedKey, async (span) => {
        const value = await this.client.get(namespacedKey);
        if (value === null) {
          this.metrics.miss();
          span?.setAttribute('cache.hit', false);
          return null;
        }

        this.metrics.hit();
        span?.setAttribute('cache.hit', true);
        const parsed = this.serializer.deserialize<unknown>(value);
        if (!validate || !keyDef.schema) return parsed as T;

        try {
          return keyDef.schema.parse(parsed) as T;
        } catch (cause) {
          this.metrics.error();
          throw new CacheValidationError(namespacedKey, { cause });
        }
      }),
    );
  }

  private async write(
    keyDef: ValkeyKeyDefinition<any>,
    value: unknown,
    ttlOverride?: number,
    validate = false,
  ): Promise<string> {
    const token = randomUUID();
    const namespacedKey = keyDef.key(token);
    const ttlSeconds = ttlOverride ?? keyDef.ttlSeconds ?? keyDef.ttl;
    if (ttlSeconds !== undefined) assertTtl(ttlSeconds);

    let validated = value;
    if (validate && keyDef.schema) {
      try {
        validated = keyDef.schema.parse(value);
      } catch (cause) {
        throw new CacheValidationError(namespacedKey, { cause });
      }
    }

    await this.withOperation(async () =>
      this.observability.trace('set', namespacedKey, async (span) => {
        const payload = this.serializer.serialize(validated);
        if (ttlSeconds !== undefined) {
          await this.client.set(namespacedKey, payload, { EX: ttlSeconds });
          span?.setAttribute('cache.ttl_seconds', ttlSeconds);
        } else {
          await this.client.set(namespacedKey, payload);
        }
        await this.invalidation?.publish(namespacedKey, 'set');
      }),
    );
    return token;
  }

  private async withOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing) throw new Error('Cache connection is closing');
    this.activeOperations += 1;
    try {
      return await operation();
    } catch (error) {
      this.logger?.child(ValkeyService.name).error('Cache operation failed', {
        error,
      });
      throw error;
    } finally {
      this.activeOperations -= 1;
      if (this.activeOperations === 0) {
        for (const waiter of this.drainWaiters) waiter();
        this.drainWaiters.clear();
      }
    }
  }
}

function assertTtl(ttlSeconds: number): void {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError('Cache TTL must be a positive finite number');
  }
}
