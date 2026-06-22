import {
  CacheInvalidationService,
  CacheValidationError,
  DelayedJobService,
  DelayedJobWorker,
  JsonCacheSerializer,
  StrictJsonCacheSerializer,
  ValkeyModule,
  ValkeyService,
  createKey,
} from '../dist/index.js';
import { ContextAccessor } from '@omnixys/context';
import assert from 'node:assert/strict';
import test from 'node:test';

test('typed keys apply TTL policy, validate values, and publish invalidation', async () => {
  const client = createClient();
  const invalidations = [];
  const service = createService(client, {
    async publish(key, operation) {
      invalidations.push({ key, operation });
    },
  });
  const key = createKey('typed', {
    ttlSeconds: 60,
    schema: {
      parse(value) {
        if (!value || typeof value.id !== 'string') throw new Error('invalid');
        return value;
      },
    },
  });

  const token = await service.setValue(key, { id: 'value-1' });
  const storedKey = key.key(token);

  assert.equal(client.values.get(storedKey), JSON.stringify({ id: 'value-1' }));
  assert.equal(client.ttls.get(storedKey), 60);
  assert.deepEqual(await service.getValue(key, token), { id: 'value-1' });
  assert.deepEqual(invalidations, [{ key: storedKey, operation: 'set' }]);
});

test('strict JSON parsing distinguishes corrupt cache data from a miss', () => {
  const serializer = new StrictJsonCacheSerializer();
  assert.deepEqual(serializer.deserialize('{"valid":true}'), { valid: true });
  assert.throws(
    () => serializer.deserialize('{invalid'),
    (error) => {
      assert.equal(error.code, 'CACHE_JSON_INVALID');
      return true;
    },
  );
});

test('cache validation failures include canonical diagnostic identifiers', async () => {
  const client = createClient();
  const service = createService(client);
  const key = createKey('validated', {
    schema: {
      parse() {
        throw new Error('schema rejected');
      },
    },
  });
  client.values.set(key.key('token'), JSON.stringify({ invalid: true }));

  await ContextAccessor.run(
    {
      requestId: 'request-1',
      correlationId: 'correlation-1',
      actorId: 'actor-1',
      tenantId: 'tenant-1',
      traceId: 'trace-1',
    },
    async () => {
      await assert.rejects(service.getValue(key, 'token'), (error) => {
        assert.ok(error instanceof CacheValidationError);
        assert.equal(error.code, 'CACHE_VALUE_INVALID');
        assert.equal(error.requestId, 'request-1');
        assert.equal(error.correlationId, 'correlation-1');
        assert.equal(error.actorId, 'actor-1');
        assert.equal(error.tenantId, 'tenant-1');
        assert.equal(error.traceId, 'trace-1');
        return true;
      });
    },
  );
});

test('cache lifecycle reports health, drains operations, and closes idempotently', async () => {
  const client = createClient();
  const service = createService(client);

  assert.equal(service.status(), 'ready');
  assert.equal((await service.health()).healthy, true);
  assert.equal(service.diagnostics().activeOperations, 0);

  await service.drain();
  await service.close();
  await service.close();
  assert.equal(client.quitCalls, 1);
  assert.equal(service.status(), 'offline');
});

