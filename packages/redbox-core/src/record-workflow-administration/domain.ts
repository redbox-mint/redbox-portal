import { cloneDeep, isEqual } from 'lodash';
import { z } from 'zod';
import { boundedValidationPreflight, type BoundedValidationFailure } from '../boundedValidation';

export const RECORD_WORKFLOW_VALIDATION_LIMITS = {
  maxAggregateBytes: 262_144,
  maxDepth: 64,
  maxArrayItems: 100,
  maxObjectProperties: 100,
  maxPropertyNameLength: 128,
  maxRevisions: 256,
  maxWorkflowRecords: 256,
  maxStringLength: 32_768,
  maxValidationErrors: 100,
  maxValidationWork: 50_000,
};

export interface WorkflowIdentity {
  readonly brandId: string;
  readonly key: string;
}

export interface SharedWorkflowDraft<Content> {
  readonly content: Content;
}

export interface PublicationOrigin {
  readonly kind: 'publication';
}

export interface RollbackOrigin {
  readonly kind: 'rollback';
  readonly fromRevision: number;
}

export type PublishedRevisionOrigin = PublicationOrigin | RollbackOrigin;

export interface PublishedWorkflowRevision<Content> {
  readonly number: number;
  readonly content: Content;
  readonly origin: PublishedRevisionOrigin;
}

export interface DraftLifecycle {
  readonly state: 'draft';
  readonly activeRevision: null;
}

export interface PublishedLifecycle {
  readonly state: 'published';
  readonly activeRevision: number;
}

export interface RetiredLifecycle {
  readonly state: 'retired';
  readonly activeRevision: number | null;
}

export type WorkflowLifecycle = DraftLifecycle | PublishedLifecycle | RetiredLifecycle;

export interface WorkflowRecord<Content> {
  readonly identity: WorkflowIdentity;
  readonly draft: SharedWorkflowDraft<Content>;
  readonly revisions: readonly PublishedWorkflowRevision<Content>[];
}

export type RecordWorkflow<Content> = WorkflowRecord<Content> & WorkflowLifecycle;

export type WorkflowValidationError =
  | {
      readonly code: 'invalid-workflow-shape';
      readonly path: string;
      readonly message: string;
    }
  | {
      readonly code: 'revision-number-out-of-sequence';
      readonly index: number;
      readonly expected: number;
      readonly actual: number;
    }
  | {
      readonly code: 'rollback-target-not-published';
      readonly revision: number;
      readonly targetRevision: number;
    }
  | {
      readonly code: 'rollback-content-mismatch';
      readonly revision: number;
      readonly targetRevision: number;
    }
  | {
      readonly code: 'active-revision-not-published';
      readonly activeRevision: number;
    }
  | {
      readonly code: 'active-revision-required';
      readonly state: 'retired';
    }
  | {
      readonly code: 'draft-has-published-history';
    }
  | {
      readonly code: 'identity-already-exists';
      readonly identity: WorkflowIdentity;
    }
  | {
      readonly code: 'retired-identity-cannot-be-recreated';
      readonly identity: WorkflowIdentity;
    }
  | {
      readonly code: 'identity-changed';
      readonly previous: WorkflowIdentity;
      readonly next: WorkflowIdentity;
    }
  | {
      readonly code: 'published-history-truncated';
      readonly previousLength: number;
      readonly nextLength: number;
    }
  | {
      readonly code: 'published-revision-changed';
      readonly revision: number;
    }
  | {
      readonly code: 'rollback-must-append-revision';
      readonly requestedRevision: number;
    }
  | {
      readonly code: 'retired-workflow-cannot-change-lifecycle';
    }
  | {
      readonly code: 'retired-workflow-cannot-publish';
    };

export interface Valid<Value> {
  readonly ok: true;
  readonly value: Value;
}

export interface Invalid {
  readonly ok: false;
  readonly errors: readonly WorkflowValidationError[];
}

export type ValidationResult<Value> = Valid<Value> | Invalid;

export type RevisionContentEquals<Content> = (left: Content, right: Content) => boolean;

