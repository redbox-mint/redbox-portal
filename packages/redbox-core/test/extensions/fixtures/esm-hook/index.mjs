import { ready } from 'sr-esm-only';
await new Promise(resolve => setTimeout(resolve, 5));
export function registerRedboxExtension() {
  return {
    apiVersion: 1,
    config: { packedESM: ready },
    modules: [
      {
        name: 'counter',
        create: input => {
          input.created('esm');
          return { initialize: async () => {}, close: async () => {} };
        },
      },
    ],
  };
}
