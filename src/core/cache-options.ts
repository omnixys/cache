import type { ModuleMetadata, Provider, Type } from '@nestjs/common';

export interface ValkeyPubSubOptions {
  enabled?: boolean;
}

export interface ValkeyStreamOptions {
  enabled?: boolean;
}

export interface ValkeyModuleOptions {
  serviceName: string;
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: number;
  tls?: boolean;
  keyPrefix?: string;
  pubSub?: ValkeyPubSubOptions;
  streams?: ValkeyStreamOptions;
  worker?: boolean;
}

export interface ValkeyModuleOptionsFactory {
  createValkeyOptions(): ValkeyModuleOptions | Promise<ValkeyModuleOptions>;
}

export interface ValkeyModuleAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  inject?: Array<string | symbol | Type<any>>;

  useExisting?: Type<ValkeyModuleOptionsFactory>;
  useClass?: Type<ValkeyModuleOptionsFactory>;

  useFactory?: (
    ...args: unknown[]
  ) => ValkeyModuleOptions | Promise<ValkeyModuleOptions>;

  extraProviders?: Provider[];
}