type JsonPrimitive = null | boolean | number | string;
type JsonContent = JsonPrimitive | readonly JsonContent[] | JsonObject;

interface JsonObject {
  readonly [key: string]: JsonContent;
}

type JsonContainer = readonly JsonContent[] | JsonObject;

function isJsonContainer<Value>(value: Value): value is Value & JsonContainer {
  return value !== null && typeof value === 'object';
}

function jsonContentSchema<Content>(): z.ZodType<Content> {
  const schema: z.ZodType<JsonContent> = z.json();
  return z.custom<Content>().refine((value: Content): boolean => schema.safeParse(value).success);
}

const workflowIdentitySchema = z
  .object({
    brandId: z.string(),
    key: z.string(),
  })
  .strict();

const publishedRevisionOriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('publication') }).strict(),
  z
    .object({
      kind: z.literal('rollback'),
      fromRevision: z.number().int().positive(),
    })
    .strict(),
]);

function publishedWorkflowRevisionSchema<Content>(): z.ZodType<PublishedWorkflowRevision<Content>> {
  return z
    .object({
      number: z.number().int().positive(),
      content: jsonContentSchema<Content>(),
      origin: publishedRevisionOriginSchema,
    })
    .strict();
}

function recordWorkflowSchema<Content>(): z.ZodType<RecordWorkflow<Content>> {
  const record = {
    identity: workflowIdentitySchema,
    draft: z
      .object({
        content: jsonContentSchema<Content>(),
      })
      .strict(),
    revisions: z.array(publishedWorkflowRevisionSchema<Content>()).max(RECORD_WORKFLOW_VALIDATION_LIMITS.maxRevisions),
  };

  return z.discriminatedUnion('state', [
    z
      .object({
        ...record,
        state: z.literal('draft'),
        activeRevision: z.null(),
      })
      .strict(),
    z
      .object({
        ...record,
        state: z.literal('published'),
        activeRevision: z.number().int().positive(),
      })
      .strict(),
    z
      .object({
        ...record,
        state: z.literal('retired'),
        activeRevision: z.number().int().positive().nullable(),
      })
      .strict(),
  ]);
}

function deepFreeze<Value>(value: Value): Readonly<Value> {
  const pending: JsonContainer[] = [];
  const seen = new WeakSet<object>();
  if (isJsonContainer(value)) {
    pending.push(value);
  }
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const propertyValue of Object.values(current)) {
      if (isJsonContainer(propertyValue)) {
        pending.push(propertyValue);
      }
    }
    Object.freeze(current);
  }
  return Object.freeze(value);
}

function valid<Value>(value: Value): Valid<Value> {
  return Object.freeze({ ok: true, value: deepFreeze(cloneDeep(value)) });
}

function defaultContentEquals<Content>(left: Content, right: Content): boolean {
  return isEqual(left, right);
}

function invalid(errors: readonly WorkflowValidationError[]): Invalid {
  return {
    ok: false,
    errors: errors.slice(0, RECORD_WORKFLOW_VALIDATION_LIMITS.maxValidationErrors),
  };
}

function invalidShape(issues: readonly z.core.$ZodIssue[]): Invalid {
  return invalid(
    issues.slice(0, RECORD_WORKFLOW_VALIDATION_LIMITS.maxValidationErrors).map(issue => ({
      code: 'invalid-workflow-shape',
      path: issue.path.length === 0 ? '$' : issue.path.map(segment => String(segment)).join('.'),
      message: issue.message,
    }))
  );
}

function workflowArrayCardinalityLimit(path: string): number {
  if (path === '$.revisions' || path.endsWith('.revisions')) {
    return RECORD_WORKFLOW_VALIDATION_LIMITS.maxRevisions;
  }
  if (path === '$.existing') {
    return RECORD_WORKFLOW_VALIDATION_LIMITS.maxWorkflowRecords;
  }
  return RECORD_WORKFLOW_VALIDATION_LIMITS.maxArrayItems;
}

