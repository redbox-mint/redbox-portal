import { firstValueFrom } from 'rxjs';
import { get } from 'lodash';
import type { RecordModel } from '../model';
import type { RecordsService } from '../RecordsService';
import type { RelatedRecordReadContext } from './types';
import { compileRelatedDisplayContract } from './display-descriptors';
import { normalizeRelatedReferences } from './references';
import { projectionTokens } from './projection';
import { getEffectiveRelatedClientForm } from './effective-form';
import { UnsupportedCalculatedSource } from './resolver';

const GENERATED_VIEW_ONLY_FORM = 'generated-view-only';

/** No construction visitor or expression evaluation runs here for backend audiences. */
export async function projectRelatedSource(
  record: RecordModel,
  fields: readonly string[],
  context: RelatedRecordReadContext,
  recordsService: Pick<RecordsService, 'hasEditAccess'>
): Promise<unknown> {
  const formName = String(record.metaMetadata?.form ?? '').trim();
  // Existing imported/no-form read semantics, still intersected with declared fields.
  // `generated-view-only` is the placeholder core assigns to workflows without a
  // configured form (e.g. imported activities); its view renders every metadata key,
  // so projecting through its few model fields would hide data it already shows.
  if (!formName || formName === GENERATED_VIEW_ONLY_FORM) return record.metadata;
  const form = await firstValueFrom(FormsService.getFormByName(formName, true, String(context.brand.id)));
  if (!form?.configuration) throw new Error('Source form unavailable');
  const type = await firstValueFrom(RecordTypesService.get(context.brand, String(record.metaMetadata.type)));
  if (!type) throw new Error('Source type unavailable');
  const contract = compileRelatedDisplayContract(
    form.configuration,
    sails.config.reusableFormDefinitions ?? {},
    type.relatedTo ?? []
  );
  for (const target of contract?.displayTargets ?? []) {
    const relation = contract!.relations.find(item => item.id === target.relationId)!;
    const references = normalizeRelatedReferences(get(record, relation.localField!), relation.oidProperty);
    if (!references.values.length && !references.invalidIndices.length) continue;
    const targetTokens = projectionTokens(target.metadataPointer);
    if (
      fields.some(field => {
        const tokens = projectionTokens(field);
        return (
          tokens.every((token, index) => targetTokens[index] === token) ||
          targetTokens.every((token, index) => tokens[index] === token)
        );
      })
    )
      throw new UnsupportedCalculatedSource();
  }
  if (context.audience !== 'browser') return record.metadata;
  // The shared read context has no HTTP transport data. Its effective principal is authoritative.
  const req = { user: context.user, session: {}, headers: {}, param: () => undefined } as unknown as Sails.Req;
  const hasEditAccess = recordsService.hasEditAccess(
    context.brand,
    context.user,
    (context.user.roles ?? []) as unknown as Record<string, unknown>[],
    record
  );
  const formMode = hasEditAccess ? 'edit' : 'view';
  const clientForm = await getEffectiveRelatedClientForm(
    req,
    context.brand,
    record,
    formName,
    hasEditAccess,
    formMode,
    true
  );
  if (!clientForm) throw new Error('Source projection unavailable');
  return FormRecordConsistencyService.projectMetadataClientFormConfig(
    record.metadata,
    clientForm,
    formMode,
    sails.config.reusableFormDefinitions
  );
}
