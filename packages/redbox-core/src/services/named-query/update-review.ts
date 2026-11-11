import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getOperationAST, parse, print } from 'graphql';
import type {
  NamedQueryBreakingChange,
  NamedQueryDefinition,
  NamedQueryUpdateReview,
} from '@researchdatabox/sails-ng-common';
import type { ReadCaller } from '../../record-graphql/read-record';

/** Restart invalidates acknowledgements when no shared session/cursor secret is configured. */
const processSecret = randomBytes(32).toString('hex');
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(key => JSON.stringify(key) + ':' + canonical(Reflect.get(value, key)))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
const equal = (left: unknown, right: unknown) => canonical(left) === canonical(right);
function parameters(definition: NamedQueryDefinition): Record<string, unknown> {
  if (definition.source !== 'graphql') return object(definition.queryParams);
  let defaults: Record<string, unknown> = {};
  try {
    const operation = getOperationAST(
      parse(definition.graphql?.document ?? '', { maxTokens: 2000 }),
      definition.graphql?.operationName
    );
    defaults = Object.fromEntries(
      (operation?.variableDefinitions ?? []).map(variable => [
        variable.variable.name.value,
        variable.defaultValue ? print(variable.defaultValue) : undefined,
      ])
    );
  } catch {
    /* Drifted definitions remain repairable; their stored bindings still require review. */
  }
  return Object.fromEntries(
    Object.entries(object(definition.graphql?.variables)).flatMap(([variable, value]) => {
      const binding = object(value);
      return binding.ownership === 'consumer' && typeof binding.parameter === 'string'
        ? [[binding.parameter, { ...binding, variable, operationDefault: defaults[variable] }]]
        : [];
    })
  );
}
export function namedQueryBreakingChanges(
  previous: NamedQueryDefinition | undefined,
  next: NamedQueryDefinition
): NamedQueryBreakingChange[] {
  if (!previous || (previous.source ?? 'database') !== (next.source ?? 'database')) return ['source'];
  const changes: NamedQueryBreakingChange[] = [];
  const before = parameters(previous);
  const after = parameters(next);
  if (
    Object.keys(before).some(key => !equal(before[key], after[key])) ||
    Object.entries(after).some(([key, value]) => !Object.hasOwn(before, key) && object(value).required === true)
  )
    changes.push('parameters');
  if (previous.source === 'graphql' && next.source === 'graphql') {
    // Selections, aliases, fragments and directives can change effective mapped
    // output without changing the stored paths. Review any document/operation edit.
    if (
      previous.graphql?.document !== next.graphql.document ||
      previous.graphql?.operationName !== next.graphql.operationName
    )
      changes.push('document');
    if (
      !equal(previous.graphql?.resultPath, next.graphql.resultPath) ||
      !equal(previous.graphql?.mappings, next.graphql.mappings)
    )
      changes.push('mappings');
    if (!equal(previous.graphql?.lookup, next.graphql.lookup)) changes.push('lookup');
  } else if (previous.source !== 'graphql' && next.source !== 'graphql') {
    if (
      Object.entries(previous.resultObjectMapping ?? {}).some(
        ([key, value]) => next.resultObjectMapping?.[key] !== value
      )
    )
      changes.push('mappings');
  }
  return changes;
}
function secret(): string {
  const session = sails.config.session;
  return (
    (session && typeof session.secret === 'string' && session.secret) ||
    sails.config.recordGraphql?.cursorSecret ||
    processSecret
  );
}
function digest(saved: unknown, next: unknown, review: NamedQueryUpdateReview, caller?: ReadCaller): string {
  return createHash('sha256')
    .update(
      canonical({
        saved,
        next,
        changes: review.changes,
        usedBy: review.usedBy,
        actor: caller ? { brand: caller.brand.id, portal: caller.portal, user: caller.user.username } : null,
      })
    )
    .digest('hex');
}
export function updateConfirmation(
  saved: unknown,
  next: unknown,
  review: NamedQueryUpdateReview,
  caller?: ReadCaller,
  token?: string
): string | undefined {
  const hash = digest(saved, next, review, caller);
  const sign = (message: string) =>
    createHmac('sha256', secret())
      .update('named-query-update/1:' + message)
      .digest('hex');
  if (token !== undefined) {
    if (typeof token !== 'string' || token.length > 256 || token.split('.').length !== 3) return undefined;
    const [expires, confirmedHash, signature] = token.split('.');
    const message = expires + '.' + confirmedHash;
    const expected = sign(message);
    if (
      !/^\d+$/.test(expires) ||
      Number(expires) < Date.now() ||
      Number(expires) > Date.now() + 600_000 ||
      confirmedHash !== hash ||
      !signature ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return undefined;
    return token;
  }
  const message = Date.now() + 600_000 + '.' + hash;
  return message + '.' + sign(message);
}
export class NamedQueryUpdateConfirmationError extends Error {
  readonly code = 'NAMED_QUERY_CONFIRMATION_REQUIRED';
  constructor(readonly review: NamedQueryUpdateReview) {
    super('Review and confirm the current named query change before saving.');
  }
}
export class NamedQueryUpdateConflictError extends Error {
  readonly code = 'NAMED_QUERY_CHANGED';
  constructor() {
    super('The saved named query changed. Reload and review your changes again.');
  }
}
