import { normalizeRelatedReferences } from './references';
import { cloneDeep, set, toPath } from 'lodash';
import { firstValueFrom } from 'rxjs';
import type { RecordModel } from '../model';
import type { RecordsService, RelatedMetadataOperationOptions } from '../RecordsService';
import type { RelatedRecordReadContext } from './types';
import { normalizeRecordRelations } from '../config/recordtype.config';
import { withinRelatedResolutionDeadline } from './resolver';

export class RelatedHttpError extends Error {
  constructor(public readonly status: number) {
    super('Related metadata request failed');
  }
}

/** Only server-declared, metadata-relative reference paths may be overridden. */
export async function relatedHttpCandidate(
  input: { oid?: string; recordType?: string; relations: string[]; references?: Record<string, unknown> },
  context: RelatedRecordReadContext,
  service: RecordsService,
  startedAt = Date.now()
): Promise<{ root: RecordModel; options: RelatedMetadataOperationOptions }> {
  const bounded = <T>(work: () => Promise<T>) => withinRelatedResolutionDeadline(work, startedAt);
  let loadedRoot: RecordModel | undefined;
  const { brand, user } = context;
  const roles = (user.roles ?? []) as unknown as Record<string, unknown>[];
  let root: RecordModel;
  const oid = input.oid;
  if (oid) {
    root = await bounded(() => service.getMeta(oid));
    if (!root || !root.redboxOid || String(root.metaMetadata?.brandId) !== String(brand.id))
      throw new RelatedHttpError(404);
    if (!(await bounded(async () => service.hasViewAccess(brand, user, roles, root)))) throw new RelatedHttpError(403);
    loadedRoot = root;
    root = cloneDeep(root);
  } else {
    const type = await bounded(() => firstValueFrom(RecordTypesService.get(brand, input.recordType!)));
    if (!type) throw new RelatedHttpError(400);
    const step = (await bounded(() => firstValueFrom(WorkflowStepsService.getFirst(type)))) as { name?: string } | null;
    const stepName = step?.name;
    if (!stepName) throw new RelatedHttpError(500);
    if (!(await bounded(() => service.hasCreateAccess(brand, user, roles, input.recordType!, stepName))))
      throw new RelatedHttpError(403);
    const form = await bounded(() => firstValueFrom(FormsService.getFormByStartingWorkflowStep(brand, input.recordType!, true)));
    if (!form?.name) throw new RelatedHttpError(500);
    root = {
      metadata: {},
      metaMetadata: { type: input.recordType!, brandId: String(brand.id), form: form.name },
      workflow: { stage: stepName },
    } as RecordModel;
  }
  const type = await bounded(() => firstValueFrom(RecordTypesService.get(brand, String(root.metaMetadata.type))));
  if (!type) throw new RelatedHttpError(500);
  const relations = normalizeRecordRelations(String(root.metaMetadata.type), type.relatedTo ?? []);
  for (const id of input.relations) {
    const relation = relations.find(relation => relation.id === id);
    if (!relation) throw new RelatedHttpError(400);
    if (!relation.resolution) throw new RelatedHttpError(500);
  }
  for (const [id, value] of Object.entries(input.references ?? {})) {
    if (!input.relations.includes(id)) throw new RelatedHttpError(400);
    const relation = relations.find(item => item.id === id)!;
    const tokens = toPath(relation.localField!);
    if (
      tokens[0] !== 'metadata' ||
      tokens.length < 2 ||
      tokens.some(token => ['__proto__', 'constructor', 'prototype'].includes(token))
    )
      throw new RelatedHttpError(500);
    if (normalizeRelatedReferences(value, relation.oidProperty).invalidIndices.length) throw new RelatedHttpError(400);
    set(root, tokens, cloneDeep(value));
  }
  return bounded(async () => ({ root, options: { loadedRoot, startedAt } }));
}