function workflowObjectCardinalityLimit(): number {
  return RECORD_WORKFLOW_VALIDATION_LIMITS.maxObjectProperties;
}

function preflightMessage(failure: BoundedValidationFailure): string {
  if (failure.reason === 'bytes') {
    return 'Workflow input exceeds the aggregate byte limit.';
  }
  if (failure.reason === 'depth') {
    return 'Workflow input exceeds the structural depth limit.';
  }
  if (failure.reason === 'cardinality') {
    return 'Workflow input exceeds a container cardinality limit.';
  }
  if (failure.reason === 'cycle') {
    return 'Workflow input must not contain reference cycles.';
  }
  if (failure.reason === 'work') {
    return 'Workflow input exceeds the validation work limit.';
  }
  return 'Workflow input could not be inspected safely.';
}

function preflightWorkflow(value: object): Invalid | undefined {
  const result = boundedValidationPreflight(value, {
    maxBytes: RECORD_WORKFLOW_VALIDATION_LIMITS.maxAggregateBytes,
    maxDepth: RECORD_WORKFLOW_VALIDATION_LIMITS.maxDepth,
    maxStringLength: RECORD_WORKFLOW_VALIDATION_LIMITS.maxStringLength,
    maxPropertyNameLength: RECORD_WORKFLOW_VALIDATION_LIMITS.maxPropertyNameLength,
    maxWork: RECORD_WORKFLOW_VALIDATION_LIMITS.maxValidationWork,
    arrayCardinalityLimit: workflowArrayCardinalityLimit,
    objectCardinalityLimit: workflowObjectCardinalityLimit,
  });
  return result.ok
    ? undefined
    : invalid([
        {
          code: 'invalid-workflow-shape',
          path: result.path,
          message: preflightMessage(result),
        },
      ]);
}

function parseWorkflow<Content>(workflow: object): ValidationResult<RecordWorkflow<Content>> {
  const preflight = preflightWorkflow(workflow);
  if (preflight !== undefined) {
    return preflight;
  }
  const result = recordWorkflowSchema<Content>().safeParse(workflow);
  return result.success ? { ok: true, value: result.data } : invalidShape(result.error.issues);
}

function parseRevision<Content>(revision: object): ValidationResult<PublishedWorkflowRevision<Content>> {
  const preflight = preflightWorkflow(revision);
  if (preflight !== undefined) {
    return preflight;
  }
  const result = publishedWorkflowRevisionSchema<Content>().safeParse(revision);
  return result.success ? { ok: true, value: result.data } : invalidShape(result.error.issues);
}

function identitiesMatch(left: WorkflowIdentity, right: WorkflowIdentity): boolean {
  return left.brandId === right.brandId && left.key === right.key;
}

function findRevision<Content>(
  revisions: readonly PublishedWorkflowRevision<Content>[],
  number: number
): PublishedWorkflowRevision<Content> | undefined {
  return revisions.find(revision => revision.number === number);
}

function originsMatch(left: PublishedRevisionOrigin, right: PublishedRevisionOrigin): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === 'publication') {
    return true;
  }

  return right.kind === 'rollback' && left.fromRevision === right.fromRevision;
}

