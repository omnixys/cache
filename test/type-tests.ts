import { createKey, type ValkeyService } from '../src/index.js';

interface TypedValue {
  id: string;
  enabled: boolean;
}

declare const cache: ValkeyService;
const key = createKey<TypedValue>('typed', { ttlSeconds: 60 });

const token: Promise<string> = cache.setValue(key, {
  id: 'value-1',
  enabled: true,
});
void token;

const value: Promise<TypedValue | null> = cache.getValue(key, 'token');
void value;

// @ts-expect-error enabled is required by the typed key contract
void cache.setValue(key, { id: 'invalid' });
