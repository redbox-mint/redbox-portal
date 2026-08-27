import { Controllers as controllers, getValidatedApiRequest } from '../../index';
import type { BrandingModel, RecordSchemaService } from '../../index';
import {
  buildRecordSchemaInvalidRequestProblem,
  recordSchemaCanonicalLink,
  recordSchemaCreateResolverUrl,
  recordSchemaImmutableUrl,
  recordSchemaUpdateResolverUrl,
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_VARY,
} from '../../api-routes/record-schema-response';
import type { BuildRawJsonResponseType, RecordSchemaProblem, RecordSchemaProblemStatus } from '../../model';
import {
  RECORD_SCHEMA_PROBLEM_CODES,
  type RecordJsonSchemaEtag,
  type RecordSchemaProblemCode,
} from '../../record-contract';
import type { FormRecordAccessContext, FormRecordAccessUser } from '../../services/FormsService';
import { isFormRecordAccessUser } from '../../services/form-record-access-user';

type RecordSchemaResolver = Pick<
  RecordSchemaService.Services.RecordSchema,
  'resolveCreate' | 'resolveUpdate' | 'resolveImmutable'
>;

type ResolveCreateResult = Awaited<ReturnType<RecordSchemaResolver['resolveCreate']>>;
type ResolveUpdateResult = Awaited<ReturnType<RecordSchemaResolver['resolveUpdate']>>;
type ResolveImmutableResult = Awaited<ReturnType<RecordSchemaResolver['resolveImmutable']>>;
type ResolveCreateFailure = Exclude<ResolveCreateResult, { readonly kind: 'resolved' | 'partial' }>;
type ResolveUpdateFailure = Exclude<ResolveUpdateResult, { readonly kind: 'resolved' | 'partial' }>;
type ResolveImmutableFailure = Exclude<ResolveImmutableResult, { readonly kind: 'resolved' | 'not-modified' }>;

type RecordSchemaProblemKind =
  | 'invalid-request'
  | 'authentication-required'
  | 'forbidden'
  | 'not-found'
  | 'not-resolvable'
  | 'limit-exceeded'
  | 'invalid-contract'
  | 'unavailable';

type RecordSchemaMappedProblemKind = Exclude<RecordSchemaProblemKind, 'invalid-request'>;
type RecordSchemaControllerLogContext = 'controller-create' | 'controller-update' | 'controller-immutable';

interface RecordSchemaProblemDescriptor {
  readonly type: string;
  readonly title: string;
  readonly status: RecordSchemaProblemStatus;
  readonly detail: string;
  readonly code: RecordSchemaProblemCode;
}

const RECORD_SCHEMA_PROBLEMS: Readonly<Record<RecordSchemaMappedProblemKind, RecordSchemaProblemDescriptor>> = {
  'authentication-required': {
    type: 'https://redboxresearchdata.com/problems/record-schema-authentication-required',
    title: 'Authentication is required',
    status: 401,
    detail: 'Authentication is required to resolve a record schema.',
    code: RECORD_SCHEMA_PROBLEM_CODES.AUTHENTICATION_REQUIRED,
  },
  forbidden: {
    type: 'https://redboxresearchdata.com/problems/record-schema-forbidden',
    title: 'Record schema request is not authorized',
    status: 403,
    detail: 'The record schema request is not authorized.',
    code: RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN,
  },
  'not-found': {
    type: 'https://redboxresearchdata.com/problems/record-schema-not-found',
    title: 'Record schema was not found',
    status: 404,
    detail: 'No accessible record schema or resolution context was found.',
    code: RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND,
  },
  'not-resolvable': {
    type: 'https://redboxresearchdata.com/problems/record-schema-not-resolvable',
    title: 'Record schema could not be resolved',
    status: 409,
    detail: 'The record schema could not be resolved from the authoritative context.',
    code: RECORD_SCHEMA_PROBLEM_CODES.NOT_RESOLVABLE,
  },
  'limit-exceeded': {
    type: 'https://redboxresearchdata.com/problems/record-schema-limit-exceeded',
    title: 'Record schema limit exceeded',
    status: 413,
    detail: 'The record schema exceeds configured complexity or output limits.',
    code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
  },
  'invalid-contract': {
    type: 'https://redboxresearchdata.com/problems/record-schema-invalid-contract',
    title: 'Record schema contract is invalid',
    status: 422,
    detail: 'The record schema contract is invalid.',
    code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
  },
  unavailable: {
    type: 'https://redboxresearchdata.com/problems/record-schema-unavailable',
    title: 'Record schema is unavailable',
    status: 503,
    detail: 'The record schema capability is temporarily unavailable.',
    code: RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE,
  },
};

