import { GenerationError } from '../../model/generation';
import type { GenerationRunAttributes } from '../../waterline-models/GenerationRun';
import { requireService } from './require-service';

/** Repeat actor, target, and source authorization when reading or executing a run. */
export async function authorizeRun(run: GenerationRunAttributes): Promise<void> {
  const user = await User.findOne({ id: run.initiatedByUserId }).populate('roles');
  const brand = BrandingService.getBrandById(run.brandId);
  const binding = await GenerationBinding.findOne({ id: run.bindingId, brandId: run.brandId });
  const workflow = binding ? sails.config.workflow[binding.targetRecordType] : undefined;
  const starting = workflow && Object.values(workflow).find(stage => stage.starting);
  const roles =
    user && typeof user === 'object' && Array.isArray(Reflect.get(user, 'roles'))
      ? (Reflect.get(user, 'roles') as unknown[])
      : [];
  const roleNames = roles.map(role =>
    role && typeof role === 'object' ? String(Reflect.get(role, 'name') ?? '') : ''
  );
  if (
    !user ||
    !brand ||
    !binding?.enabled ||
    binding.targetRecordType !== run.targetDescriptor.recordType ||
    !binding.allowedRoles.some(role => roleNames.includes(role)) ||
    !starting ||
    starting.config.workflow.stage !== binding.targetStartingWorkflowStage ||
    !starting.config.authorization.editRoles.some(role => roleNames.includes(role))
  ) {
    throw new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Generation authorization changed');
  }
  if (!run.sourceRefs.length) {
    const profile = await GenerationProfileVersion.findOne({ id: run.profileVersionId, brandId: run.brandId });
    if (!profile?.definition.documentSources || profile.definition.sourceSlots.some(slot => slot.required !== false)) {
      throw new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Generation requires a source record');
    }
    return;
  }
  const records = requireService<{
    getMeta(oid: string): Promise<{ metaMetadata?: Record<string, unknown> }>;
    hasViewAccess(brand: unknown, user: unknown, roles: unknown[], record: unknown): boolean;
  }>('recordsservice', ['getMeta', 'hasViewAccess']);
  for (const source of run.sourceRefs) {
    const record = await records.getMeta(source.oid);
    if (
      !record ||
      String(record.metaMetadata?.brandId ?? '') !== run.brandId ||
      binding.sourceRecordType !== source.recordType ||
      String(record.metaMetadata?.type ?? '') !== source.recordType ||
      !records.hasViewAccess(brand, user, roles, record)
    ) {
      throw new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Generation source authorization changed');
    }
  }
}
