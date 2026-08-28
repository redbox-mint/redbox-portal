import { parentPort, type MessagePort } from 'node:worker_threads';
import Handlebars from 'handlebars';
import jsonata from 'jsonata';
import { handlebarsHelperDefinitions } from '@researchdatabox/sails-ng-common/dist/src/handlebars-helpers';
import { escapeHtmlText } from '@researchdatabox/sails-ng-common/dist/src/html-helpers';
import { luxonFormatDate } from '@researchdatabox/sails-ng-common/dist/src/jsonata-helpers';
import { guessNameParts } from '@researchdatabox/sails-ng-common/dist/src/translation-helpers';
import { boundedValidationPreflight } from '../boundedValidation';
import {
  isRuntimeArray,
  isRuntimeRecord,
  readRuntimeProperty,
  type JsonObject,
  type JsonValue,
  type RuntimeValue,
} from '../runtimeValues';
import { compileManagedHandlebarsTemplate, compileManagedJsonataExpression } from './compile';
import { ManagedExpressionError } from './errors';
import { EXPRESSION_RUNTIME_LIMITS } from './limits';
import {
  decodeWorkerRequest,
  encodeWorkerMessage,
  runtimeValueIsBoundedJson,
  type ExpressionWorkerRequest,
  type ExpressionWorkerResponse,
} from './worker-protocol';
import type { ManagedExpressionEngine, ManagedTemplateDestination } from './types';

function requiredParentPort(value: MessagePort | null): MessagePort {
  if (value === null) {
    throw new ManagedExpressionError('jsonata', 'worker', 'expression-worker-port-missing');
  }
  return value;
}

const port = requiredParentPort(parentPort);

function emailList(...argumentsList: RuntimeValue[]): string {
  const creators = argumentsList[0];
  if (!isRuntimeArray(creators)) {
    return '';
  }
  const emails: string[] = [];
  for (const creator of creators) {
    if (!isRuntimeRecord(creator)) {
      continue;
    }
    const email = readRuntimeProperty(creator, 'email');
    if (typeof email === 'string') {
      emails.push(email);
    }
  }
  return emails.join(',');
}

const handlebarsHelpers = Object.freeze({
  and: handlebarsHelperDefinitions.and,
  concat: handlebarsHelperDefinitions.concat,
  default: handlebarsHelperDefinitions.default,
  emailList,
  eq: handlebarsHelperDefinitions.eq,
  formatDate: handlebarsHelperDefinitions.formatDate,
  gt: handlebarsHelperDefinitions.gt,
  gte: handlebarsHelperDefinitions.gte,
  isArray: handlebarsHelperDefinitions.isArray,
  isDefined: handlebarsHelperDefinitions.isDefined,
  isEmpty: handlebarsHelperDefinitions.isEmpty,
  isNull: handlebarsHelperDefinitions.isNull,
  isObject: handlebarsHelperDefinitions.isObject,
  isUndefined: handlebarsHelperDefinitions.isUndefined,
  join: handlebarsHelperDefinitions.join,
  lt: handlebarsHelperDefinitions.lt,
  lte: handlebarsHelperDefinitions.lte,
  ne: handlebarsHelperDefinitions.ne,
  not: handlebarsHelperDefinitions.not,
  or: handlebarsHelperDefinitions.or,
  parseDateString: handlebarsHelperDefinitions.parseDateString,
  split: handlebarsHelperDefinitions.split,
  substring: handlebarsHelperDefinitions.substring,
  toLower: handlebarsHelperDefinitions.toLower,
  toUpper: handlebarsHelperDefinitions.toUpper,
  trim: handlebarsHelperDefinitions.trim,
  urlEncode: handlebarsHelperDefinitions.urlEncode,
});

const knownHandlebarsHelpers: Readonly<Record<string, boolean>> = Object.freeze({
  and: true,
  concat: true,
  default: true,
  each: true,
  emailList: true,
  eq: true,
  formatDate: true,
  gt: true,
  gte: true,
  if: true,
  isArray: true,
  isDefined: true,
  isEmpty: true,
  isNull: true,
  isObject: true,
  isUndefined: true,
  join: true,
  lt: true,
  lte: true,
  ne: true,
  not: true,
  or: true,
  parseDateString: true,
  split: true,
  substring: true,
  toLower: true,
  toUpper: true,
  trim: true,
  unless: true,
  urlEncode: true,
  with: true,
});

function resultPreflight(value: RuntimeValue): boolean {
  return boundedValidationPreflight(value, {
    maxBytes: EXPRESSION_RUNTIME_LIMITS.maxResultBytes,
    maxDepth: EXPRESSION_RUNTIME_LIMITS.maxJsonDepth,
    maxStringLength: EXPRESSION_RUNTIME_LIMITS.maxResultBytes,
    maxPropertyNameLength: EXPRESSION_RUNTIME_LIMITS.maxPropertyNameLength,
    maxWork: EXPRESSION_RUNTIME_LIMITS.maxValidationWork,
    arrayCardinalityLimit: () => EXPRESSION_RUNTIME_LIMITS.maxArrayItems,
    objectCardinalityLimit: () => EXPRESSION_RUNTIME_LIMITS.maxObjectProperties,
  }).ok;
}

function inputPreflight(request: ExpressionWorkerRequest): boolean {
  return boundedValidationPreflight(request.context, {
    maxBytes: EXPRESSION_RUNTIME_LIMITS.maxInputBytes,
    maxDepth: EXPRESSION_RUNTIME_LIMITS.maxInputDepth,
    maxStringLength: EXPRESSION_RUNTIME_LIMITS.maxInputBytes,
    maxPropertyNameLength: EXPRESSION_RUNTIME_LIMITS.maxPropertyNameLength,
    maxWork: EXPRESSION_RUNTIME_LIMITS.maxValidationWork,
    arrayCardinalityLimit: () => EXPRESSION_RUNTIME_LIMITS.maxArrayItems,
    objectCardinalityLimit: () => EXPRESSION_RUNTIME_LIMITS.maxObjectProperties,
  }).ok;
}

