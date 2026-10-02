import type { GenerationCommitRequest, GenerationExecuteRequest, GenerationRunView } from '@researchdatabox/sails-ng-common';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { receiveSingleFile, isUploadSizeError, SkipperUploadedFile } from './BrandingControllerSupport';
import { Controllers as controllers } from '../CoreController';
import type { BrandingModel, UserModel } from '../index';
import {
  asGenerationError,
  GenerationActorContext,
  GenerationError,
} from '../model/generation';
import { requireService } from '../services/generation/require-service';

interface GenerationRunServiceLike {
  launch(input: {
    actor: GenerationActorContext;
    brand: BrandingModel;
    user: UserModel;
    bindingKey: string;
    sourceOid?: string;
  }): Promise<unknown>;
  getForActor(actor: GenerationActorContext, runId: string): Promise<unknown>;
  addDocument(actor: GenerationActorContext, runId: string, filename: string, bytes: Buffer): Promise<GenerationRunView>;
  removeDocument(actor: GenerationActorContext, runId: string, documentId: string): Promise<GenerationRunView>;
  execute(input: GenerationExecuteRequest & {
    actor: GenerationActorContext;
    brand: BrandingModel;
    user: UserModel;
    runId: string;
  }): Promise<unknown>;
  requestCancel(actor: GenerationActorContext, runId: string): Promise<unknown>;
  commit(
    actor: GenerationActorContext,
    user: UserModel,
    brand: BrandingModel,
    runId: string,
    request: GenerationCommitRequest,
  ): Promise<unknown>;
}

interface GenerationProvenanceServiceLike {
  getForRecord(actor: GenerationActorContext, user: UserModel, brand: BrandingModel, oid: string): Promise<unknown>;
  review(actor: GenerationActorContext, user: UserModel, brand: BrandingModel, provenanceId: string): Promise<unknown>;
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredString(value: unknown, name: string): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result) {
    throw new GenerationError('GENERATION_REQUEST_INVALID', `${name} is required`);
  }
  return result;
}

export namespace Controllers {
  export class Generation extends controllers.Core.Controller {
    protected override _exportedMethods = [
      'launch',
      'getRun',
      'execute',
      'cancel',
      'commit',
      'getProvenance',
      'reviewProvenance',
      'addDocument',
      'removeDocument',
    ];

    public async launch(req: Sails.Req, res: Sails.Res) {
      return this.respondGeneration(req, res, async (actor, user, brand) => {
        const body = asObject(req.body);
        return {
          status: 201,
          data: await this.runService.launch({
            actor,
            user,
            brand,
            bindingKey: requiredString(body.bindingKey, 'bindingKey'),
            ...(body.sourceOid !== undefined ? { sourceOid: requiredString(body.sourceOid, 'sourceOid') } : {}),
          }),
        };
      });
    }

    public async getRun(req: Sails.Req, res: Sails.Res) {
      return this.respondGeneration(req, res, async (actor) => ({
        data: await this.runService.getForActor(actor, requiredString(req.param('id'), 'run id')),
      }));
    }

    public async addDocument(req: Sails.Req, res: Sails.Res) {
      return this.respondGeneration(req, res, async (actor) => {
        const runId = requiredString(req.param('id'), 'run id');
        const service = requireService<GenerationRunServiceLike>('generationrunservice', ['getForActor', 'addDocument']);
        // Authorise before accepting/parsing the upload; the service rechecks before extraction.
        await service.getForActor(actor, runId);
        const files: SkipperUploadedFile[] = [];
        const directory = await mkdtemp(join(tmpdir(), 'redbox-generation-'));
        try {
          await receiveSingleFile(req, 'document', sails.config.generation.documents.maxFileBytes, files, directory);
          if (files.length !== 1) throw new GenerationError('GENERATION_DOCUMENT_INVALID', 'Upload one document at a time');
          const bytes = await readFile(files[0].fd);
          try {
            return { status: 201, data: await service.addDocument(actor, runId, files[0].filename ?? '', bytes) };
          } finally { bytes.fill(0); }
        } catch (error) {
          if (isUploadSizeError(error)) throw new GenerationError('GENERATION_DOCUMENT_LIMIT', 'Upload exceeds its limit');
          throw error;
        } finally {
          await Promise.all([
            ...files.map((file) => rm(file.fd, { force: true })),
            rm(directory, { recursive: true, force: true }),
          ]);
        }
      });
    }

    public async removeDocument(req: Sails.Req, res: Sails.Res) {
      return this.respondGeneration(req, res, async (actor) => ({
        data: await requireService<GenerationRunServiceLike>('generationrunservice', ['removeDocument']).removeDocument(
          actor, requiredString(req.param('id'), 'run id'), requiredString(req.param('documentId'), 'document id'),
        ),
      }));
    }

