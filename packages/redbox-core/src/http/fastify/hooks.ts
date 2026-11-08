import type { FastifyReply, FastifyRequest } from 'fastify';
import { ExtensionError } from '../../extensions/loading';
import type { ResolvedRegistration } from '../../extensions/resolution';
import type { HttpHookContribution, HttpObservationRequest, SafeHttpError } from '../contracts';
import type { FastifyPreparation } from './preparation';
import { httpReplySubmitted, normalizeHttpError, safeHttpErrorStatus } from './errorBoundary';
import { requestPathname } from './router';
import { trackHttpRequestWork } from '../../middleware/requestLifetime';
import { assertPublicHttpName, type HttpTargetNamespace } from './targetNames';

/** Callback continuation preserves synchronous native response error handling.
 * Track stage work separately: a terminal response can release the callback lease. */
export function requestStageHook(run: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> | undefined) {
  return function (request: FastifyRequest, reply: FastifyReply, done: (error?: Error) => void) {
    if (httpReplySubmitted(reply)) return;
    const work = run(request, reply);
    if (!work) return done();
    trackHttpRequestWork(request, work);
    // Fastify's promise hook runner drops synchronous native continuation throws
    // (for example an invalid serializer result). Route them to its error boundary.
    void work
      .then(() => {
        if (!httpReplySubmitted(reply)) done();
      })
      .catch(error => done(normalizeHttpError(error)));
  };
}

const stages = ['afterAuthentication', 'beforeAction', 'onResponse', 'onError'] as const;
const identifier = /^[A-Za-z][A-Za-z0-9_.:-]{0,199}$/;
const fail = (provider: string, message: string): never => {
  throw new ExtensionError(provider, message);
};

/** Named replacement shared by hooks and fallbacks. Input is resolved provider order. */
export function selectHttpContributions<T extends { readonly name: string; readonly replaces?: true }>(
  registrations: readonly ResolvedRegistration<T>[],
  kind: string
): ResolvedRegistration<T>[] {
  const selected = new Map<string, ResolvedRegistration<T>>();
  const local = new Set<string>();
  for (const item of registrations) {
    const { provider, declaration } = item;
    if (!declaration || typeof declaration.name !== 'string' || !identifier.test(declaration.name))
      fail(provider, `${kind} requires a bounded name`);
    assertPublicHttpName(provider, declaration.name);
    const key = JSON.stringify([provider, declaration.name]);
    if (local.has(key)) fail(provider, `duplicate ${kind} ${declaration.name} in provider`);
    local.add(key);
    if (declaration.replaces !== undefined && declaration.replaces !== true)
      fail(provider, `${kind} ${declaration.name} has invalid replaces`);
    if (!!selected.has(declaration.name) !== !!declaration.replaces)
      fail(
        provider,
        selected.has(declaration.name)
          ? `${kind} ${declaration.name} requires replaces: true`
          : `${kind} ${declaration.name} replacement has no target`
      );
    // The winning provider's declaration position is the tie breaker.
    selected.delete(declaration.name);
    selected.set(declaration.name, item);
  }
  return [...selected.values()];
}

