import { schemaProblem, createSchemaFailure, updateSchemaFailure, immutableSchemaFailure, schemaResponseHeaders, type RecordSchemaProblemKind, type RecordSchemaControllerLogContext } from '../../api-routes/schemaDelivery';
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
    ): RecordSchemaProblem {return schemaProblem(kind,instance,code);}

    private sendRawProblem(req:Sails.Req,res:Sails.Res,problem:RecordSchemaProblem) {
return this.sendResp(req,res,{format:'raw-json',mediaType:RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,status:problem.status,data:problem,headers:{'Cache-Control':RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,Vary:RECORD_SCHEMA_RESPONSE_VARY}});
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

    private sendCreateFailure(req: Sails.Req, res: Sails.Res, instance: string, result: ResolveCreateFailure) {return this.sendRawProblem(req,res,createSchemaFailure(instance,result));}

    private sendUpdateFailure(req: Sails.Req, res: Sails.Res, instance: string, result: ResolveUpdateFailure) {return this.sendRawProblem(req,res,updateSchemaFailure(instance,result));}

    private sendImmutableFailure(req: Sails.Req, res: Sails.Res, instance: string, result: ResolveImmutableFailure) {return this.sendRawProblem(req,res,immutableSchemaFailure(instance,result));}

    private sendContextFailure(
      req: Sails.Req,
      res: Sails.Res,
      instance: string,
      failureKind: 'invalid-request' | 'not-found' | 'forbidden' | 'not-resolvable' | 'unavailable'
    ) {
      return this.sendProblem(req, res, failureKind, instance);
    }

    private responseHeaders(etag: RecordJsonSchemaEtag, canonicalUrl?: string): Record<string, string> {return schemaResponseHeaders(etag,canonicalUrl);}

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
