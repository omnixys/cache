# 🧾 Changelog

All notable changes in this project will be documented in this file.


## 1.0.0 (2026-04-15)

### ⚠ BREAKING CHANGE

* **Cache:** Complete redesign of caching layer with unified APIs, decorator-based caching,
and first-class support for distributed cache backends (Valkey/Redis).
Legacy cache helpers and inconsistent patterns have been removed.

✨ Features:
- Unified cache abstraction layer for NestJS applications
- First-class Valkey (Redis-compatible) integration
- Decorator-based caching:
  - @Cacheable() for method result caching
  - @CacheEvict() for invalidation
  - @CachePut() for write-through updates
- Typed cache APIs:
  - get<T>()
  - set<T>()
  - getJson<T>()
  - setJson<T>()
- Automatic serialization/deserialization with type safety
- TTL management:
  - Per-key TTL configuration
  - Centralized TTL policies
- Atomic operations:
  - increment / decrement
  - NX / EX support (e.g. replay protection, locks)
- Namespaced key management and key builders
- Built-in support for:
  - Rate limiting stores
  - Risk memory stores
  - Replay protection (idempotency keys)
- Pub/Sub and Streams support (Valkey-based)

⚙️ Improvements:
- Strongly typed cache access with generics
- Eliminated duplicated cache logic across services
- Improved performance via optimized serialization and batching
- Consistent key naming conventions across all modules
- Reduced boilerplate through decorators and helpers

🧱 Architecture:
- Modular NestJS dynamic module (CacheModule.forRoot / forRootAsync)
- Pluggable backend support (Valkey, Redis, in-memory fallback)
- Separation of concerns:
  - Cache API
  - Serialization layer
  - Key management
- Designed for distributed microservice environments

🛑 Removed / Changed:
- Removed ad-hoc cache usage and direct client access patterns
- Replaced manual JSON handling with typed helpers
- Deprecated inconsistent TTL and key naming strategies

📦 Compatibility:
- Requires Node.js >= 20
- Designed for NestJS-based microservices
- Fully compatible with:
  - @omnixys/security (rate limiting, risk memory)
  - @omnixys/kafka (event-driven cache invalidation)
  - @omnixys/observability (cache tracing)
  - @omnixys/context (request-aware caching)

📚 Notes:
This release establishes a unified, distributed caching foundation for Omnixys services,
enabling consistent data access patterns, performance optimization, and scalable
state management across microservices.

### Cache

* **Cache:** unified caching layer, decorators & distributed Valkey support ([](https://github.com/omnixys/cache/commit/88116d230fc86569b84353ef27df10778d931fe0))
