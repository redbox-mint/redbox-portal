import { Context, Effect, Layer } from 'effect';
import * as Cause from 'effect/Cause';
import type { DoiPublishing, DoiOperationResult, DoiRunContext } from './types';
import { DoiClientTag, makeClientLayer } from './http';

export const DoiConfigTag = Context.GenericTag<DoiPublishing>('redbox/DoiConfig');
export const DoiRunContextTag = Context.GenericTag<DoiRunContext>('redbox/DoiRunContext');

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

export async function runCreateDoiProgram(
  config: DoiPublishing,
  runContext: DoiRunContext,
  payload: Record<string, unknown>
): Promise<DoiOperationResult> {
  const program = Effect.gen(function* () {
    const client = yield* DoiClientTag;
    const response = yield* Effect.promise(() => client.createDoi(payload));
    const data = response.data as { data?: { id?: string } };
    return {
      doi: data?.data?.id ?? null,
      statusCode: response.statusCode,
      responseSummary: { doi: data?.data?.id ?? null }
    };
  }).pipe(Effect.provide(makeRuntimeLayer(config, runContext)));
  return runProgram(program);
}

export async function runUpdateDoiProgram(
  config: DoiPublishing,
  runContext: DoiRunContext,
  doi: string,
  payload: Record<string, unknown>
): Promise<DoiOperationResult> {
  const program = Effect.gen(function* () {
    const client = yield* DoiClientTag;
    const response = yield* Effect.promise(() => client.updateDoi(doi, payload));
    const data = response.data as { data?: { id?: string } };
    return {
      doi: data?.data?.id ?? doi,
      statusCode: response.statusCode,
      responseSummary: { doi: data?.data?.id ?? doi }
    };
  }).pipe(Effect.provide(makeRuntimeLayer(config, runContext)));
  return runProgram(program);
}

export async function runDeleteDoiProgram(
  config: DoiPublishing,
  runContext: DoiRunContext,
  doi: string
): Promise<DoiOperationResult> {
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

export async function runChangeDoiStateProgram(
  config: DoiPublishing,
  runContext: DoiRunContext,
  doi: string,
  event: string
): Promise<DoiOperationResult> {
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
