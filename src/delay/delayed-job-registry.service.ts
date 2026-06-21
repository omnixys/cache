// delayed-job.registry.ts

import { DelayedJobRegistry } from './delayed-job-registry.js';
import { DELAYED_JOB_HANDLER, DELAYED_JOB_METADATA } from './delayed-job.constants.js';
import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { OmnixysLogger } from '@omnixys/logger';

interface HandlerEntry {
  instance: Record<string, any>;
  methodName: string;
}

@Injectable()
export class DelayedJobRegistryService implements OnModuleInit {
  private readonly handlers = new Map<keyof DelayedJobRegistry, HandlerEntry>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
    @Optional() private readonly logger?: OmnixysLogger,
  ) {}

  onModuleInit() {
    this.scanHandlers();
    this.logger
      ?.child(DelayedJobRegistryService.name)
      .info('Delayed job handlers registered', { handlerCount: this.handlers.size });
  }

  private scanHandlers() {
    const providers = this.discovery.getProviders();

    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance) continue;

      const isHandler = this.reflector.get<boolean>(DELAYED_JOB_HANDLER, instance.constructor);

      if (!isHandler) continue;

      const prototype = Object.getPrototypeOf(instance);

      this.scanner.getAllMethodNames(prototype).forEach((methodName) => {
        const methodRef = instance[methodName];

        const metadata = this.reflector.get<{
          type: keyof DelayedJobRegistry;
        }>(DELAYED_JOB_METADATA, methodRef);

        if (!metadata) return;

        const { type } = metadata;

        if (this.handlers.has(type)) {
          const existing = this.handlers.get(type)!;

          throw new Error(
            `Duplicate delayed job handler for "${type}"\n` +
              `Existing: ${existing.instance.constructor.name}.${existing.methodName}\n` +
              `New: ${instance.constructor.name}.${methodName}`,
          );
        }

        this.handlers.set(type, { instance, methodName });

        this.logger?.child(DelayedJobRegistryService.name).debug('Delayed job handler registered', {
          jobType: type,
          handler: `${instance.constructor.name}.${methodName}`,
        });
      });
    }
  }

  async execute<K extends keyof DelayedJobRegistry>(
    type: K,
    payload: DelayedJobRegistry[K],
  ): Promise<void> {
    const entry = this.handlers.get(type);

    if (!entry) {
      this.logger
        ?.child(DelayedJobRegistryService.name)
        .error('Delayed job handler is missing', { jobType: type });
      throw new Error(`No delayed job handler registered for "${type}"`);
    }

    const method = entry.instance[entry.methodName] as (
      payload: DelayedJobRegistry[K],
    ) => Promise<void> | void;

    await method.call(entry.instance, payload);
  }
}