export function validateWorkflow<Content>(
  workflow: RecordWorkflow<Content>,
  contentEquals?: RevisionContentEquals<Content>
): ValidationResult<RecordWorkflow<Content>>;
export function validateWorkflow(workflow: object): ValidationResult<RecordWorkflow<never>>;
export function validateWorkflow<Content>(
  workflow: object,
  contentEquals: RevisionContentEquals<Content> = defaultContentEquals
): ValidationResult<RecordWorkflow<Content>> {
  const parsed = parseWorkflow<Content>(workflow);
  if (!parsed.ok) {
    return parsed;
  }

  const candidate = parsed.value;
  const errors: WorkflowValidationError[] = [];

  candidate.revisions.forEach((revision, index) => {
    const expected = index + 1;
    if (revision.number !== expected) {
      errors.push({
        code: 'revision-number-out-of-sequence',
        index,
        expected,
        actual: revision.number,
      });
    }

    if (revision.origin.kind === 'rollback') {
      const target = findRevision(candidate.revisions.slice(0, index), revision.origin.fromRevision);
      if (target === undefined) {
        errors.push({
          code: 'rollback-target-not-published',
          revision: revision.number,
          targetRevision: revision.origin.fromRevision,
        });
      } else if (!contentEquals(revision.content, target.content)) {
        errors.push({
          code: 'rollback-content-mismatch',
          revision: revision.number,
          targetRevision: revision.origin.fromRevision,
        });
      }
    }
  });

  if (candidate.state === 'draft' && candidate.revisions.length !== 0) {
    errors.push({ code: 'draft-has-published-history' });
  }

  if (candidate.state === 'retired' && candidate.revisions.length !== 0 && candidate.activeRevision === null) {
    errors.push({ code: 'active-revision-required', state: 'retired' });
  }

  if (candidate.activeRevision !== null && findRevision(candidate.revisions, candidate.activeRevision) === undefined) {
    errors.push({
      code: 'active-revision-not-published',
      activeRevision: candidate.activeRevision,
    });
  }

  return errors.length === 0 ? valid(candidate) : invalid(errors);
}

export function validateCreation<Content>(
  identity: WorkflowIdentity,
  existing: readonly RecordWorkflow<Content>[]
): ValidationResult<WorkflowIdentity> {
  const preflight = preflightWorkflow({ identity, existing });
  if (preflight !== undefined) {
    return preflight;
  }
  const identityValidation = workflowIdentitySchema.safeParse(identity);
  if (!identityValidation.success) {
    return invalidShape(identityValidation.error.issues);
  }

  const existingValidation = z.array(recordWorkflowSchema<Content>()).safeParse(existing);
  if (!existingValidation.success) {
    return invalidShape(existingValidation.error.issues);
  }

  const validatedIdentity = identityValidation.data;
  const match = existingValidation.data.find(workflow => identitiesMatch(workflow.identity, validatedIdentity));

  if (match === undefined) {
    return valid(validatedIdentity);
  }

  if (match.state === 'retired') {
    return invalid([{ code: 'retired-identity-cannot-be-recreated', identity: validatedIdentity }]);
  }

  return invalid([{ code: 'identity-already-exists', identity: validatedIdentity }]);
}

export function validateNextRevision<Content>(
  workflow: RecordWorkflow<Content>,
  revision: PublishedWorkflowRevision<Content>,
  contentEquals: RevisionContentEquals<Content> = defaultContentEquals
): ValidationResult<PublishedWorkflowRevision<Content>> {
  const aggregatePreflight = preflightWorkflow({ workflow, revision });
  if (aggregatePreflight !== undefined) {
    return aggregatePreflight;
  }
  const workflowValidation = validateWorkflow(workflow, contentEquals);
  const revisionValidation = parseRevision<Content>(revision);
  const errors: WorkflowValidationError[] = [];

  if (!workflowValidation.ok) {
    errors.push(...workflowValidation.errors);
  }
  if (!revisionValidation.ok) {
    errors.push(...revisionValidation.errors);
  }
  if (!workflowValidation.ok || !revisionValidation.ok) {
    return invalid(errors);
  }

  const validatedWorkflow = workflowValidation.value;
  const validatedRevision = revisionValidation.value;

  if (validatedWorkflow.state === 'retired') {
    errors.push({ code: 'retired-workflow-cannot-publish' });
  }

  const expected = validatedWorkflow.revisions.length + 1;
  if (validatedRevision.number !== expected) {
    errors.push({
      code: 'revision-number-out-of-sequence',
      index: validatedWorkflow.revisions.length,
      expected,
      actual: validatedRevision.number,
    });
  }

  if (validatedRevision.origin.kind === 'rollback') {
    const target = findRevision(validatedWorkflow.revisions, validatedRevision.origin.fromRevision);
    if (target === undefined) {
      errors.push({
        code: 'rollback-target-not-published',
        revision: validatedRevision.number,
        targetRevision: validatedRevision.origin.fromRevision,
      });
    } else if (!contentEquals(validatedRevision.content, target.content)) {
      errors.push({
        code: 'rollback-content-mismatch',
        revision: validatedRevision.number,
        targetRevision: validatedRevision.origin.fromRevision,
      });
    }
  }

  return errors.length === 0 ? valid(validatedRevision) : invalid(errors);
}

