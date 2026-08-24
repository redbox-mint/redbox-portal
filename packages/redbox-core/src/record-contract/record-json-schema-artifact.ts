import { createHash } from 'crypto';
import Ajv2020, { type AnySchema, type AnySchemaObject, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';

import { RECORD_SCHEMA_PROBLEM_CODES } from './codes';
import { normalizeRedboxCanonicalJsonV1, serializeRedboxCanonicalJsonV1 } from './canonical-json';
import type { RecordJsonSchemaDocument } from './json-schema-renderer';
import type { ContractJsonObject, ContractJsonValue } from './types';

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const CONTRIBUTOR_ANNOTATION_KEY = /^(?:x-[A-Za-z0-9_$:-]+|[A-Za-z_$][A-Za-z0-9_$:-]*:[A-Za-z0-9_$:-]+)$/;
const SCHEMA_MAP_KEYWORDS = new Set(['$defs', 'properties']);
const SCHEMA_OBJECT_KEYWORDS = new Set(['else', 'if', 'items', 'not', 'then']);
const SCHEMA_ARRAY_KEYWORDS = new Set(['allOf', 'anyOf']);

/** Annotation-only keywords emitted directly by the v1 renderer/compiler. */
export const RECORD_JSON_SCHEMA_ANNOTATION_KEYWORDS = Object.freeze([
  'x-redbox-completeness',
  'x-redbox-context',
  'x-redbox-contract-format',
  'x-redbox-diagnostics',
  'x-redbox-unsupported-component',
  'x-redbox-validation',
] as const);

export type RecordJsonSchemaEtag = `"sha256:${string}"`;

export interface PublishedRecordJsonSchemaDocument extends RecordJsonSchemaDocument {
  readonly $id: string;
}

export interface RecordJsonSchemaIdentity {
  readonly digest: string;
  readonly document: PublishedRecordJsonSchemaDocument;
  readonly canonicalJson: string;
  readonly byteLength: number;
  readonly etag: RecordJsonSchemaEtag;
}

export type RecordJsonSchemaIdentityErrorReason = 'invalid-context' | 'invalid-limit';

export class RecordJsonSchemaIdentityError extends Error {
  public constructor(
    public readonly reason: RecordJsonSchemaIdentityErrorReason,
    message: string
  ) {
    super(message);
    this.name = 'RecordJsonSchemaIdentityError';
  }
}

export class RecordJsonSchemaDocumentLimitError extends Error {
  public readonly code = RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DOCUMENT_BYTES;

  public constructor(
    public readonly byteLength: number,
    public readonly maxDocumentBytes: number
  ) {
    super(`The canonical record JSON Schema is ${byteLength} bytes and exceeds the ${maxDocumentBytes}-byte limit.`);
    this.name = 'RecordJsonSchemaDocumentLimitError';
  }
}

export interface RecordJsonSchemaValidationIssue {
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly keyword: string;
  readonly parameters: ContractJsonObject;
}

export type RecordJsonSchemaValidationResult =
  | { readonly valid: true; readonly issues: readonly []; readonly truncated: false }
  | {
      readonly valid: false;
      readonly issues: readonly RecordJsonSchemaValidationIssue[];
      readonly truncated: boolean;
    };

export interface CompiledRecordJsonSchemaValidator {
  readonly validate: (input: unknown) => RecordJsonSchemaValidationResult;
}

export interface CompiledRecordJsonSchemaArtifact extends RecordJsonSchemaIdentity {
  readonly validator: CompiledRecordJsonSchemaValidator;
}

export type RecordJsonSchemaCompilationErrorReason = 'compile' | 'metaschema';

export class RecordJsonSchemaCompilationError extends Error {
  public readonly code = RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT;

  public constructor(
    public readonly reason: RecordJsonSchemaCompilationErrorReason,
    public readonly issues: readonly RecordJsonSchemaValidationIssue[]
  ) {
    super(
      reason === 'metaschema'
        ? 'The generated record JSON Schema does not satisfy the draft 2020-12 metaschema.'
        : 'The generated record JSON Schema could not be compiled by AJV 2020.'
    );
    this.name = 'RecordJsonSchemaCompilationError';
  }
}

export interface RecordJsonSchemaArtifactCompilerOptions {
  readonly maxDocumentBytes: number;
  readonly maxValidationErrors: number;
}

function compareLexicographically(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new RecordJsonSchemaIdentityError('invalid-limit', `${name} must be a finite positive integer.`);
  }
}

function isJsonObject(value: unknown): value is ContractJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sortCanonicalValues(values: readonly ContractJsonValue[]): readonly ContractJsonValue[] {
  return [...values].sort((left, right) =>
    compareLexicographically(serializeRedboxCanonicalJsonV1(left), serializeRedboxCanonicalJsonV1(right))
  );
}