function assertNever(value: never): never {
  throw new Error(`Unexpected record schema result kind: ${String(value)}`);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecordSchemaResolver(value: unknown): value is RecordSchemaResolver {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  return (
    typeof Reflect.get(value, 'resolveCreate') === 'function' &&
    typeof Reflect.get(value, 'resolveUpdate') === 'function' &&
    typeof Reflect.get(value, 'resolveImmutable') === 'function'
  );
}

export namespace Controllers {
  /** Adapts validated record-schema HTTP requests to RecordSchemaService. */
  export class RecordSchema extends controllers.Core.Controller {
    public RecordSchemaService!: RecordSchemaResolver;

    protected override _exportedMethods: string[] = ['init', 'create', 'update', 'immutable'];

    public init(): void {
      const service = sails.services.recordschemaservice;
      if (!isRecordSchemaResolver(service)) {
        throw new Error('Record schema resolver service is unavailable.');
      }
      this.RecordSchemaService = service;
    }

    private normalizedRequired(value: unknown): string {
      if (!isNonEmptyString(value)) {
        throw new Error('Validated request string is required.');
      }
      return value.trim();
    }

    private normalizedOptional(value: unknown): string | undefined {
      const normalized = typeof value === 'string' ? value.trim() : '';
      return normalized || undefined;
    }

    private authenticatedUser(req: Sails.Req): FormRecordAccessUser | undefined {
      return isFormRecordAccessUser(req.user) ? req.user : undefined;
    }

    private caller(user: FormRecordAccessUser, brand: BrandingModel): FormRecordAccessContext {
      return {
        brand,
        user,
      };
    }

    private brand(branding: string): BrandingModel | undefined {
      const brand = BrandingService.getBrand(branding);
      if (brand === undefined || brand === null) {
        return undefined;
      }
      if (typeof brand.id !== 'string' || brand.id.trim() === '') {
        throw new Error('Validated branding context could not be resolved.');
      }
      return brand;
    }

    private problem(
      kind: RecordSchemaProblemKind,
      instance: string,
      code?: RecordSchemaProblemCode
    ): RecordSchemaProblem {
      if (kind === 'invalid-request') {
        return buildRecordSchemaInvalidRequestProblem(instance, code);
      }

      return {
        ...RECORD_SCHEMA_PROBLEMS[kind],
        instance,
        code: code === undefined ? RECORD_SCHEMA_PROBLEMS[kind].code : code,
      };
    }

    private sendProblem(
      req: Sails.Req,
      res: Sails.Res,
      kind: RecordSchemaProblemKind,
      instance: string,
      code?: RecordSchemaProblemCode
    ) {
      const problem = this.problem(kind, instance, code);
      return this.sendResp(req, res, {
        format: 'raw-json',
        mediaType: RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
        status: problem.status,
        data: problem,
        headers: {
          'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
          Vary: RECORD_SCHEMA_RESPONSE_VARY,
        },
      });
    }

    private sendUnexpectedError(
      req: Sails.Req,
      res: Sails.Res,
      instance: string,
      context: RecordSchemaControllerLogContext,
      error: unknown
    ) {
      try {
        sails.log.error(
          'record_schema_unexpected_failure',
          Object.freeze({
            event: 'record_schema_unexpected_failure',
            context,
            error_type: error instanceof Error ? 'error' : 'non-error',
          })
        );
      } catch {
        // Logging must never alter the sanitized failure response.
      }
      return this.sendProblem(req, res, 'unavailable', instance);
    }

    private sendCreateFailure(req: Sails.Req, res: Sails.Res, instance: string, result: ResolveCreateFailure) {
      switch (result.kind) {
        case 'context-failed':
          return this.sendContextFailure(req, res, instance, result.failureKind);
        case 'compiler-failed':
        case 'meta-validation-failed':
          return this.sendProblem(req, res, 'invalid-contract', instance, result.code);
        case 'limit-exceeded':
          return this.sendProblem(req, res, 'limit-exceeded', instance, result.code);
        case 'storage-failed':
        case 'unavailable':
          return this.sendProblem(req, res, 'unavailable', instance, result.code);
        default:
          return assertNever(result);
      }
    }

    private sendUpdateFailure(req: Sails.Req, res: Sails.Res, instance: string, result: ResolveUpdateFailure) {
      switch (result.kind) {
        case 'context-failed':
          return this.sendContextFailure(req, res, instance, result.failureKind);
        case 'denied':
        case 'missing-oid':
          return this.sendProblem(req, res, 'not-found', instance);
        case 'invalid-precondition':
          return this.sendProblem(req, res, 'invalid-request', instance, result.code);
        case 'precondition-failed':
          return this.sendProblem(req, res, 'not-resolvable', instance, result.code);
        case 'compiler-failed':
        case 'meta-validation-failed':
          return this.sendProblem(req, res, 'invalid-contract', instance, result.code);
        case 'limit-exceeded':
          return this.sendProblem(req, res, 'limit-exceeded', instance, result.code);
        case 'storage-failed':
        case 'unavailable':
          return this.sendProblem(req, res, 'unavailable', instance, result.code);
        default:
          return assertNever(result);
      }
    }

    private sendImmutableFailure(req: Sails.Req, res: Sails.Res, instance: string, result: ResolveImmutableFailure) {
      switch (result.kind) {
        case 'invalid-request':
          return this.sendProblem(req, res, 'invalid-request', instance, result.problem.code);
        case 'forbidden':
        case 'not-found':
          return this.sendProblem(req, res, 'not-found', instance);
        case 'not-resolvable':
          return this.sendProblem(req, res, 'not-resolvable', instance, result.problem.code);
        case 'limit-exceeded':
          return this.sendProblem(req, res, 'limit-exceeded', instance, result.problem.code);
        case 'invalid-contract':
          if (result.authorization !== 'authorized') {
            return this.sendProblem(req, res, 'not-found', instance);
          }
          return this.sendProblem(req, res, 'invalid-contract', instance, result.problem.code);
        case 'unavailable':
          return this.sendProblem(req, res, 'unavailable', instance, result.problem.code);
        default:
          return assertNever(result);
      }
    }

    private sendContextFailure(
      req: Sails.Req,
      res: Sails.Res,
      instance: string,
      failureKind: 'invalid-request' | 'not-found' | 'forbidden' | 'not-resolvable' | 'unavailable'
    ) {
      return this.sendProblem(req, res, failureKind, instance);
    }

    private responseHeaders(etag: RecordJsonSchemaEtag, canonicalUrl?: string): Record<string, string> {
      const headers: Record<string, string> = {
        ETag: etag,
        'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
        Vary: RECORD_SCHEMA_RESPONSE_VARY,
      };
      if (canonicalUrl !== undefined) {
        headers.Link = recordSchemaCanonicalLink(canonicalUrl);
      }
      return headers;
    }

    private sendSchema(
      req: Sails.Req,
      res: Sails.Res,
      document: BuildRawJsonResponseType['data'],
      etag: RecordJsonSchemaEtag,
      canonicalUrl?: string
    ) {
      return this.sendResp(req, res, {
        format: 'raw-json',
        mediaType: RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
        data: document,
        headers: this.responseHeaders(etag, canonicalUrl),
      });
    }

    private sendNotModified(req: Sails.Req, res: Sails.Res, etag: RecordJsonSchemaEtag, canonicalUrl?: string) {
      return this.sendResp(req, res, {
        status: 304,
        headers: this.responseHeaders(etag, canonicalUrl),
      });
    }

    private matchesIfNoneMatch(value: unknown, etag: RecordJsonSchemaEtag): boolean {
      return this.normalizedOptional(value) === etag;
    }

    public async create(req: Sails.Req, res: Sails.Res) {
      let instance = '/api/records/schemas/create';
      try {
        const { params, query, headers = {} } = getValidatedApiRequest(req);
        const branding = this.normalizedRequired(params.branding);
        const portal = this.normalizedRequired(params.portal);
        const recordType = this.normalizedRequired(params.recordType);
        const rootContext = BrandingService.getRootContext();
        instance = recordSchemaCreateResolverUrl(branding, portal, recordType, rootContext);
        const user = this.authenticatedUser(req);
        if (!user) return this.sendProblem(req, res, 'authentication-required', instance);
        const brand = this.brand(branding);
        if (!brand) return this.sendProblem(req, res, 'not-found', instance);
        const result = await this.RecordSchemaService.resolveCreate({
          brand: brand.id.trim(),
          branding,
          portal,
          recordType,
          operation: this.normalizedOptional(query.operation),
          caller: this.caller(user, brand),
        });
        if (result.kind === 'resolved' || result.kind === 'partial') {
          const canonicalUrl = recordSchemaImmutableUrl(branding, portal, result.digest, rootContext);
          if (this.matchesIfNoneMatch(headers['If-None-Match'], result.metadata.etag)) {
            return this.sendNotModified(req, res, result.metadata.etag, canonicalUrl);
          }
          return this.sendSchema(req, res, result.document, result.metadata.etag, canonicalUrl);
        }
        return this.sendCreateFailure(req, res, instance, result);
      } catch (error: unknown) {
        return this.sendUnexpectedError(req, res, instance, 'controller-create', error);
      }
    }

    public async update(req: Sails.Req, res: Sails.Res) {
      let instance = '/api/records/schemas/update';
      try {
        const { params, query, headers = {} } = getValidatedApiRequest(req);
        const branding = this.normalizedRequired(params.branding);
        const portal = this.normalizedRequired(params.portal);
        const oid = this.normalizedRequired(params.oid);
        const rootContext = BrandingService.getRootContext();
        instance = recordSchemaUpdateResolverUrl(branding, portal, oid, rootContext);
        const user = this.authenticatedUser(req);
        if (!user) return this.sendProblem(req, res, 'authentication-required', instance);
        const brand = this.brand(branding);
        if (!brand) return this.sendProblem(req, res, 'not-found', instance);
        const result = await this.RecordSchemaService.resolveUpdate({
          brand: brand.id.trim(),
          branding,
          portal,
          oid,
          operation: this.normalizedOptional(query.operation),
          caller: this.caller(user, brand),
        });
        if (result.kind === 'resolved' || result.kind === 'partial') {
          const canonicalUrl = recordSchemaImmutableUrl(branding, portal, result.digest, rootContext);
          if (this.matchesIfNoneMatch(headers['If-None-Match'], result.metadata.etag)) {
            return this.sendNotModified(req, res, result.metadata.etag, canonicalUrl);
          }
          return this.sendSchema(req, res, result.document, result.metadata.etag, canonicalUrl);
        }
        return this.sendUpdateFailure(req, res, instance, result);
      } catch (error: unknown) {
        return this.sendUnexpectedError(req, res, instance, 'controller-update', error);
      }
    }

    public async immutable(req: Sails.Req, res: Sails.Res) {
      let instance = '/api/records/schemas';
      try {
        const { params, headers = {} } = getValidatedApiRequest(req);
        const branding = this.normalizedRequired(params.branding);
        const portal = this.normalizedRequired(params.portal);
        const digest = this.normalizedRequired(params.digest);
        instance = recordSchemaImmutableUrl(branding, portal, digest, BrandingService.getRootContext());
        const user = this.authenticatedUser(req);
        if (!user) return this.sendProblem(req, res, 'authentication-required', instance);
        const brand = this.brand(branding);
        if (!brand) return this.sendProblem(req, res, 'not-found', instance);
        const result = await this.RecordSchemaService.resolveImmutable({
          brand: brand.id.trim(),
          branding,
          portal,
          digest,
          caller: this.caller(user, brand),
          ifNoneMatch: this.normalizedOptional(headers['If-None-Match']),
        });
        if (result.kind === 'resolved') {
          const etag: RecordJsonSchemaEtag = `"sha256:${result.artifact.digest}"`;
          return this.sendSchema(req, res, result.artifact.document, etag);
        }
        if (result.kind === 'not-modified') {
          const etag: RecordJsonSchemaEtag = `"sha256:${result.artifact.digest}"`;
          return this.sendNotModified(req, res, etag);
        }
        return this.sendImmutableFailure(req, res, instance, result);
      } catch (error: unknown) {
        return this.sendUnexpectedError(req, res, instance, 'controller-immutable', error);
      }
    }
  }
}
