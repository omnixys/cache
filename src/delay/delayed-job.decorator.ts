import { DelayedJobRegistry } from './delayed-job-registry.js';
import {
  DELAYED_JOB_HANDLER,
  DELAYED_JOB_METADATA,
} from './delayed-job.constants.js';
import { SetMetadata } from '@nestjs/common';

export function DelayedJob<K extends keyof DelayedJobRegistry>(
  type: K,
): MethodDecorator {
  return (
    target: Object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw new Error(
        `@DelayedJob can only be applied to methods: ${String(propertyKey)}`,
      );
    }

    Reflect.defineMetadata(DELAYED_JOB_METADATA, { type }, descriptor.value);
  };
}
/**
 * Marks a class as a delayed job handler container
 */
export function DelayedJobHandler(): ClassDecorator {
  return SetMetadata(DELAYED_JOB_HANDLER, true);
}
