import { CACHE_SERIALIZER, VALKEY_CLIENT, VALKEY_OPTIONS } from '../core/cache-constants.js';
import type { ValkeyModuleOptions } from '../core/cache-options.js';
import type { CacheSerializer } from '../core/cache-serializer.js';
import { ValkeyKeyDefinition } from '../keys/valkey.keys.js';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { CacheMetricsService, CacheObservabilityService } from '@omnixys/observability';
import type { ValkeyClientType } from '@valkey/client';

@Injectable()
export class ValkeyService implements OnModuleDestroy {
  constructor(
    @Inject(VALKEY_CLIENT)
    public readonly client: ValkeyClientType,
    @Inject(VALKEY_OPTIONS)
    private readonly options: ValkeyModuleOptions,
    @Inject(CACHE_SERIALIZER)
    private readonly serializer: CacheSerializer,
    private readonly observability: CacheObservabilityService,
    private readonly metrics: CacheMetricsService,
  ) {}

  private buildKey(key: string): string {
    const prefix = this.options.keyPrefix ?? this.options.serviceName;
    return `${prefix}:${key}`;
  }

  //depricated
  //input = await this.cache.getJson<CreatePendingUserDTO>(ValkeyKey.pendingContact, token);
  async get<K extends ValkeyKeyDefinition>(keyDef: K, token: string): Promise<string | null> {
    // const namespacedKey = this.buildKey(key);
    const namespacedKey = keyDef.key(token) as `${K['prefix']}:${string}`;

    return this.observability.trace('get', namespacedKey, async (span) => {
      const value = await this.client.get(namespacedKey);

      if (value === null) {
        this.metrics.miss();
        span?.setAttribute('cache.hit', false);
        return null;
      }

      this.metrics.hit();
      span?.setAttribute('cache.hit', true);
      return this.serializer.deserialize<string>(value);
    });
  }

  //   async get<K extends ValkeyKeyDefinition<any>>(
  //   keyDef: K,
  //   token: string,
  // ): Promise<K extends ValkeyKeyDefinition<infer T> ? T | null : never> {
  //   const key = keyDef.key(token);

  //   const value = await this.client.get(key);
  //   if (!value) return null;

  //   return this.serializer.deserialize(value);
  // }

  async getJson<K extends ValkeyKeyDefinition, T>(keyDef: K, token: string): Promise<T | null> {
    const namespacedKey = keyDef.key(token) as `${K['prefix']}:${string}`;

    return this.observability.trace('get', namespacedKey, async (span) => {
      const value = await this.client.get(namespacedKey);

      if (value === null) {
        this.metrics.miss();
        span?.setAttribute('cache.hit', false);
        return null;
      }

      this.metrics.hit();
      span?.setAttribute('cache.hit', true);

      return this.serializer.deserialize<T>(value);
    });
  }

  async set<K extends ValkeyKeyDefinition, T>(
    keyDef: K,
    value: T,
    ttlSeconds?: number,
  ): Promise<string> {
    const token = crypto.randomUUID();

    const namespacedKey = keyDef.key(token) as `${K['prefix']}:${string}`;

    await this.observability.trace('set', namespacedKey, async (span) => {
      const payload = this.serializer.serialize(value);

      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(namespacedKey, payload, { EX: ttlSeconds });
      } else {
        await this.client.set(namespacedKey, payload);
      }

      if (ttlSeconds) {
        span?.setAttribute('cache.ttl_seconds', ttlSeconds);
      }
    });

    return token;
  }

  // token = await cache.set(ValkeyKey.pendingContact, dto);
  // // dto ist typed ✅
  // // ttl automatisch gesetzt ✅

  // data = await cache.get(ValkeyKey.pendingContact, token);
  // data ist CreatePendingUserDTO ✅
  // async set<K extends ValkeyKeyDefinition<any>>(
  //   keyDef: K,
  //   value: K extends ValkeyKeyDefinition<infer T> ? T : never,
  //   ttlOverride?: number,
  // ): Promise<string> {
  //   const token = crypto.randomUUID();
  //   const key = keyDef.key(token);

  //   const ttl = ttlOverride ?? keyDef.ttl;

  //   const payload = this.serializer.serialize(value);

  //   if (ttl) {
  //     await this.client.set(key, payload, { EX: ttl });
  //   } else {
  //     await this.client.set(key, payload);
  //   }

  //   return token;
  // }

  async setJson<K extends ValkeyKeyDefinition, T>(
    keyDef: K,
    value: T,
    ttlSeconds?: number,
  ): Promise<string> {
    const token = crypto.randomUUID();

    const namespacedKey = keyDef.key(token) as `${K['prefix']}:${string}`;

    await this.observability.trace('set', namespacedKey, async (span: any) => {
      const payload = this.serializer.serialize(value);

      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(namespacedKey, payload, { EX: ttlSeconds });
      } else {
        await this.client.set(namespacedKey, payload);
      }

      span?.setAttribute('cache.ttl_seconds', ttlSeconds ?? 0);
    });

    return token;
  }

  async delete<K extends ValkeyKeyDefinition>(keyDef: K, token: string): Promise<number> {
    // const namespacedKey = this.buildKey(key);
    const namespacedKey = keyDef.key(token) as `${K['prefix']}:${string}`;

    return this.observability.trace('delete', namespacedKey, async () => {
      return this.client.del(namespacedKey);
    });
  }

  async exists(key: string): Promise<boolean> {
    const namespacedKey = this.buildKey(key);

    return this.observability.trace('exists', namespacedKey, async () => {
      const count = await this.client.exists(namespacedKey);
      return count > 0;
    });
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const namespacedKey = this.buildKey(key);

    return this.observability.trace('expire', namespacedKey, async (span) => {
      span?.setAttribute('cache.ttl_seconds', ttlSeconds);
      return this.client.expire(namespacedKey, ttlSeconds);
    });
  }

  async increment(key: string): Promise<number> {
    const namespacedKey = this.buildKey(key);

    return this.observability.trace('increment', namespacedKey, async () => {
      return this.client.incr(namespacedKey);
    });
  }

  async rawGet(key: string): Promise<string | null> {
    return this.client.get(this.buildKey(key));
  }

  async rawSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const namespacedKey = this.buildKey(key);

    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(namespacedKey, value, { EX: ttlSeconds });
      return;
    }

    await this.client.set(namespacedKey, value);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }
}
