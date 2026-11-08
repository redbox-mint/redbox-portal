import type { HttpHookContribution, HttpFallbackContribution } from '../../../../dist/http';
import type { RedboxExtensionV2 } from '../../../../dist/extensions';

const requestHook: HttpHookContribution = {
  name: 'typed-request',
  stage: 'beforeAction',
  scope: { kind: 'routes', names: ['read'] },
  async run(request, reply) {
    const method: string = request.method;
    if (method === 'POST') reply.code(202).send({ accepted: true });
  },
};
const observation: HttpHookContribution = {
  name: 'typed-observation',
  stage: 'onError',
  scope: { kind: 'application' },
  async observe(request, error) {
    const correlation: string = error.requestId;
    const code: string = error.code;
    const status: number = error.statusCode;
    // @ts-expect-error Observations never receive response/transport capabilities.
    request.raw.end();
    // @ts-expect-error Observations never receive a mutable session.
    request.session.destroy();
    // @ts-expect-error Detached records are immutable.
    request.method = 'POST';
    // @ts-expect-error Provider diagnostics are absent.
    error.message;
    void [correlation, code, status];
  },
};
const fallback: HttpFallbackContribution = {
  name: 'typed-fallback',
  prefix: '/institution',
  controller: 'Institution',
  action: 'missing',
  access: { kind: 'policies', names: ['brandingandportal', 'checkauth'] },
  csrf: true,
  context: { branding: 'institution', portal: 'research' },
};
const extension: RedboxExtensionV2 = { apiVersion: 2, hooks: [requestHook, observation], fallbacks: [fallback] };
void extension;
