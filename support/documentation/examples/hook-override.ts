import type { RedboxExtension } from '../../../packages/redbox-core/src/extensions';
import type { ApplicationModule } from '../../../packages/redbox-core/src/application';
import type { RequestHandler } from '../../../packages/redbox-core/src/extensions';

class Example implements ApplicationModule {
  private ready = false;
  async initialize(): Promise<void> {
    this.ready = true;
  }
  async close(): Promise<void> {
    this.ready = false;
  }
  health(): boolean {
    return this.ready;
  }
}
export function registerRedboxExtension(): RedboxExtension {
  return {
    apiVersion: 1,
    modules: [{ name: 'example', create: () => new Example() }],
    handlers: [
      {
        name: 'example.health',
        requires: ['example'],
        create:
          (input: { example: Example }): RequestHandler =>
          (_req, res) => {
            res.json({ ready: input.example.health() });
          },
      },
    ],
    routes: [
      { name: 'example.health', method: 'get', path: '/example/health', handler: 'example.health', access: 'public' },
    ],
  };
}
