import { Controllers as controllers, getValidatedApiRequest } from '../../index';
import type { BrandingModel, RecordSchemaService } from '../../index';
import type { RecordContractContextActor } from '../../record-contract';
import type { FormRecordAccessContext, FormRecordAccessRole, FormRecordAccessUser } from '../../services/FormsService';

type RecordSchemaResolver = Pick<
  RecordSchemaService.Services.RecordSchema,
  'resolveCreate' | 'resolveUpdate' | 'resolveImmutable'
>;

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

function isFormRecordAccessRole(value: unknown): value is FormRecordAccessRole {
  return isObjectRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.name);
}

function isFormRecordAccessUser(value: unknown): value is FormRecordAccessUser {
  return (
    isObjectRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.username) &&
    isNonEmptyString(value.type) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.email) &&
    Array.isArray(value.roles) &&
    value.roles.every(isFormRecordAccessRole)
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

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
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

    private authenticatedUser(req: Sails.Req): FormRecordAccessUser {
      if (!isFormRecordAccessUser(req.user)) {
        throw new Error('Authenticated user context is required.');
      }
      return req.user;
    }

    private actor(user: FormRecordAccessUser): RecordContractContextActor {
      const roleNames = user.roles.map(role => role.name.trim()).filter(Boolean);
      return {
        authenticated: true,
        roles: [...new Set(roleNames)].sort(),
      };
    }

    private caller(user: FormRecordAccessUser, brand: BrandingModel): FormRecordAccessContext {
      return {
        brand,
        user,
      };
    }

    private brand(branding: string): BrandingModel {
      const brand = BrandingService.getBrand(branding);
      if (!brand || typeof brand.id !== 'string' || brand.id.trim() === '') {
        throw new Error('Validated branding context could not be resolved.');
      }
      return brand;
    }

    private sendUnexpectedError(req: Sails.Req, res: Sails.Res, error: unknown) {
      return this.sendResp(req, res, {
        status: 500,
        errors: [this.asError(error)],
      });
    }

    private sendResolutionFailure(req: Sails.Req, res: Sails.Res) {
      return this.sendResp(req, res, {
        status: 500,
        errors: [new Error('Record schema resolution failed.')],
      });
    }

    public async create(req: Sails.Req, res: Sails.Res) {
      try {
        const user = this.authenticatedUser(req);
        const { params, query } = getValidatedApiRequest(req);
        const branding = this.normalizedRequired(params.branding);
        const brand = this.brand(branding);
        const result = await this.RecordSchemaService.resolveCreate({
          brand: brand.id.trim(),
          portal: this.normalizedRequired(params.portal),
          recordType: this.normalizedRequired(params.recordType),
          operation: this.normalizedOptional(query.operation),
          actor: this.actor(user),
        });
        if (result.kind === 'resolved' || result.kind === 'partial') {
          return this.sendResp(req, res, { data: result.document });
        }
        return this.sendResolutionFailure(req, res);
      } catch (error: unknown) {
        return this.sendUnexpectedError(req, res, error);
      }
    }

    public async update(req: Sails.Req, res: Sails.Res) {
      try {
        const user = this.authenticatedUser(req);
        const { params, query } = getValidatedApiRequest(req);
        const branding = this.normalizedRequired(params.branding);
        const brand = this.brand(branding);
        const result = await this.RecordSchemaService.resolveUpdate({
          brand: brand.id.trim(),
          portal: this.normalizedRequired(params.portal),
          oid: this.normalizedRequired(params.oid),
          operation: this.normalizedOptional(query.operation),
          caller: this.caller(user, brand),
        });
        if (result.kind === 'resolved' || result.kind === 'partial') {
          return this.sendResp(req, res, { data: result.document });
        }
        return this.sendResolutionFailure(req, res);
      } catch (error: unknown) {
        return this.sendUnexpectedError(req, res, error);
      }
    }

    public async immutable(req: Sails.Req, res: Sails.Res) {
      try {
        const user = this.authenticatedUser(req);
        const { params } = getValidatedApiRequest(req);
        const branding = this.normalizedRequired(params.branding);
        const brand = this.brand(branding);
        const result = await this.RecordSchemaService.resolveImmutable({
          brand: brand.id.trim(),
          portal: this.normalizedRequired(params.portal),
          digest: this.normalizedRequired(params.digest),
          caller: this.caller(user, brand),
        });
        if (result.kind === 'resolved') {
          return this.sendResp(req, res, { data: result.artifact.document });
        }
        return this.sendResolutionFailure(req, res);
      } catch (error: unknown) {
        return this.sendUnexpectedError(req, res, error);
      }
    }
  }
}