    public async execute(req: Sails.Req, res: Sails.Res) {
      return this.respondGeneration(req, res, async (actor, user, brand) => {
        const body = asObject(req.body);
        const targetForm = asObject(body.targetForm);
        if (!Array.isArray(body.answers) || asObject(body.targetDraft) !== body.targetDraft || targetForm.mode !== 'create') {
          throw new GenerationError('GENERATION_REQUEST_INVALID', 'Generation execution request is invalid');
        }
        return {
          status: 202,
          data: await this.runService.execute({
            actor,
            user,
            brand,
            runId: requiredString(req.param('id'), 'run id'),
            answers: body.answers as GenerationExecuteRequest['answers'],
            targetForm: {
              recordType: requiredString(targetForm.recordType, 'targetForm.recordType'),
              ...(typeof targetForm.formName === 'string' && targetForm.formName.trim()
                ? { formName: targetForm.formName.trim() }
                : {}),
              mode: 'create',
            },
            targetDraft: body.targetDraft as Record<string, unknown>,
            ...(body.sourceOid !== undefined ? { sourceOid: body.sourceOid === null ? null : requiredString(body.sourceOid, 'sourceOid') } : {}),
            ...(body.documentIds !== undefined ? { documentIds: body.documentIds as string[] } : {}),
            ...(body.documentsReviewed === true ? { documentsReviewed: true } : {}),
            ...(body.documentNotes !== undefined ? { documentNotes: body.documentNotes as string } : {}),
          }),
        };
      });
    }

    public async cancel(req: Sails.Req, res: Sails.Res) {
      return this.respondGeneration(req, res, async (actor) => ({
        data: await this.runService.requestCancel(actor, requiredString(req.param('id'), 'run id')),
      }));
    }

    public async commit(req: Sails.Req, res: Sails.Res) {
      return this.respondGeneration(req, res, async (actor, user, brand) => {
        const body = asObject(req.body);
        if (!Array.isArray(body.reviewedFieldIds) || body.reviewedFieldIds.some((id) => typeof id !== 'string')) {
          throw new GenerationError('GENERATION_COMMIT_INVALID', 'Generation commit request is invalid');
        }
        return {
          data: await this.runService.commit(actor, user, brand, requiredString(req.param('id'), 'run id'), {
            targetOid: requiredString(body.targetOid, 'targetOid'),
            candidateDigest: requiredString(body.candidateDigest, 'candidateDigest'),
            reviewedFieldIds: body.reviewedFieldIds as string[],
          }),
        };
      });
    }

    public async getProvenance(req: Sails.Req, res: Sails.Res) {
      return this.respondGeneration(req, res, async (actor, user, brand) => ({
        data: await this.provenanceService.getForRecord(
          actor,
          user,
          brand,
          requiredString(req.param('oid'), 'record oid'),
        ),
      }));
    }

    public async reviewProvenance(req: Sails.Req, res: Sails.Res) {
      return this.respondGeneration(req, res, async (actor, user, brand) => ({
        data: await this.provenanceService.review(
          actor,
          user,
          brand,
          requiredString(req.param('id'), 'provenance id'),
        ),
      }));
    }

    private get runService(): GenerationRunServiceLike {
      return requireService<GenerationRunServiceLike>('generationrunservice', ['launch', 'getForActor', 'execute', 'requestCancel', 'commit']);
    }

    private get provenanceService(): GenerationProvenanceServiceLike {
      return requireService<GenerationProvenanceServiceLike>('generationprovenanceservice', ['getForRecord', 'review']);
    }

    private requestContext(req: Sails.Req): {
      actor: GenerationActorContext;
      user: UserModel;
      brand: BrandingModel;
    } {
      const user = req.user as UserModel | undefined;
      const brand = BrandingService.getBrand(String(req.session.branding ?? ''));
      if (!user?.id || !brand?.id) {
        throw new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'An authenticated brand session is required');
      }
      return {
        user,
        brand,
        actor: {
          brandId: String(brand.id),
          branding: String(req.param('branding') ?? brand.name),
          portal: String(req.param('portal') ?? req.session.portal ?? ''),
          userId: String(user.id),
          username: String(user.username),
          roles: (user.roles ?? []).map((role) => String(role.name ?? '')).filter(Boolean),
        },
      };
    }

    private async respondGeneration(
      req: Sails.Req,
      res: Sails.Res,
      operation: (
        actor: GenerationActorContext,
        user: UserModel,
        brand: BrandingModel,
      ) => Promise<{ data: unknown; status?: number }>,
    ) {
      try {
        const { actor, user, brand } = this.requestContext(req);
        const response = await operation(actor, user, brand);
        return this.sendResp(req, res, response);
      } catch (error) {
        const safe = asGenerationError(error);
        if (!(error instanceof GenerationError)) {
          this.logger.error('Generation request failed', error);
        }
        return this.sendResp(req, res, {
          status: safe.status,
          data: { error: safe.toSafeJSON() },
          displayErrors: [{ code: safe.code, detail: `generation-error-${safe.code.toLowerCase().replaceAll('_', '-')}` }],
          v1: { error: safe.toSafeJSON() },
        });
      }
    }
  }
}
