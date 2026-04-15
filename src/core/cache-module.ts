import { ValkeyLockService } from '../service/valkey-lock.service.js';
import { ValkeyPubSubService } from '../service/valkey-pubsub.service.js';
import { ValkeyRateLimitService } from '../service/valkey-rate-limit.service.js';
import { ValkeyStreamService } from '../service/valkey-stream.service.js';
import { ValkeyService } from '../service/valkey.service.js';
import {
  CACHE_SERIALIZER,
  VALKEY_CLIENT,
  VALKEY_OPTIONS,
  VALKEY_PUB,
  VALKEY_SUB,
} from './cache-constants.js';
import {
  type ValkeyModuleAsyncOptions,
  type ValkeyModuleOptions,
  type ValkeyModuleOptionsFactory,
} from './cache-options.js';
import { CacheSerializer, JsonCacheSerializer } from './cache-serializer.js';
import { DynamicModule, Global, Module, Provider, type Type } from '@nestjs/common';
import { CacheMetricsService, CacheObservabilityService, ObservabilityModule } from '@omnixys/observability';
import { createClient, type ValkeyClientType } from '@valkey/client';

function buildClientOptions(options: ValkeyModuleOptions) {
  if (options.url) {
    return {
      url: options.url,
      username: options.username,
      password: options.password,
      database: options.database,
    };
  }

  return {
    socket: {
      host: options.host ?? 'localhost',
      port: options.port ?? 6379,
      tls: options.tls ?? false,
    },
    username: options.username,
    password: options.password,
    database: options.database,
  };
}

async function createConnectedClient(
  options: ValkeyModuleOptions,
): Promise<ValkeyClientType> {
  const client = createClient(buildClientOptions(options));
  await client.connect();
  return client as ValkeyClientType;
}

function createSerializerProvider(): Provider<CacheSerializer> {
  return {
    provide: CACHE_SERIALIZER,
    useValue: new JsonCacheSerializer(),
  };
}

function createBaseProviders(): Provider[] {
  return [
    createSerializerProvider(),
    ValkeyService,
    ValkeyLockService,
    ValkeyRateLimitService,
    ValkeyStreamService,
    ValkeyPubSubService,
    CacheObservabilityService,
    CacheMetricsService,
  ];
}

function createSyncClientProviders(options: ValkeyModuleOptions): Provider[] {
  const providers: Provider[] = [
    {
      provide: VALKEY_OPTIONS,
      useValue: options,
    },
    {
      provide: VALKEY_CLIENT,
      useFactory: async () => createConnectedClient(options),
    },
  ];

  if (options.pubSub?.enabled) {
    providers.push(
      {
        provide: VALKEY_PUB,
        useFactory: async () => createConnectedClient(options),
      },
      {
        provide: VALKEY_SUB,
        useFactory: async () => createConnectedClient(options),
      },
    );
  }

  return providers;
}

function createAsyncOptionsProvider(
  options: ValkeyModuleAsyncOptions,
): Provider {
  if (options.useFactory) {
    return {
      provide: VALKEY_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject ?? [],
    };
  }

  const inject = [
    (options.useExisting ??
      options.useClass) as Type<ValkeyModuleOptionsFactory>,
  ];

  return {
    provide: VALKEY_OPTIONS,
    useFactory: async (factory: ValkeyModuleOptionsFactory) =>
      factory.createValkeyOptions(),
    inject,
  };
}

function createAsyncOptionsFactoryProviders(
  options: ValkeyModuleAsyncOptions,
): Provider[] {
  if (!options.useClass) {
    return [];
  }

  return [
    {
      provide: options.useClass,
      useClass: options.useClass,
    },
  ];
}

function createAsyncClientProviders(): Provider[] {
  return [
    {
      provide: VALKEY_CLIENT,
      useFactory: async (options: ValkeyModuleOptions) =>
        createConnectedClient(options),
      inject: [VALKEY_OPTIONS],
    },
    {
      provide: VALKEY_PUB,
      useFactory: async (options: ValkeyModuleOptions) => {
        if (!options.pubSub?.enabled) {
          return null;
        }

        return createConnectedClient(options);
      },
      inject: [VALKEY_OPTIONS],
    },
    {
      provide: VALKEY_SUB,
      useFactory: async (options: ValkeyModuleOptions) => {
        if (!options.pubSub?.enabled) {
          return null;
        }

        return createConnectedClient(options);
      },
      inject: [VALKEY_OPTIONS],
    },
  ];
}

@Global()
@Module({})
export class ValkeyModule {
  static forRoot(options: ValkeyModuleOptions): DynamicModule {
    const providers = [
      ...createSyncClientProviders(options),
      ...createBaseProviders(),
    ];

    return {
      module: ValkeyModule,
      imports: [ObservabilityModule],
      providers,
      exports: [
        VALKEY_OPTIONS,
        VALKEY_CLIENT,
        VALKEY_PUB,
        VALKEY_SUB,
        CACHE_SERIALIZER,
        ValkeyService,
        ValkeyLockService,
        ValkeyRateLimitService,
        ValkeyStreamService,
        ValkeyPubSubService,
        CacheMetricsService,
      ],
    };
  }

  static forRootAsync(options: ValkeyModuleAsyncOptions): DynamicModule {
    const asyncProviders = [
      createAsyncOptionsProvider(options),
      ...createAsyncOptionsFactoryProviders(options),
      ...createAsyncClientProviders(),
    ];

    const providers = [
      ...asyncProviders,
      ...(options.extraProviders ?? []),
      ...createBaseProviders(),
    ];

    return {
      module: ValkeyModule,
      imports: [...(options.imports ?? []), ObservabilityModule],
      providers,
      exports: [
        VALKEY_OPTIONS,
        VALKEY_CLIENT,
        VALKEY_PUB,
        VALKEY_SUB,
        CACHE_SERIALIZER,
        ValkeyService,
        ValkeyLockService,
        ValkeyRateLimitService,
        ValkeyStreamService,
        ValkeyPubSubService,
        CacheObservabilityService,
      ],
    };
  }
}
