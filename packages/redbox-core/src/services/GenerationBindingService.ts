import type { FormRuntimeAction, GenerationRuntimeSession } from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import type { BrandingModel, UserModel } from '../model';
import { GenerationActorContext, GenerationError } from '../model/generation';
import type { GenerationBindingAttributes } from '../waterline-models/GenerationBinding';
import type { GenerationProfileVersionAttributes } from '../waterline-models/GenerationProfileVersion';
import { firstValueFrom } from 'rxjs';
import type { FormAttributes } from '../waterline-models/Form';
import { requireService, requireWaterlineRows } from './generation/require-service';

type RecordLike = { redboxOid?: string; metadata?: Record<string, unknown>; metaMetadata?: Record<string, unknown>; workflow?: Record<string, unknown> };
interface RecordsLike {
  getMeta(oid: string): Promise<RecordLike>;
  hasViewAccess(brand: BrandingModel, user: UserModel, roles: unknown[], record: RecordLike): boolean;
}
interface ProfileLike { resolvePublished(brandId: string, profileId: string): Promise<GenerationProfileVersionAttributes>; }
interface SchemaLike { validateTargets(definition: GenerationProfileVersionAttributes['definition'], form: NonNullable<FormAttributes['configuration']>): unknown; }

export interface GenerationActionContext {
  actor: GenerationActorContext;
  brand: BrandingModel;
  user: UserModel;
  record: RecordLike;
  formName?: string;
  mode: 'view' | 'edit';
}

export interface AuthorizedGenerationLaunch {
  binding: GenerationBindingAttributes;
  profileVersion: GenerationProfileVersionAttributes;
  source: RecordLike;
}

export namespace Services {
  export class GenerationBindingService extends services.Core.Service {
    protected override _exportedMethods = ['createOrUpdate', 'resolveActions', 'authorizeLaunch', 'buildInitialValues', 'resolveTargetSession', 'buildTargetUrl'];

