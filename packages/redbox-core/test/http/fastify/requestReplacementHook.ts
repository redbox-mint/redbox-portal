import type { HttpHookContribution } from '../../../src/http/contracts';

export interface ReplaceableRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  params?: unknown;
  query?: unknown;
}
export let observeReplacement: ((request: ReplaceableRequest) => void | Promise<void>) | undefined;
export function onReplacement(observe?: typeof observeReplacement): void {
  observeReplacement = observe;
}
/** Actual installed API2 hook. Express applies the same callback at the final
 * transport handler, after its production policies and CSRF. */
export async function replaceRequest(request: ReplaceableRequest, expressQuery = false): Promise<void> {
  const encoded = request.headers['x-fm027-replacement'];
  if (typeof encoded !== 'string') return;
  const replacements: Record<string, unknown> = JSON.parse(encoded);
  for (const field of ['body', 'params', 'query'] as const)
    if (Object.hasOwn(replacements, field)) {
      // Express 5 exposes query via an inherited getter; its middleware can
      // replace it with an own value. Fastify's supported view forwards this.
      if (field === 'query' && expressQuery)
        Object.defineProperty(request, field, { value: replacements[field], configurable: true, writable: true });
      else request[field] = replacements[field];
    }
  await observeReplacement?.(request);
}
export const replacementHooks: readonly HttpHookContribution[] = [
  {
    name: 'fm027-replace-input',
    stage: 'beforeAction',
    scope: { kind: 'application' },
    run: async request => replaceRequest(request),
  },
];
