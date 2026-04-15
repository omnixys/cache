/**
 * @license GPL-3.0-or-later
 */

export interface CacheSerializer {
  serialize<T>(value: T): string;
  deserialize<T>(value: string): T;
}

export class JsonCacheSerializer implements CacheSerializer {
  serialize<T>(value: T): string {
    return JSON.stringify(value);
  }

  deserialize<T>(value: string): T {
    if (!value) return null as T;

    try {
      return JSON.parse(value) as T;
    } catch {
      return null as T;
    }
  }
}
