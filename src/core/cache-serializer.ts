/**
 * @license GPL-3.0-or-later
 */

export interface CacheSerializer {
  serialize<T>(value: T): string;
  deserialize<T>(value: string): T;
}

export type CacheJsonParseResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: SyntaxError };

export class CacheJsonParseError extends SyntaxError {
  readonly code = 'CACHE_JSON_INVALID';

  constructor(options?: ErrorOptions) {
    super('Cached value is not valid JSON', options);
    this.name = CacheJsonParseError.name;
  }
}

export function parseCacheJson<T>(value: string): CacheJsonParseResult<T> {
  try {
    return { success: true, value: JSON.parse(value) as T };
  } catch (cause) {
    return {
      success: false,
      error: new CacheJsonParseError({ cause }),
    };
  }
}

export class JsonCacheSerializer implements CacheSerializer {
  serialize<T>(value: T): string {
    return JSON.stringify(value);
  }

  deserialize<T>(value: string): T {
    if (!value) return null as T;
    const result = parseCacheJson<T>(value);
    return result.success ? result.value : (null as T);
  }
}

/** Opt-in strict parser for services that must distinguish corruption from misses. */
export class StrictJsonCacheSerializer implements CacheSerializer {
  serialize<T>(value: T): string {
    return JSON.stringify(value);
  }

  deserialize<T>(value: string): T {
    const result = parseCacheJson<T>(value);
    if (!result.success) throw result.error;
    return result.value;
  }
}
