import _ from 'lodash';
import { Context, Effect, Layer } from 'effect';
import { handlebarsCompile, jsonataCompileAndEvaluate } from '@researchdatabox/sails-ng-common';
import type { AnyRecord } from './types';
import { validateSafeHandlebarsTemplate } from '../integration-v2/bindings';

export interface OniTemplatingService {
  path(path: string, context: AnyRecord, defaultValue?: unknown): Effect.Effect<unknown, Error>;
  handlebars(template: string, context: AnyRecord): Effect.Effect<string, Error>;
  jsonata(expression: string, context: AnyRecord): Effect.Effect<unknown, Error>;
}

export const OniTemplatingServiceTag = Context.GenericTag<OniTemplatingService>('redbox/OniTemplatingService');

export const liveOniTemplatingService: OniTemplatingService = {
  path: (path, context, defaultValue) => Effect.sync(() => _.get(context, path, defaultValue)),
  handlebars: (template, context) =>
    Effect.try({
      try: () => {
        validateSafeHandlebarsTemplate(template, 'Oni');
        return handlebarsCompile(template, { noEscape: true })(context);
      },
      catch: error => (error instanceof Error ? error : new Error(String(error))),
    }),
  jsonata: (expression, context) =>
    Effect.tryPromise({
      try: () => jsonataCompileAndEvaluate(expression, context),
      catch: error => (error instanceof Error ? error : new Error(String(error))),
    }),
};

export const OniTemplatingLive = Layer.succeed(OniTemplatingServiceTag, liveOniTemplatingService);