test('cache drain waits for active writes before resolving', async () => {
  const client = createClient();
  let release;
  client.set = async (key, value) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    client.values.set(key, value);
    return 'OK';
  };
  const service = createService(client);
  const operation = service.rawSet('pending', 'value');
  await new Promise((resolve) => setImmediate(resolve));

  let drained = false;
  const draining = service.drain().then(() => {
    drained = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(drained, false);
  release();
  await operation;
  await draining;
  assert.equal(drained, true);
});

test('atomic set-if-absent permits only the first replay guard', async () => {
  const client = createClient();
  const service = createService(client);

  assert.equal(
    await service.rawSetIfAbsent('replay:ticket-1:2', '1', 120),
    true,
  );
  assert.equal(
    await service.rawSetIfAbsent('replay:ticket-1:2', '1', 120),
    false,
  );
  assert.equal(client.values.get('test:replay:ticket-1:2'), '1');
  assert.equal(client.ttls.get('test:replay:ticket-1:2'), 120);
});

test('distributed invalidation propagates canonical request identifiers', async () => {
  const published = [];
  let receive;
  const publisher = {
    async publish(channel, payload) {
      published.push({ channel, payload });
    },
  };
  const subscriber = {
    isOpen: true,
    async subscribe(_channel, callback) {
      receive = callback;
    },
    async unsubscribe() {},
  };
  const service = new CacheInvalidationService(
    { serviceName: 'users', invalidation: { enabled: true } },
    publisher,
    subscriber,
  );
  const received = [];
  service.onInvalidation((event) => received.push(event));
  await service.onModuleInit();

  await ContextAccessor.run(
    { requestId: 'request-2', correlationId: 'correlation-2' },
    () => service.publish('users:key', 'delete'),
  );
  const event = JSON.parse(published[0].payload);
  assert.equal(event.requestId, 'request-2');
  assert.equal(event.correlationId, 'correlation-2');
  assert.equal(event.source, 'users');

  await receive(published[0].payload);
  assert.equal(received[0].key, 'users:key');
  await service.close();
  assert.equal(service.status(), 'starting');
});

test('delayed jobs support status, cancellation, claiming, retry, and completion', async () => {
  const valkey = createDelayedValkey();
  const service = new DelayedJobService(
    {
      async enqueue() {
        throw new Error('stream fallback was not expected');
      },
    },
    valkey,
  );
  const id = await service.schedule({
    type: 'user.delete',
    payload: { userId: 'user-1' },
    delayMs: 0,
    maxRetries: 1,
    retryDelayMs: 1,
  });

  assert.equal((await service.status(id)).status, 'scheduled');
  const claimed = await service.claimDue();
  assert.equal(claimed.length, 1);
  assert.equal((await service.status(id)).status, 'running');

  await service.fail(claimed[0], new Error('first failure'));
  assert.equal((await service.status(id)).status, 'scheduled');
  await new Promise((resolve) => setTimeout(resolve, 3));
  const retry = await service.claimDue();
  await service.complete(retry[0]);
  assert.equal((await service.status(id)).status, 'completed');

  const canceledId = await service.schedule({
    type: 'ticket.revoke',
    payload: { ticketId: 'ticket-1' },
    delayMs: 60_000,
  });
  assert.equal(await service.cancel(canceledId), true);
  assert.equal((await service.status(canceledId)).status, 'canceled');
  assert.equal(await service.retry(canceledId), true);
  assert.equal((await service.status(canceledId)).status, 'scheduled');
});

test('concurrent delayed-job claims execute a job at most once', async () => {
  const valkey = createDelayedValkey();
  const service = new DelayedJobService({ async enqueue() {} }, valkey);
  await service.schedule({
    type: 'user.cleanup',
    payload: { userId: 'user-1' },
    delayMs: 0,
  });

  const claims = await Promise.all([service.claimDue(), service.claimDue()]);
  assert.equal(claims[0].length + claims[1].length, 1);
});

test('delayed worker exposes deterministic lifecycle APIs', async () => {
  const jobs = {
    async claimDue() {
      return [];
    },
  };
  const worker = new DelayedJobWorker({}, {}, jobs);

  await worker.start();
  assert.equal(worker.ready(), true);
  assert.equal(worker.health().healthy, true);
  assert.equal(worker.status(), 'idle');
  await worker.close();
  assert.equal(worker.ready(), false);
  assert.equal(worker.status(), 'stopped');
});

test('module registers the delayed worker only when explicitly enabled', () => {
  const disabled = ValkeyModule.forRoot({ serviceName: 'test' });
  const enabled = ValkeyModule.forRoot({ serviceName: 'test', worker: true });

  assert.equal(disabled.providers.includes(DelayedJobWorker), false);
  assert.equal(enabled.providers.includes(DelayedJobWorker), true);
});

test('compatibility subpaths are emitted and operational', async () => {
  const producer = await import('../dist/producer/index.js');
  const consumer = await import('../dist/consumer/index.js');
  const decorators = await import('../dist/decorators/index.js');
  const types = await import('../dist/types/index.js');

  assert.equal(producer.DelayedJobService, DelayedJobService);
  assert.equal(consumer.DelayedJobWorker, DelayedJobWorker);
  assert.equal(typeof decorators.DelayedJob, 'function');
  assert.deepEqual(Object.keys(types), []);
});

function createService(client, invalidation) {
  const metrics = {
    hit() {},
    miss() {},
    write() {},
    delete() {},
    error() {},
    snapshot() {
      return {
        hits: 0,
        misses: 0,
        writes: 0,
        deletes: 0,
        errors: 0,
        hitRate: 0,
      };
    },
  };
  const observability = {
    async trace(_operation, _key, callback) {
      return callback({ setAttribute() {} });
    },
  };
  return new ValkeyService(
    client,
    { serviceName: 'test' },
    new JsonCacheSerializer(),
    observability,
    metrics,
    invalidation,
  );
}

function createClient() {
  const values = new Map();
  const ttls = new Map();
  return {
    values,
    ttls,
    isOpen: true,
    isReady: true,
    quitCalls: 0,
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value, options) {
      if (options?.NX && values.has(key)) return null;
      values.set(key, value);
      if (options?.EX) ttls.set(key, options.EX);
      return 'OK';
    },
    async del(key) {
      return values.delete(key) ? 1 : 0;
    },
    async exists(key) {
      return values.has(key) ? 1 : 0;
    },
    async expire(key, ttl) {
      ttls.set(key, ttl);
      return values.has(key);
    },
    async incr(key) {
      const value = Number(values.get(key) ?? 0) + 1;
      values.set(key, String(value));
      return value;
    },
    async ping() {
      return 'PONG';
    },
    async quit() {
      this.quitCalls += 1;
      this.isOpen = false;
      this.isReady = false;
    },
  };
}

function createDelayedValkey() {
  const records = new Map();
  const queues = new Map();
  return {
    key(key) {
      return `test:${key}`;
    },
    async rawSet(key, value) {
      records.set(key, value);
    },
    async rawGet(key) {
      return records.get(key) ?? null;
    },
    client: {
      async zAdd(key, entry) {
        const queue = queues.get(key) ?? new Map();
        queue.set(entry.value, entry.score);
        queues.set(key, queue);
      },
      async zRem(key, id) {
        return queues.get(key)?.delete(id) ? 1 : 0;
      },
      async eval(_script, { keys, arguments: args }) {
        const queue = queues.get(keys[0]) ?? new Map();
        const due = [...queue.entries()]
          .filter(([, score]) => score <= Number(args[0]))
          .slice(0, Number(args[1]))
          .map(([id]) => id);
        for (const id of due) queue.delete(id);
        return due;
      },
    },
  };
}
