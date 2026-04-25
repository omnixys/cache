# 🧾 Changelog

All notable changes in this project will be documented in this file.


## [2.0.0](https://github.com/omnixys/cache/compare/v1.0.0...v2.0.0) (2026-04-25)

### Delay-job

* **Delay-job:** redesign delayed job system using stream-based ([](https://github.com/omnixys/cache/commit/5c086ce43e8eb1cd9db28cff002b01b66d32d626))

## 1.0.0 (2026-04-25)

### ⚠ BREAKING CHANGE

* **Delay-job:** The delayed job system has been completely reworked.

- Removed ZSET-based scheduling and polling scheduler
- Removed requeue-based delay handling (no more enqueue loops)
- Removed lock-based execution (ValkeyLockService no longer used)
- Delay handling is now performed inside the worker via in-process waiting
- Stream (XREADGROUP) is now the single source of truth for job execution

Key changes:
- DelayedJobService now pushes jobs directly to Valkey Streams
- DelayedJobWorker no longer requeues jobs for delay handling
- Job execution timing is handled via `executeAt` + in-worker delay
- Simplified architecture: no scheduler, no ZSET, no dual-system conflicts
- Registry-based handler execution remains, but is now the only dispatch mechanism

Implications:
- Previous delayed jobs stored in ZSET are no longer processed
- Any custom logic relying on requeue behavior must be migrated
- Lock-based guarantees have been removed (replaced by consumer group semantics)
- Worker behavior is now time-dependent (sleep) instead of Redis-driven scheduling

Migration guide:
- Remove any usage of scheduler components
- Remove lock service dependencies for delayed jobs
- Ensure workers run as separate processes
- Verify all jobs include `executeAt` timestamp
- Validate handler idempotency (no lock protection anymore)

Performance:
- Eliminates Redis storm caused by requeue loops
- Reduces CPU usage and network overhead
- Provides deterministic execution flow
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

* **Cache:** unified caching layer, decorators & distributed Valkey support ([](https://github.com/omnixys/cache/commit/c98e65d900613a56c19cfdec27c54e4c7ac7b431))
* **Cache:** unified caching layer, decorators & distributed Valkey support ([](https://github.com/omnixys/cache/commit/88116d230fc86569b84353ef27df10778d931fe0))

### Delay-job

* **Delay-job:** redesign delayed job ([](https://github.com/omnixys/cache/commit/9d2bd5d081ddea6536427578cca92f9f55e6f43b))
* **Delay-job:** redesign delayed job ([](https://github.com/omnixys/cache/commit/44eb79f2c9b800cb86f7c1c0972a5ecafc3926bb))
* **Delay-job:** redesign delayed job s ([](https://github.com/omnixys/cache/commit/674368c5df5bb4988c64666dedc0f6f27a7d4e36))
* **Delay-job:** redesign delayed job system using stream-based ([](https://github.com/omnixys/cache/commit/75cf94e784961f88042c489be8e0b6bccf8af9fa))
* **Delay-job:** redesign delayed job system using stream-based ([](https://github.com/omnixys/cache/commit/8ecd5a5bdb5b4053122ae44d03c9b52c387e444a))
* **Delay-job:** redesign delayed job system using stream-based execution ([](https://github.com/omnixys/cache/commit/eb15034a624838aa5bce1fa8b438028275aa118a))

### Other

* **Other:** l ([](https://github.com/omnixys/cache/commit/888a95dffb203a4a3401adbd9320ca8aeb8b6d34))

### Readme

* **Readme:** update ([](https://github.com/omnixys/cache/commit/f4876cc185b3c8af58dfdbbba3d4100290ace208))
* **Readme:** update ([](https://github.com/omnixys/cache/commit/0cbe5a4d96563d24ecc49a30dbc97beca38a95c3))

### Release

* **Release:** 1.0.0 [skip ci] ([](https://github.com/omnixys/cache/commit/1a1cb6f69251e571b3d216445daee59a942bb17e))
* **Release:** 1.0.0 [skip ci] ([](https://github.com/omnixys/cache/commit/f58e5c7725fe82c3bd794e7a7709e000bbd87e69))

### U

* **U:** d ([](https://github.com/omnixys/cache/commit/58261584016d42c279ff85a63c9b57b1675d5da4))
* **U:** u ([](https://github.com/omnixys/cache/commit/f89cd535b8244a96973c601ff6cd81de475114e8))
* **U:** u ([](https://github.com/omnixys/cache/commit/35564bd42302dc127b37d574ffdc0acf0e73c866))

### Update

* **Update:** update ([](https://github.com/omnixys/cache/commit/17f0f0015cdecf6401794f87b8467f799662e273))

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

* **Cache:** unified caching layer, decorators & distributed Valkey support ([](https://github.com/omnixys/cache/commit/c98e65d900613a56c19cfdec27c54e4c7ac7b431))
* **Cache:** unified caching layer, decorators & distributed Valkey support ([](https://github.com/omnixys/cache/commit/88116d230fc86569b84353ef27df10778d931fe0))

### Release

* **Release:** 1.0.0 [skip ci] ([](https://github.com/omnixys/cache/commit/f58e5c7725fe82c3bd794e7a7709e000bbd87e69))

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