export function composeHttpHooks(
  registrations: readonly ResolvedRegistration<HttpHookContribution>[],
  targets: HttpTargetNamespace
) {
  // Validate even losing declarations, without executing contribution functions.
  for (const { provider, declaration: hook } of registrations) {
    if (!hook || !stages.includes(hook.stage))
      fail(provider, 'unsupported HTTP hook stage (afterRoutes is a fallback)');
    const scope = hook.scope;
    if (!scope || !['application', 'routes'].includes(scope.kind))
      fail(provider, `hook ${hook.name} requires explicit scope`);
    if (Object.keys(scope).some(key => !(scope.kind === 'routes' ? ['kind', 'names'] : ['kind']).includes(key)))
      fail(provider, `hook ${hook.name} has unknown scope fields`);
    if (
      scope.kind === 'routes' &&
      (!Array.isArray(scope.names) ||
        !scope.names.length ||
        new Set(scope.names).size !== scope.names.length ||
        scope.names.some(name => !targets.hookTarget(name)))
    )
      fail(provider, `hook ${hook.name} has unresolved route scope`);
    if (
      hook.requires !== undefined &&
      (!Array.isArray(hook.requires) ||
        new Set(hook.requires).size !== hook.requires.length ||
        hook.requires.some(name => typeof name !== 'string' || !identifier.test(name)))
    )
      fail(provider, `hook ${hook.name} has invalid prerequisites`);
    if (typeof (hook.stage === 'onResponse' || hook.stage === 'onError' ? hook.observe : hook.run) !== 'function')
      fail(provider, `hook ${hook.name} requires its stage function`);
    const allowed = ['name', 'stage', 'scope', 'requires', 'replaces', hook.stage.startsWith('on') ? 'observe' : 'run'];
    if (Object.keys(hook).some(key => !allowed.includes(key))) fail(provider, `hook ${hook.name} has unknown fields`);
  }
  const selected = selectHttpContributions(registrations, 'hook').map(item =>
    Object.freeze({
      ...item,
      declaration: Object.freeze({
        ...item.declaration,
        scope: Object.freeze(
          item.declaration.scope.kind === 'routes'
            ? { kind: 'routes' as const, names: Object.freeze([...item.declaration.scope.names]) }
            : { kind: 'application' as const }
        ),
        requires: Object.freeze([...(item.declaration.requires ?? [])]),
      }),
    })
  );
  const byName = new Map(selected.map(item => [item.declaration.name, item]));
  for (const { provider, declaration } of selected)
    for (const name of declaration.requires) {
      const target = byName.get(name);
      if (!target) return fail(provider, `hook ${declaration.name} requires missing hook ${name}`);
      if (target.declaration.stage !== declaration.stage)
        fail(provider, `hook ${declaration.name} has cross-stage dependency ${name}`);
    }
  const ordered: typeof selected = [];
  const pending = [...selected];
  const completed = new Set<string>();
  while (pending.length) {
    const index = pending.findIndex(item => item.declaration.requires.every(name => completed.has(name)));
    if (index < 0) fail(pending[0].provider, 'HTTP hook dependency cycle');
    const [item] = pending.splice(index, 1);
    ordered.push(item);
    completed.add(item.declaration.name);
  }
  const applies = (hook: HttpHookContribution, routeName?: string) =>
    hook.scope.kind === 'application' || (routeName !== undefined && hook.scope.names.includes(routeName));
  const snapshot = (request: FastifyRequest, reply: FastifyReply, routeName?: string): HttpObservationRequest =>
    Object.freeze({
      id: String(request.id),
      method: request.method,
      url: requestPathname(request.raw.url ?? '/') ?? '/',
      routeName,
      statusCode: reply.statusCode,
    });
  async function observe(
    stage: 'onResponse' | 'onError',
    request: FastifyRequest,
    reply: FastifyReply,
    routeName?: string,
    error?: unknown
  ) {
    const data = snapshot(request, reply, routeName);
    const safe: SafeHttpError = Object.freeze({
      code: 'HTTP_REQUEST_FAILED',
      statusCode: safeHttpErrorStatus(error),
      requestId: data.id,
    });
    for (const { declaration: hook } of ordered) {
      if (hook.stage !== stage || !applies(hook, routeName)) continue;
      try {
        // The snapshot has no capabilities, nested mutable request data, or raw errors.
        if (hook.stage === 'onError') await hook.observe(data, safe);
        else if (hook.stage === 'onResponse') await hook.observe(data);
      } catch {
        reply.log.error('HTTP_OBSERVATION_FAILED');
      }
    }
  }
  return {
    hooks: Object.freeze(ordered),
    async run(
      stage: 'afterAuthentication' | 'beforeAction',
      name: string | undefined,
      request: FastifyRequest,
      reply: FastifyReply
    ) {
      for (const { declaration: hook } of ordered) {
        if (httpReplySubmitted(reply)) return reply;
        if (hook.stage !== stage || !applies(hook, name)) continue;
        if (hook.stage === 'afterAuthentication' || hook.stage === 'beforeAction') await hook.run(request, reply);
        // Shared FM-016 terminal submission check includes pending asynchronous onSend.
        if (httpReplySubmitted(reply)) return reply;
      }
    },
    install(app: FastifyPreparation, routeName: (request: FastifyRequest) => string | undefined) {
      app.addHook('onResponse', async (request, reply) => {
        await observe('onResponse', request, reply, routeName(request));
      });
      app.addHook('onError', async (request, reply, error) => {
        await observe('onError', request, reply, routeName(request), error);
      });
    },
  };
}