function isolateJsonValue(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(isolateJsonValue);
  }
  const isolated: JsonObject = {};
  Object.setPrototypeOf(isolated, null);
  for (const [key, child] of Object.entries(value)) {
    isolated[key] = isolateJsonValue(child);
  }
  return isolated;
}

function isolateContext(context: JsonObject, engine: ManagedExpressionEngine): JsonObject {
  const isolated = isolateJsonValue(context);
  if (isolated === null || typeof isolated !== 'object' || Array.isArray(isolated)) {
    throw new ManagedExpressionError(engine, 'validation', 'expression-context-invalid');
  }
  return isolated;
}

function createManagedHandlebars(): typeof Handlebars {
  const instance = Handlebars.create();
  instance.unregisterHelper('attachmentDownloadUrl');
  instance.unregisterHelper('blockHelperMissing');
  instance.unregisterHelper('get');
  instance.unregisterHelper('helperMissing');
  instance.unregisterHelper('json');
  instance.unregisterHelper('log');
  instance.unregisterHelper('lookup');
  instance.unregisterHelper('markdownToHtml');
  instance.unregisterHelper('plaintextToHtml');
  instance.unregisterHelper('pluck');
  instance.unregisterHelper('renderMetadataValue');
  instance.unregisterHelper('t');
  for (const [name, helper] of Object.entries(handlebarsHelpers)) {
    instance.registerHelper(name, helper);
  }
  return instance;
}

function applyTemplateDestination(value: string, destination: ManagedTemplateDestination): string {
  if (destination === 'html-text') {
    return escapeHtmlText(value);
  }
  if (destination === 'email-subject') {
    return value.replace(/[\r\n]+/g, ' ').trim();
  }
  if (destination === 'url-component') {
    return encodeURIComponent(value);
  }
  return value;
}

async function evaluateJsonata(
  request: ExpressionWorkerRequest & { readonly engine: 'jsonata' }
): Promise<JsonValue | undefined> {
  const prepared = compileManagedJsonataExpression(request.source);
  const expression = jsonata(prepared.source);
  expression.registerFunction('luxonFormatDate', luxonFormatDate, '<(snlo)(sl)(sl)?:s>');
  expression.registerFunction('guessNameParts', guessNameParts, '<(sl):o>');
  const result: RuntimeValue = await expression.evaluate(isolateContext(request.context, 'jsonata'));
  if (result === undefined) {
    return undefined;
  }
  if (!resultPreflight(result) || !runtimeValueIsBoundedJson(result)) {
    throw new ManagedExpressionError('jsonata', 'limit', 'jsonata-result-invalid');
  }
  return result;
}

function renderHandlebars(request: ExpressionWorkerRequest & { readonly engine: 'handlebars' }): string {
  const prepared = compileManagedHandlebarsTemplate(request.source, request.destination);
  const instance = createManagedHandlebars();
  const template = instance.compile<Record<string, JsonValue>>(prepared.source, {
    data: false,
    knownHelpers: knownHandlebarsHelpers,
    knownHelpersOnly: true,
    noEscape: true,
    strict: true,
  });
  const rendered = template(isolateContext(request.context, 'handlebars'), {
    allowCallsToHelperMissing: false,
    allowProtoMethodsByDefault: false,
    allowProtoPropertiesByDefault: false,
    allowedProtoMethods: {},
    allowedProtoProperties: {},
    helpers: {},
    partials: {},
  });
  const result = applyTemplateDestination(rendered, prepared.destination);
  if (Buffer.byteLength(result, 'utf8') > EXPRESSION_RUNTIME_LIMITS.maxResultBytes) {
    throw new ManagedExpressionError('handlebars', 'limit', 'handlebars-result-size-exceeded');
  }
  return result;
}

function failure(error: ManagedExpressionError): ExpressionWorkerResponse {
  return {
    type: 'failure',
    engine: error.diagnostic.engine,
    kind: error.diagnostic.kind,
    code: error.diagnostic.code,
  };
}

async function execute(message: RuntimeValue): Promise<void> {
  const request = typeof message === 'string' ? decodeWorkerRequest(message) : undefined;
  if (request === undefined) {
    port.postMessage(
      encodeWorkerMessage({
        type: 'failure',
        engine: 'jsonata',
        kind: 'validation',
        code: 'expression-worker-request-invalid',
      })
    );
    port.close();
    return;
  }
  if (!inputPreflight(request)) {
    port.postMessage(
      encodeWorkerMessage({
        type: 'failure',
        engine: request.engine,
        kind: 'limit',
        code: 'expression-input-limit-exceeded',
      })
    );
    port.close();
    return;
  }

  try {
    if (request.engine === 'jsonata') {
      const value = await evaluateJsonata(request);
      port.postMessage(
        encodeWorkerMessage(
          value === undefined ? { type: 'json-result', present: false } : { type: 'json-result', present: true, value }
        )
      );
    } else {
      port.postMessage(encodeWorkerMessage({ type: 'text-result', value: renderHandlebars(request) }));
    }
  } catch (error) {
    const normalized =
      error instanceof ManagedExpressionError
        ? error
        : new ManagedExpressionError(request.engine, 'evaluation', `${request.engine}-evaluation-failed`);
    port.postMessage(encodeWorkerMessage(failure(normalized)));
  }
  port.close();
}

port.once('message', (message: RuntimeValue) => {
  void execute(message);
});
port.postMessage(encodeWorkerMessage({ type: 'ready' }));
