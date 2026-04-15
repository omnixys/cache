import { ValkeyService } from './valkey.service.js';
import { Injectable } from '@nestjs/common';
import { CacheObservabilityService } from '@omnixys/observability';
import { randomBytes } from 'node:crypto';

@Injectable()
export class ValkeyLockService {
  constructor(
    private readonly valkey: ValkeyService,
    private readonly observability: CacheObservabilityService,
  ) {}

  async acquireLock(key: string, ttlMs = 3000): Promise<string | null> {
    return this.observability.trace('lock.acquire', key, async (span) => {
      const token = randomBytes(16).toString('hex');
      const result = await this.valkey.client.set(key, token, {
        NX: true,
        PX: ttlMs,
      });

      span?.setAttribute('cache.lock.ttl_ms', ttlMs);
      span?.setAttribute('cache.lock.acquired', result === 'OK');

      return result === 'OK' ? token : null;
    });
  }

  async releaseLock(key: string, token: string): Promise<boolean> {
    return this.observability.trace('lock.release', key, async (span) => {
      const script = `         if redis.call("GET", KEYS[1]) == ARGV[1]
        then return redis.call("DEL", KEYS[1])
        else return 0
        end
      `;

      const result = await this.valkey.client.eval(script, {
        keys: [key],
        arguments: [token],
      });

      const released = result === 1;
      span?.setAttribute('cache.lock.released', released);
      return released;
    });
  }
}