function normalizeValidationSummary(value: ContractJsonValue): ContractJsonValue {
  if (!isJsonObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareLexicographically)
      .map(key => {
        const child = value[key];
        if ((key === 'groups' || key === 'operations' || key === 'pointers') && Array.isArray(child)) {
          return [key, sortCanonicalValues(child)];
        }
        return [key, child];
      })
  );
}

function normalizeSchemaMap(value: ContractJsonValue): ContractJsonValue {
  if (!isJsonObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareLexicographically)
      .map(key => [key, normalizeSchema(value[key])])
  );
}

function normalizeSchema(value: ContractJsonValue): ContractJsonValue {
  if (!isJsonObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareLexicographically)
      .map(key => {
        const child = value[key];
        if ((key === 'enum' || key === 'required' || key === 'type') && Array.isArray(child)) {
          return [key, sortCanonicalValues(child)];
        }
        if (key === 'x-redbox-validation' && Array.isArray(child)) {
          return [key, sortCanonicalValues(child.map(normalizeValidationSummary))];
        }
        if (key === 'x-redbox-diagnostics' && Array.isArray(child)) {
          return [key, sortCanonicalValues(child)];
        }
        if (SCHEMA_MAP_KEYWORDS.has(key)) {
          return [key, normalizeSchemaMap(child)];
        }
        if (SCHEMA_OBJECT_KEYWORDS.has(key)) {
          return [key, normalizeSchema(child)];
        }
        if (SCHEMA_ARRAY_KEYWORDS.has(key) && Array.isArray(child)) {
          return [key, child.map(normalizeSchema)];
        }
        // Annotation payloads are JSON data, not nested schemas. Their array
        // order is part of whole-document identity even when a data property
        // happens to be named `type`, `enum`, or `required`.
        return [key, child];
      })
  );
}

/** Normalize the compiler-owned unordered arrays without reordering semantic arrays such as examples. */
export function normalizeRecordJsonSchemaDocument(document: unknown): RecordJsonSchemaDocument {
  const jsonValue = normalizeRedboxCanonicalJsonV1(document);
  if (!isJsonObject(jsonValue)) {
    throw new RecordJsonSchemaIdentityError('invalid-context', 'A record JSON Schema document must be a JSON object.');
  }
  return normalizeRedboxCanonicalJsonV1(normalizeSchema(jsonValue)) as RecordJsonSchemaDocument;
}

function withoutIdentifier(document: RecordJsonSchemaDocument): ContractJsonObject {
  return Object.fromEntries(Object.entries(document).filter(([key]) => key !== '$id')) as ContractJsonObject;
}

function contextSegment(document: RecordJsonSchemaDocument, key: 'brand' | 'portal'): string {
  const context = document['x-redbox-context'];
  const value = context?.[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new RecordJsonSchemaIdentityError(
      'invalid-context',
      `The record JSON Schema context must contain a non-empty ${key}.`
    );
  }
  if (value === '.' || value === '..') {
    throw new RecordJsonSchemaIdentityError(
      'invalid-context',
      `The record JSON Schema context ${key} must not be a relative-path segment.`
    );
  }
  return value;
}

function immutableSchemaId(document: RecordJsonSchemaDocument, digest: string): string {
  let brand: string;
  let portal: string;
  try {
    brand = encodeURIComponent(contextSegment(document, 'brand'));
    portal = encodeURIComponent(contextSegment(document, 'portal'));
  } catch (error) {
    if (error instanceof RecordJsonSchemaIdentityError) {
      throw error;
    }
    throw new RecordJsonSchemaIdentityError(
      'invalid-context',
      'The record JSON Schema brand and portal must be valid Unicode route segments.'
    );
  }
  return `/${brand}/${portal}/api/records/schemas/${digest}`;
}

/**
 * Compute whole-document identity, excluding the protected root `$id`, then
 * inject the digest-addressed origin-relative identifier and size the final
 * Redbox Canonical JSON v1 representation.
 */
export function identifyRecordJsonSchema(
  document: RecordJsonSchemaDocument,
  maxDocumentBytes: number
): RecordJsonSchemaIdentity {
  assertPositiveInteger(maxDocumentBytes, 'maxDocumentBytes');
  const normalized = normalizeRecordJsonSchemaDocument(document);
  const identityDocument = withoutIdentifier(normalized);
  const identityCanonicalJson = serializeRedboxCanonicalJsonV1(identityDocument);
  const digest = createHash('sha256').update(identityCanonicalJson, 'utf8').digest('hex');
  if (!DIGEST_PATTERN.test(digest)) {
    throw new Error('SHA-256 returned a non-canonical record schema digest.');
  }

  const published = normalizeRecordJsonSchemaDocument({
    ...identityDocument,
    $id: immutableSchemaId(normalized, digest),
  }) as PublishedRecordJsonSchemaDocument;
  const canonicalJson = serializeRedboxCanonicalJsonV1(published);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  if (byteLength > maxDocumentBytes) {
    throw new RecordJsonSchemaDocumentLimitError(byteLength, maxDocumentBytes);
  }

  return Object.freeze({
    digest,
    document: published,
    canonicalJson,
    byteLength,
    etag: `"sha256:${digest}"` as RecordJsonSchemaEtag,
  });
}

