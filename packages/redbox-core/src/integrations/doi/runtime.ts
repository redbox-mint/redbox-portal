import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { DoiPublishing, DoiOperationResult, DoiRunContext } from '../../services/doi-v2/types';
import { DoiClientTag, makeClientLayer } from '../../services/doi-v2/http';
import type { IntegrationAuditContext } from '../../queries/IntegrationAudits';
import type { DoiAudit } from './input';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import { IntegrationAuditAction } from '../../model/storage/IntegrationAuditModel';
import { runEffectProgram } from '../../services/integration-v2/runtime';

export const DoiConfigTag = Context.Service<DoiPublishing>('redbox/DoiConfig');
export const DoiRunContextTag = Context.Service<DoiRunContext>('redbox/DoiRunContext');

export interface DoiRuntimeInput {
  readonly log: Pick<ILogger, 'warn'>;
  readonly audit: DoiAudit;
  readonly clientLayer: typeof makeClientLayer;
}

export type DoiRuntimeAuditOptions = {
  auditContext?: IntegrationAuditContext | null;
  requestSummary?: Record<string, unknown>;
};

export function makeRuntimeLayer(input: DoiRuntimeInput, config: DoiPublishing, runContext: DoiRunContext) {
  return Layer.mergeAll(
    Layer.succeed(DoiConfigTag, config),
    Layer.succeed(DoiRunContextTag, runContext),
    input.clientLayer(config, runContext)
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function toResponseSummary(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  return { rawResponseBody: value };
}

function extractDoiId(
  input: DoiRuntimeInput,
  responseSummary: Record<string, unknown>,
  statusCode: number,
  operationName: string
): string | null {
  const responseData = responseSummary['data'];
  if (isRecord(responseData)) {
    const id = responseData['id'];
    if (typeof id === 'string' && id.trim() !== '') {
      return id;
    }
  }

  if (statusCode >= 200 && statusCode < 300) {
    input.log.warn(`${operationName} returned a successful response without a DOI id.`);
  }

  return null;
}

async function runAuditedHttpOperation(
  input: DoiRuntimeInput,
  auditAction: IntegrationAuditAction,
  runContext: DoiRunContext,
  requestSummary: Record<string, unknown> | undefined,
  parentAuditContext: IntegrationAuditContext | null | undefined,
  successMessage: string,
  failureMessage: string,
  operation: () => Promise<DoiOperationResult>
): Promise<DoiOperationResult> {
  const auditCtx = input.audit.start(
    parentAuditContext?.redboxOid ?? runContext.recordOid,
    auditAction,
    runContext,
    requestSummary ?? {},
    parentAuditContext
  );

  try {
    const result = await operation();
    await input.audit.complete(auditCtx, {
      message: successMessage,
      httpStatusCode: result.statusCode,
      requestSummary,
      responseSummary: result.responseSummary,
    });
    return result;
  } catch (error) {
    await input.audit.fail(auditCtx, error, {
      message: failureMessage,
      requestSummary,
      httpStatusCode:
        error instanceof Error && 'statusCode' in error
          ? (error as Error & { statusCode?: number }).statusCode
          : undefined,
      responseSummary:
        error instanceof Error && 'responseBody' in error
          ? (error as Error & { responseBody?: Record<string, unknown> }).responseBody
          : undefined,
    });
    throw error;
  }
}

export async function runCreateDoiProgram(
  input: DoiRuntimeInput,
  config: DoiPublishing,
  runContext: DoiRunContext,
  payload: Record<string, unknown>,
  options: DoiRuntimeAuditOptions = {}
): Promise<DoiOperationResult> {
  return runAuditedHttpOperation(
    input,
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
        const responseSummary = toResponseSummary(response.data);
        return {
          doi: extractDoiId(input, responseSummary, response.statusCode, 'DataCite create DOI request'),
          statusCode: response.statusCode,
          responseSummary,
        };
      }).pipe(Effect.provide(makeRuntimeLayer(input, config, runContext)));
      return runEffectProgram(program);
    }
  );
}

export async function runUpdateDoiProgram(
  input: DoiRuntimeInput,
  config: DoiPublishing,
  runContext: DoiRunContext,
  doi: string,
  payload: Record<string, unknown>,
  options: DoiRuntimeAuditOptions = {}
): Promise<DoiOperationResult> {
  return runAuditedHttpOperation(
    input,
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
        const responseSummary = toResponseSummary(response.data);
        return {
          doi: extractDoiId(input, responseSummary, response.statusCode, 'DataCite update DOI request') ?? doi,
          statusCode: response.statusCode,
          responseSummary,
        };
      }).pipe(Effect.provide(makeRuntimeLayer(input, config, runContext)));
      return runEffectProgram(program);
    }
  );
}

export async function runDeleteDoiProgram(
  input: DoiRuntimeInput,
  config: DoiPublishing,
  runContext: DoiRunContext,
  doi: string,
  options: DoiRuntimeAuditOptions = {}
): Promise<DoiOperationResult> {
  return runAuditedHttpOperation(
    input,
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
          responseSummary: { deleted: response.statusCode === 204, doi },
        };
      }).pipe(Effect.provide(makeRuntimeLayer(input, config, runContext)));
      return runEffectProgram(program);
    }
  );
}

export async function runChangeDoiStateProgram(
  input: DoiRuntimeInput,
  config: DoiPublishing,
  runContext: DoiRunContext,
  doi: string,
  event: string,
  options: DoiRuntimeAuditOptions = {}
): Promise<DoiOperationResult> {
  return runAuditedHttpOperation(
    input,
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
          responseSummary: { changed: response.statusCode === 200, doi, event },
        };
      }).pipe(Effect.provide(makeRuntimeLayer(input, config, runContext)));
      return runEffectProgram(program);
    }
  );
}
