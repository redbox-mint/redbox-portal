import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { AnyRecord } from './types';
import { evaluatePath, evaluateHandlebars, evaluateJsonata } from '../integration-v2/bindings';

export interface OniTemplatingService {
  path(path: string, context: AnyRecord, defaultValue?: unknown): Effect.Effect<unknown, Error>;
  handlebars(template: string, context: AnyRecord): Effect.Effect<string, Error>;
  jsonata(expression: string, context: AnyRecord): Effect.Effect<unknown, Error>;
}

export const OniTemplatingServiceTag = Context.Service<OniTemplatingService>('redbox/OniTemplatingService');

export const liveOniTemplatingService: OniTemplatingService = {
  path: (path, context, defaultValue) => Effect.sync(() => evaluatePath(path, context, defaultValue)),
  handlebars: (template, context) =>
    Effect.try({
      try: () => evaluateHandlebars(template, context, 'Oni', true),
      catch: error => (error instanceof Error ? error : new Error(String(error))),
    }),
  jsonata: (expression, context) =>
    Effect.tryPromise({
      try: () => evaluateJsonata(expression, context),
      catch: error => (error instanceof Error ? error : new Error(String(error))),
    }),
};

export const OniTemplatingLive = Layer.succeed(OniTemplatingServiceTag, liveOniTemplatingService);
