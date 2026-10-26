import type { ApplicationModuleFactory } from '../application/Application';
import type { ExtensionHostIntegration } from './contract';

export function integrationModule(
  name: string,
  create: () => ExtensionHostIntegration,
  instances: Map<string, ExtensionHostIntegration>
): ApplicationModuleFactory {
  return {
    name: 'host-' + name,
    create: () => {
      const instance = create();
      instances.set(name, instance);
      return {
        initialize: () => instance.initialize(),
        activate: () => instance.activate?.() ?? Promise.resolve(),
        quiesce: () => instance.quiesce?.(),
        drain: options => instance.drain?.(options) ?? Promise.resolve(),
        close: async () => {
          await instance.close();
          instances.delete(name);
        },
      };
    },
  };
}