export function validateTransition<Content>(
  previous: RecordWorkflow<Content>,
  next: RecordWorkflow<Content>,
  contentEquals: RevisionContentEquals<Content>
): ValidationResult<RecordWorkflow<Content>> {
  const aggregatePreflight = preflightWorkflow({ previous, next });
  if (aggregatePreflight !== undefined) {
    return aggregatePreflight;
  }
  const previousValidation = validateWorkflow(previous, contentEquals);
  const nextValidation = validateWorkflow(next, contentEquals);
  const errors: WorkflowValidationError[] = [];

  if (!previousValidation.ok) {
    errors.push(...previousValidation.errors);
  }
  if (!nextValidation.ok) {
    errors.push(...nextValidation.errors);
  }
  if (!previousValidation.ok || !nextValidation.ok) {
    return invalid(errors);
  }

  const validatedPrevious = previousValidation.value;
  const validatedNext = nextValidation.value;

  if (!identitiesMatch(validatedPrevious.identity, validatedNext.identity)) {
    errors.push({
      code: 'identity-changed',
      previous: validatedPrevious.identity,
      next: validatedNext.identity,
    });
  }

  if (validatedNext.revisions.length < validatedPrevious.revisions.length) {
    errors.push({
      code: 'published-history-truncated',
      previousLength: validatedPrevious.revisions.length,
      nextLength: validatedNext.revisions.length,
    });
  }

  let publishedHistoryUnchanged: boolean = validatedNext.revisions.length === validatedPrevious.revisions.length;
  validatedPrevious.revisions.forEach((revision, index) => {
    const candidate = validatedNext.revisions[index];
    if (candidate === undefined) {
      publishedHistoryUnchanged = false;
    } else if (
      revision.number !== candidate.number ||
      !originsMatch(revision.origin, candidate.origin) ||
      !contentEquals(revision.content, candidate.content)
    ) {
      publishedHistoryUnchanged = false;
      errors.push({
        code: 'published-revision-changed',
        revision: revision.number,
      });
    }
  });

  const previousActiveRevision: number | null = validatedPrevious.activeRevision;
  const nextActiveRevision: number | null = validatedNext.activeRevision;
  const isPublicationPreservingUnretirement: boolean =
    validatedPrevious.state === 'retired' &&
    validatedNext.state !== 'retired' &&
    previousActiveRevision === nextActiveRevision &&
    publishedHistoryUnchanged &&
    ((previousActiveRevision === null && validatedNext.state === 'draft') ||
      (previousActiveRevision !== null && validatedNext.state === 'published'));

  if (
    validatedPrevious.state === 'retired' &&
    validatedNext.state !== 'retired' &&
    !isPublicationPreservingUnretirement
  ) {
    errors.push({ code: 'retired-workflow-cannot-change-lifecycle' });
  }

  if (
    (validatedPrevious.state === 'published' || validatedPrevious.state === 'retired') &&
    (validatedNext.state === 'published' || validatedNext.state === 'retired') &&
    nextActiveRevision !== null &&
    previousActiveRevision !== nextActiveRevision &&
    nextActiveRevision <= validatedPrevious.revisions.length
  ) {
    errors.push({
      code: 'rollback-must-append-revision',
      requestedRevision: nextActiveRevision,
    });
  }

  if (
    (validatedPrevious.state === 'retired' || validatedNext.state === 'retired') &&
    validatedNext.revisions.length > validatedPrevious.revisions.length
  ) {
    errors.push({ code: 'retired-workflow-cannot-publish' });
  }

  return errors.length === 0 ? valid(validatedNext) : invalid(errors);
}
