import _ from 'lodash';
import Handlebars from 'handlebars';
import { Context, Effect, Layer } from 'effect';
import { jsonataCompileAndEvaluate, registerSharedHandlebarsHelpers } from '@researchdatabox/sails-ng-common';
import type { AnyRecord } from './types';
import { validateSafeHandlebarsTemplate } from '../integration-v2/bindings';

export interface OniTemplatingService {
  path(path: string, context: AnyRecord, defaultValue?: unknown): Effect.Effect<unknown, Error>;
  handlebars(template: string, context: AnyRecord): Effect.Effect<string, Error>;
  jsonata(expression: string, context: AnyRecord): Effect.Effect<unknown, Error>;
}

export const OniTemplatingServiceTag = Context.GenericTag<OniTemplatingService>('redbox/OniTemplatingService');

let helpersRegistered = false;

function ensureHelpers(): void {
  if (!helpersRegistered) {
    registerSharedHandlebarsHelpers(Handlebars);
    helpersRegistered = true;
  }
}

export const liveOniTemplatingService: OniTemplatingService = {
  path: (path, context, defaultValue) => Effect.sync(() => _.get(context, path, defaultValue)),
  handlebars: (template, context) =>
    Effect.try({
      try: () => {
        ensureHelpers();
        validateSafeHandlebarsTemplate(template, 'Oni');
        return Handlebars.compile(template, { noEscape: true })(context);
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
