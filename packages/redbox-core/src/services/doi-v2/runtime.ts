import { Context, Effect, Layer } from 'effect';
import * as Cause from 'effect/Cause';
import type { DoiPublishing, DoiOperationResult, DoiRunContext } from './types';
import { DoiClientTag, makeClientLayer } from './http';
import type { IntegrationAuditContext } from '../IntegrationAuditService';
import { completeDoiAudit, failDoiAudit, startDoiAudit } from './audit';
import { IntegrationAuditAction } from '../../model/storage/IntegrationAuditModel';

export const DoiConfigTag = Context.GenericTag<DoiPublishing>('redbox/DoiConfig');
export const DoiRunContextTag = Context.GenericTag<DoiRunContext>('redbox/DoiRunContext');

type DoiRuntimeAuditOptions = {
  auditContext?: IntegrationAuditContext | null;
  requestSummary?: Record<string, unknown>;
};

export function makeRuntimeLayer(config: DoiPublishing, runContext: DoiRunContext) {
  return Layer.mergeAll(
    Layer.succeed(DoiConfigTag, config),
    Layer.succeed(DoiRunContextTag, runContext),
    makeClientLayer(config, runContext)
  );
}

async function runProgram<A>(program: Effect.Effect<A, unknown, never>): Promise<A> {
  const exit = await Effect.runPromiseExit(program);
  if (exit._tag === 'Success') {
    return exit.value;
  }

  const failure = Cause.failureOrCause(exit.cause);
  if (failure._tag === 'Left') {
    throw failure.left;
  }
  throw Cause.squash(failure.right);
}

function buildHttpRequestSummary(
  requestSummary: Record<string, unknown> | undefined,
  method: string,
  path: string
): Record<string, unknown> {
  return {
    ...(requestSummary ?? {}),
    method,
    path,
  };
}

async function runAuditedHttpOperation(
  auditAction: IntegrationAuditAction,
  runContext: DoiRunContext,
  requestSummary: Record<string, unknown> | undefined,
  parentAuditContext: IntegrationAuditContext | null | undefined,
  successMessage: string,
  failureMessage: string,
  operation: () => Promise<DoiOperationResult>
): Promise<DoiOperationResult> {
  const auditCtx = startDoiAudit(
    parentAuditContext?.redboxOid ?? runContext.recordOid,
    auditAction,
    runContext,
    requestSummary ?? {},
    parentAuditContext
  );

  try {
    const result = await operation();
    completeDoiAudit(auditCtx, {
      message: successMessage,
      httpStatusCode: result.statusCode,
      requestSummary,
      responseSummary: result.responseSummary,
    });
    return result;
  } catch (error) {
    failDoiAudit(auditCtx, error, {
      message: failureMessage,
      requestSummary,
      httpStatusCode: error instanceof Error && 'statusCode' in error ? (error as Error & { statusCode?: number }).statusCode : undefined,
      responseSummary: error instanceof Error && 'responseBody' in error ? (error as Error & { responseBody?: Record<string, unknown> }).responseBody : undefined,
    });
    throw error;
  }
}

export async function runCreateDoiProgram(
  config: DoiPublishing,
  runContext: DoiRunContext,
  payload: Record<string, unknown>,
  options: DoiRuntimeAuditOptions = {}
): Promise<DoiOperationResult> {
  return runAuditedHttpOperation(
    IntegrationAuditAction.createDoiRequest,
    runContext,
    buildHttpRequestSummary(options.requestSummary, 'post', '/dois'),
    options.auditContext,
    'DataCite create DOI request completed.',
    'DataCite create DOI request failed.',
    async () => {
      const program = Effect.gen(function* () {
        const client = yield* DoiClientTag;
        const response = yield* Effect.promise(() => client.createDoi(payload));
        const data = response.data as { data?: { id?: string } };
        return {
          doi: data?.data?.id ?? null,
          statusCode: response.statusCode,
          responseSummary: response.data as Record<string, unknown>
        };
      }).pipe(Effect.provide(makeRuntimeLayer(config, runContext)));
      return runProgram(program);
    }
  );
}

export async function runUpdateDoiProgram(
  config: DoiPublishing,
  runContext: DoiRunContext,
  doi: string,
  payload: Record<string, unknown>,
  options: DoiRuntimeAuditOptions = {}
): Promise<DoiOperationResult> {
  return runAuditedHttpOperation(
    IntegrationAuditAction.updateDoiRequest,
    runContext,
    buildHttpRequestSummary(options.requestSummary, 'patch', `/dois/${encodeURIComponent(doi)}`),
    options.auditContext,
    'DataCite update DOI request completed.',
    'DataCite update DOI request failed.',
    async () => {
      const program = Effect.gen(function* () {
        const client = yield* DoiClientTag;
        const response = yield* Effect.promise(() => client.updateDoi(doi, payload));
        const data = response.data as { data?: { id?: string } };
        return {
          doi: data?.data?.id ?? doi,
          statusCode: response.statusCode,
          responseSummary: response.data as Record<string, unknown>
        };
      }).pipe(Effect.provide(makeRuntimeLayer(config, runContext)));
      return runProgram(program);
    }
  );
}

export async function runDeleteDoiProgram(
  config: DoiPublishing,
  runContext: DoiRunContext,
  doi: string,
  options: DoiRuntimeAuditOptions = {}
): Promise<DoiOperationResult> {
  return runAuditedHttpOperation(
    IntegrationAuditAction.deleteDoiRequest,
    runContext,
    buildHttpRequestSummary(options.requestSummary, 'delete', `/dois/${encodeURIComponent(doi)}`),
    options.auditContext,
    'DataCite delete DOI request completed.',
    'DataCite delete DOI request failed.',
    async () => {
      const program = Effect.gen(function* () {
        const client = yield* DoiClientTag;
        const response = yield* Effect.promise(() => client.deleteDoi(doi));
        return {
          doi,
          statusCode: response.statusCode,
          responseSummary: { deleted: response.statusCode === 204, doi }
        };
      }).pipe(Effect.provide(makeRuntimeLayer(config, runContext)));
      return runProgram(program);
    }
  );
}

export async function runChangeDoiStateProgram(
  config: DoiPublishing,
  runContext: DoiRunContext,
  doi: string,
  event: string,
  options: DoiRuntimeAuditOptions = {}
): Promise<DoiOperationResult> {
  return runAuditedHttpOperation(
    IntegrationAuditAction.changeDoiStateRequest,
    runContext,
    buildHttpRequestSummary(options.requestSummary, 'put', `/dois/${encodeURIComponent(doi)}`),
    options.auditContext,
    'DataCite change DOI state request completed.',
    'DataCite change DOI state request failed.',
    async () => {
      const program = Effect.gen(function* () {
        const client = yield* DoiClientTag;
        const response = yield* Effect.promise(() => client.changeDoiState(doi, event));
        return {
          doi,
          statusCode: response.statusCode,
          responseSummary: { changed: response.statusCode === 200, doi, event }
        };
      }).pipe(Effect.provide(makeRuntimeLayer(config, runContext)));
      return runProgram(program);
    }
  );
}