function annotationKeywords(document: PublishedRecordJsonSchemaDocument): readonly string[] {
  const keywords = new Set<string>(RECORD_JSON_SCHEMA_ANNOTATION_KEYWORDS);
  const pending: unknown[] = [document];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!isJsonObject(current)) {
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      if (CONTRIBUTOR_ANNOTATION_KEY.test(key)) {
        keywords.add(key);
      }
      if (SCHEMA_MAP_KEYWORDS.has(key) && isJsonObject(child)) {
        for (const schema of Object.values(child)) {
          if (isJsonObject(schema)) {
            pending.push(schema);
          }
        }
      } else if (SCHEMA_OBJECT_KEYWORDS.has(key) && isJsonObject(child)) {
        pending.push(child);
      } else if (SCHEMA_ARRAY_KEYWORDS.has(key) && Array.isArray(child)) {
        for (const schema of child) {
          if (isJsonObject(schema)) {
            pending.push(schema);
          }
        }
      }
    }
  }
  return [...keywords].sort(compareLexicographically);
}

function validationParameters(error: ErrorObject): ContractJsonObject {
  const value = normalizeRedboxCanonicalJsonV1(error.params);
  return isJsonObject(value) ? value : {};
}

function validationIssues(
  errors: readonly ErrorObject[] | null | undefined,
  maximum: number
): readonly RecordJsonSchemaValidationIssue[] {
  return Object.freeze(
    (errors ?? []).slice(0, maximum).map(error =>
      Object.freeze({
        instancePath: error.instancePath,
        schemaPath: error.schemaPath,
        keyword: error.keyword,
        parameters: validationParameters(error),
      })
    )
  );
}

function wrappedValidator(
  validate: ValidateFunction<unknown>,
  maxValidationErrors: number
): CompiledRecordJsonSchemaValidator {
  const noIssues = Object.freeze([]) as readonly [];
  const validResult: RecordJsonSchemaValidationResult = Object.freeze({
    valid: true,
    issues: noIssues,
    truncated: false,
  });
  return Object.freeze({
    validate: (input: unknown): RecordJsonSchemaValidationResult => {
      if (validate(input)) {
        return validResult;
      }
      const total = validate.errors?.length ?? 0;
      return Object.freeze({
        valid: false,
        issues: validationIssues(validate.errors, maxValidationErrors),
        truncated: total > maxValidationErrors,
      });
    },
  });
}

/** Canonical identity plus a non-mutating AJV 2020 validator for the exact published document. */
export class RecordJsonSchemaArtifactCompiler {
  private readonly ajv: Ajv2020;
  private readonly registeredKeywords = new Set<string>();

  public constructor(private readonly options: Readonly<RecordJsonSchemaArtifactCompilerOptions>) {
    assertPositiveInteger(options.maxDocumentBytes, 'maxDocumentBytes');
    assertPositiveInteger(options.maxValidationErrors, 'maxValidationErrors');
    this.ajv = new Ajv2020({
      addUsedSchema: false,
      allErrors: true,
      coerceTypes: false,
      removeAdditional: false,
      strict: true,
      strictTypes: false,
      useDefaults: false,
      validateSchema: true,
    });
  }

  public compile(document: RecordJsonSchemaDocument): CompiledRecordJsonSchemaArtifact {
    const identity = identifyRecordJsonSchema(document, this.options.maxDocumentBytes);
    this.registerAnnotations(identity.document);

    if (!this.ajv.validateSchema(identity.document as AnySchemaObject)) {
      throw new RecordJsonSchemaCompilationError(
        'metaschema',
        validationIssues(this.ajv.errors, this.options.maxValidationErrors)
      );
    }

    let validate: ValidateFunction<unknown>;
    try {
      validate = this.ajv.compile(identity.document as AnySchema);
    } catch {
      throw new RecordJsonSchemaCompilationError('compile', Object.freeze([]));
    }
    return Object.freeze({
      ...identity,
      validator: wrappedValidator(validate, this.options.maxValidationErrors),
    });
  }

  private registerAnnotations(document: PublishedRecordJsonSchemaDocument): void {
    for (const keyword of annotationKeywords(document)) {
      if (this.registeredKeywords.has(keyword)) {
        continue;
      }
      this.ajv.addKeyword({ keyword, errors: false, valid: true });
      this.registeredKeywords.add(keyword);
    }
  }
}

export function compileRecordJsonSchemaArtifact(
  document: RecordJsonSchemaDocument,
  options: Readonly<RecordJsonSchemaArtifactCompilerOptions>
): CompiledRecordJsonSchemaArtifact {
  return new RecordJsonSchemaArtifactCompiler(options).compile(document);
}
