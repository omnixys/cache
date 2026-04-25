// delayed-job.registry.ts

import { DelayedJobRegistry } from './delayed-job-registry.js';
import { DELAYED_JOB_HANDLER, DELAYED_JOB_METADATA } from './delayed-job.constants.js';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';

interface HandlerEntry {
  instance: Record<string, any>;
  methodName: string;
}

@Injectable()
export class DelayedJobRegistryService implements OnModuleInit {
  private readonly logger = new Logger(DelayedJobRegistryService.name);
  private readonly handlers = new Map<keyof DelayedJobRegistry, HandlerEntry>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit() {
    this.scanHandlers();
    this.logger.log(`Delayed job handlers registered: ${this.handlers.size}`);
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

        this.logger.debug(
          `Registered delayed job → type=${type} handler=${instance.constructor.name}.${methodName}`,
        );
      });
    }
  }

  async execute<K extends keyof DelayedJobRegistry>(
    type: K,
    payload: DelayedJobRegistry[K],
  ): Promise<void> {
    const entry = this.handlers.get(type);

    if (!entry) {
      this.logger.warn(`No handler for job type=${type}`);
      return;
    }

    const method = entry.instance[entry.methodName] as (
      payload: DelayedJobRegistry[K],
    ) => Promise<void> | void;

    await method.call(entry.instance, payload);
  }
}
