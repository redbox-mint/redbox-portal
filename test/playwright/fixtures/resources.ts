import { randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';

export type OwnedResource = { kind: string; id: string; cleanup: () => Promise<void> };

export class ResourceLedger {
  readonly runId = process.env.PLAYWRIGHT_RUN_ID ?? `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  private readonly resources: OwnedResource[] = [];
  private readonly outcomes = new Map<OwnedResource, string>();
  private counter = 0;

  constructor(private readonly testId = randomBytes(4).toString('hex')) {}

  name(testId: string, label: string): string {
    const safe = `${testId}-${label}`.replace(/[^a-zA-Z0-9-]+/g, '-').slice(0, 80);
    const testSuffix = this.testId.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
    return `e2e-${this.runId}-${testSuffix}-${safe}-${++this.counter}`;
  }

  track<T extends OwnedResource>(resource: T): T {
    if (!resource.id) throw new Error(`Cannot own ${resource.kind} without its returned ID.`);
    this.resources.push(resource);
    return resource;
  }

  snapshot(): Array<{ kind: string; id: string; cleanup: string }> {
    return this.resources.map(resource => ({ kind: resource.kind, id: resource.id, cleanup: this.outcomes.get(resource) ?? 'pending' }));
  }

  async cleanup(): Promise<void> {
    const failures: string[] = [];
    for (const resource of [...this.resources].reverse()) {
      try {
        await resource.cleanup();
        this.outcomes.set(resource, 'complete');
      } catch (error) {
        this.outcomes.set(resource, String(error));
        failures.push(`${resource.kind}/${resource.id}: ${String(error)}`);
      }
    }
    if (failures.length) throw new Error(`Playwright fixture cleanup failed:\n${failures.join('\n')}`);
  }
}

export class PortalApi {
  constructor(
    readonly request: APIRequestContext,
    private readonly token: string,
    private readonly basePath = '/default/rdmp'
  ) {}

  async get(path: string): Promise<Awaited<ReturnType<APIRequestContext['get']>>> {
    return this.request.get(path.startsWith('/') ? path : `${this.basePath}/${path}`);
  }
  async mutate(
    method: 'post' | 'put' | 'delete',
    path: string,
    data?: unknown,
    headers: Record<string, string> = {}
  ): Promise<Awaited<ReturnType<APIRequestContext['post']>>> {
    const url = path.startsWith('/') ? path : `${this.basePath}/${path}`;
    const options = { data, headers: { 'X-CSRF-Token': this.token, ...headers } };
    if (method === 'post') return this.request.post(url, options);
    if (method === 'put') return this.request.put(url, options);
    return this.request.delete(url, { headers: options.headers });
  }
}
