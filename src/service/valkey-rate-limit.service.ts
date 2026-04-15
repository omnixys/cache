import { ValkeyService } from './valkey.service.js';
import { Injectable } from '@nestjs/common';
import { CacheObservabilityService } from '@omnixys/observability';

@Injectable()
export class ValkeyRateLimitService {
  constructor(
    private readonly valkey: ValkeyService,
    private readonly observability: CacheObservabilityService,
  ) {}

  async hit(key: string, limit: number, ttlSeconds: number): Promise<boolean> {
    return this.observability.trace('rate_limit.hit', key, async (span) => {
      const current = await this.valkey.increment(key);

      if (current === 1) {
        await this.valkey.expire(key, ttlSeconds);
      }

      const allowed = current <= limit;

      span?.setAttribute('rate_limit.key', key);
      span?.setAttribute('rate_limit.limit', limit);
      span?.setAttribute('rate_limit.ttl_seconds', ttlSeconds);
      span?.setAttribute('rate_limit.current', current);
      span?.setAttribute('rate_limit.allowed', allowed);

      return allowed;
    });
  }
}