    public async createOrUpdate(
      brandId: string,
      input: Omit<GenerationBindingAttributes, 'id' | 'brandId' | 'nameLower'>,
    ): Promise<GenerationBindingAttributes> {
      if (input.targetMode !== 'create' || input.maxSuccessfulRunsPerIntent !== 1 || input.allowMultipleTargetsPerSource !== true) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'The POC binding must be create-only, one-success-per-intent, and allow multiple targets per source');
      }
      if (!input.sourceRelationship?.metadataPointer || !String(input.sourceRelationship.metadataPointer).startsWith('/')) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'Generation source relationship mapping is invalid');
      }
      const profile = await GenerationProfile.findOne({ id: input.profileId, brandId });
      if (!profile) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Generation binding profile was not found');
      const profileService = requireService<ProfileLike>('generationprofileservice', ['resolvePublished']);
      const profileVersion = await profileService.resolvePublished(brandId, input.profileId);
      const sourceSlotId = String(input.sourceRelationship?.sourceSlotId ?? '');
      const sourceSlot = profileVersion.definition.sourceSlots.find((slot) => slot.id === sourceSlotId);
      if (!sourceSlot || sourceSlot.recordType !== input.sourceRecordType || !input.allowedRoles.length) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'Generation binding source or role allowlist is invalid');
      }
      const workflow = sails.config.workflow[input.targetRecordType];
      const starting = workflow && Object.values(workflow).find((stage) => stage.starting);
      const effectiveFormName = input.targetFormName ?? starting?.config.form;
      if (!starting || starting.config.workflow.stage !== input.targetStartingWorkflowStage || !effectiveFormName) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'Generation binding target workflow is invalid');
      }
      const targetForm = await firstValueFrom(FormsService.getFormByName(effectiveFormName, true, brandId)) as FormAttributes | null;
      if (!targetForm?.configuration) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Generation binding target form was not found');
      const schemaService = requireService<SchemaLike>('generationschemaservice', ['validateTargets']);
      schemaService.validateTargets(profileVersion.definition, targetForm.configuration);
      const values = { ...input, nameLower: input.name.trim().toLowerCase() };
      const existing = await GenerationBinding.findOne({ brandId, key: input.key });
      if (existing) {
        const updated = await GenerationBinding.updateOne({ id: existing.id, brandId }).set(values);
        if (!updated) throw new GenerationError('GENERATION_INVALID_STATE', 'Generation binding changed concurrently');
        return updated;
      }
      return GenerationBinding.create({ ...values, brandId }).fetch();
    }

    public async resolveActions(context: GenerationActionContext): Promise<FormRuntimeAction[]> {
      if (!sails.config.generation.enabled) return [];
      const sourceType = String(context.record.metaMetadata?.type ?? '');
      if (!sourceType) return [];
      const bindings = requireWaterlineRows<GenerationBindingAttributes>(
        await GenerationBinding.find({ brandId: context.actor.brandId, sourceRecordType: sourceType, enabled: true }),
        'GenerationBinding',
      );
      const actions: FormRuntimeAction[] = [];
      for (const binding of bindings) {
        try {
          this.assertBindingContext(binding, context);
          const profileService = requireService<ProfileLike>('generationprofileservice', ['resolvePublished']);
          await profileService.resolvePublished(context.actor.brandId, binding.profileId);
          if (!this.canCreateTarget(binding, context.actor.roles)) continue;
          const action = binding.action;
          actions.push({
            id: binding.key,
            bindingKey: binding.key,
            kind: 'generation.launch',
            labelKey: String(action.labelKey ?? 'generation-action-create'),
            helpTextKey: typeof action.helpTextKey === 'string' ? action.helpTextKey : undefined,
            icon: typeof action.icon === 'string' ? action.icon : undefined,
            placement: typeof action.placement === 'string' ? action.placement : undefined,
            order: Number(action.order ?? 0),
            sourceOid: String(context.record.redboxOid ?? ''),
          });
        } catch (error) {
          if (!(error instanceof GenerationError)) throw error;
        }
      }
      return actions.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    }

    public async authorizeLaunch(input: {
      actor: GenerationActorContext;
      brand: BrandingModel;
      user: UserModel;
      bindingKey: string;
      sourceOid: string;
      mode?: 'view' | 'edit';
    }): Promise<AuthorizedGenerationLaunch> {
      if (!sails.config.generation.enabled) throw new GenerationError('GENERATION_NOT_CONFIGURED', 'Generation is disabled');
      const binding = await GenerationBinding.findOne({ brandId: input.actor.brandId, key: input.bindingKey, enabled: true });
      if (!binding) throw new GenerationError('GENERATION_ACTION_NOT_AVAILABLE', 'Generation action is not available');
      const records = requireService<RecordsLike>('recordsservice', ['getMeta', 'hasViewAccess']);
      const source = await records.getMeta(input.sourceOid);
      if (!source || String(source.metaMetadata?.brandId ?? '') !== input.actor.brandId ||
        !records.hasViewAccess(input.brand, input.user, input.user.roles, source)) {
        throw new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Generation source is not available');
      }
      const context: GenerationActionContext = {
        actor: input.actor, brand: input.brand, user: input.user, record: source,
        formName: String(source.metaMetadata?.form ?? ''), mode: input.mode ?? 'view',
      };
      this.assertBindingContext(binding, context);
      if (!this.canCreateTarget(binding, input.actor.roles)) throw new GenerationError('GENERATION_TARGET_FORBIDDEN', 'Target record cannot be created');
      const profileService = requireService<ProfileLike>('generationprofileservice', ['resolvePublished']);
      const profileVersion = await profileService.resolvePublished(input.actor.brandId, binding.profileId);
      return { binding, profileVersion, source };
    }

    public buildInitialValues(binding: GenerationBindingAttributes, sourceOid: string): GenerationRuntimeSession['initialValues'] {
      const pointer = String(binding.sourceRelationship?.metadataPointer ?? '');
      if (!pointer.startsWith('/')) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Generation relationship mapping is invalid');
      return [{ metadataPointer: pointer, value: sourceOid }];
    }

    public async resolveTargetSession(
      actor: GenerationActorContext,
      runId: string,
      targetRecordType: string,
      targetFormName?: string,
    ): Promise<GenerationRuntimeSession> {
      const run = await GenerationRun.findOne({ id: runId, brandId: actor.brandId, initiatedByUserId: actor.userId });
      if (!run || run.status === 'expired' || run.status === 'cancelled') throw new GenerationError('GENERATION_ACTION_NOT_AVAILABLE', 'Generation session was not found');
      const binding = await GenerationBinding.findOne({ id: run.bindingId, brandId: actor.brandId });
      if (!binding || binding.targetRecordType !== targetRecordType ||
        (binding.targetFormName && targetFormName && binding.targetFormName !== targetFormName)) {
        throw new GenerationError('GENERATION_TARGET_FORBIDDEN', 'Generation session does not match this target form');
      }
      return {
        runId: run.id, bindingKey: binding.key, autoOpen: run.status !== 'committed',
        initialValues: this.buildInitialValues(binding, run.sourceRefs[0]?.oid ?? ''),
      };
    }

    public buildTargetUrl(binding: GenerationBindingAttributes, actor: GenerationActorContext, runId: string): string {
      const base = `/${encodeURIComponent(actor.branding)}/${encodeURIComponent(actor.portal)}/record/${encodeURIComponent(binding.targetRecordType)}/edit`;
      const params = new URLSearchParams({ generationRunId: runId });
      if (binding.targetFormName) params.set('formName', binding.targetFormName);
      return `${base}?${params.toString()}`;
    }

    private assertBindingContext(binding: GenerationBindingAttributes, context: GenerationActionContext): void {
      const recordType = String(context.record.metaMetadata?.type ?? '');
      const workflow = String(context.record.workflow?.stage ?? context.record.metaMetadata?.workflowStage ?? '');
      if (binding.sourceRecordType !== recordType ||
        (binding.sourceModes?.length && !binding.sourceModes.includes(context.mode)) ||
        (binding.sourceWorkflowStages?.length && !binding.sourceWorkflowStages.includes(workflow)) ||
        (binding.allowedRoles?.length && !context.actor.roles.some((role) => binding.allowedRoles.includes(role)))) {
        throw new GenerationError('GENERATION_ACTION_NOT_AVAILABLE', 'Generation binding does not match this record');
      }
    }

    private canCreateTarget(binding: GenerationBindingAttributes, actorRoles: string[]): boolean {
      const workflow = sails.config.workflow[binding.targetRecordType];
      const starting = workflow && Object.values(workflow).find((stage) => stage.starting);
      if (!starting || starting.config.workflow.stage !== binding.targetStartingWorkflowStage) return false;
      return actorRoles.some((role) => starting.config.authorization.editRoles.includes(role));
    }
  }
}
