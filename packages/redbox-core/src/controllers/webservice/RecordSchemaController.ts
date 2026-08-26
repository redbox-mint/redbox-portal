import { Controllers as controllers, getValidatedApiRequest } from '../../index';
import type { BrandingModel, RecordSchemaService, UserModel } from '../../index';
import type { RecordContractContextActor } from '../../record-contract';
import type { FormRecordAccessContext } from '../../services/FormsService';

type RecordSchemaResolver = Pick<
  RecordSchemaService.Services.RecordSchema,
  'resolveCreate' | 'resolveUpdate' | 'resolveImmutable'
>;

export namespace Controllers {
  /** Adapts validated record-schema HTTP requests to RecordSchemaService. */
  export class RecordSchema extends controllers.Core.Controller {
    public RecordSchemaService!: RecordSchemaResolver;

    protected override _exportedMethods: string[] = ['init', 'create', 'update', 'immutable'];

    public init(): void {
      this.RecordSchemaService = sails.services.recordschemaservice as unknown as RecordSchemaResolver;
    }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private normalizedRequired(value: unknown): string {
      return (value as string).trim();
    }

    private normalizedOptional(value: unknown): string | undefined {
      const normalized = typeof value === 'string' ? value.trim() : '';
      return normalized || undefined;
    }

    private actor(req: Sails.Req): RecordContractContextActor {
      const user = req.user;
      const username = typeof user?.username === 'string' ? user.username.trim() : '';
      const roleNames = Array.isArray(user?.roles)
        ? user.roles
            .map(role =>
              typeof role === 'string' ? role.trim() : typeof role?.name === 'string' ? role.name.trim() : ''
            )
            .filter(Boolean)
        : [];
      return {
        authenticated: username.length > 0,
        roles: [...new Set(roleNames)].sort(),
      };
    }

    private caller(req: Sails.Req, brand: BrandingModel): FormRecordAccessContext {
      return {
        brand,
        user: (req.user ?? {}) as UserModel,
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
        const { params, query } = getValidatedApiRequest(req);
        const branding = this.normalizedRequired(params.branding);
        const brand = this.brand(branding);
        const result = await this.RecordSchemaService.resolveCreate({
          brand: brand.id.trim(),
          portal: this.normalizedRequired(params.portal),
          recordType: this.normalizedRequired(params.recordType),
          operation: this.normalizedOptional(query.operation),
          actor: this.actor(req),
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
        const { params, query } = getValidatedApiRequest(req);
        const branding = this.normalizedRequired(params.branding);
        const brand = this.brand(branding);
        const result = await this.RecordSchemaService.resolveUpdate({
          brand: brand.id.trim(),
          portal: this.normalizedRequired(params.portal),
          oid: this.normalizedRequired(params.oid),
          operation: this.normalizedOptional(query.operation),
          caller: this.caller(req, brand),
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
        const { params, headers } = getValidatedApiRequest(req);
        const branding = this.normalizedRequired(params.branding);
        const brand = this.brand(branding);
        const result = await this.RecordSchemaService.resolveImmutable({
          brand: brand.id.trim(),
          portal: this.normalizedRequired(params.portal),
          digest: this.normalizedRequired(params.digest),
          caller: this.caller(req, brand),
          ifNoneMatch: this.normalizedOptional(headers?.['If-None-Match']),
        });
        if (result.kind === 'resolved' || result.kind === 'not-modified') {
          return this.sendResp(req, res, { data: result.artifact.document });
        }
        return this.sendResolutionFailure(req, res);
      } catch (error: unknown) {
        return this.sendUnexpectedError(req, res, error);
      }
    }
  }
}
