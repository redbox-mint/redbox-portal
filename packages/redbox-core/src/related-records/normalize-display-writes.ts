import { cloneDeep, get, has, isEqual, set, unset } from 'lodash';
import { firstValueFrom } from 'rxjs';
import { relatedDisplayPointerTokens, type RelatedFormDescriptors } from '@researchdatabox/sails-ng-common';
import type { RecordRelation } from '../config/recordtype.config';
import { formatRecordFormFingerprint } from '../RecordFormFingerprint';
import {
  cachedRelatedDisplayDeclarations,
  bindRelatedDisplayContract,
  relatedFormDescriptors,
} from './display-descriptors';
import { normalizeRelatedReferences } from './references';
import { RBValidationError } from '../model/RBValidationError';
import type { FormAttributes } from '../waterline-models/Form';
import type { BrandingModel } from '../model/storage/BrandingModel';

export class RelatedDisplayWriteError extends RBValidationError {
  constructor(public readonly code = 'related-display-field-not-writable') {
    super({
      message: code,
      problemKind: code === 'related-display-contract-invalid' ? 'system' : 'validation',
      displayErrors: [{ code, title: `@record-save-${code}` }],
    });
  }
}

function selected(metadata: unknown, contract: RelatedFormDescriptors, relationId: string, validate = true): boolean {
  const relation = contract.relations.find(item => item.relationId === relationId);
  if (!relation) throw new RelatedDisplayWriteError('related-display-contract-invalid');
  const references = normalizeRelatedReferences(get(metadata, relation.referenceTokens), relation.oidTokens);
  if (validate && references.invalidIndices.length) throw new RelatedDisplayWriteError('related-reference-invalid');
  return references.values.length > 0 || references.invalidIndices.length > 0;
}

/** Mutates only the detached persistence candidate and optional detached submission.
 * Presence in input is deliberate local input; presence in a merged candidate is not.
 */
export function normalizeDisplayWrites(options: {
  metadata: Record<string, unknown>;
  stored?: Record<string, unknown>;
  input: Record<string, unknown>;
  contract?: RelatedFormDescriptors;
  targetContract?: RelatedFormDescriptors;
  transitioning?: boolean;
  localInput?: Record<string, unknown>;
}): void {
  const { metadata, stored, input, contract, targetContract, transitioning } = options;
  const contracts = [contract, targetContract].filter((item): item is RelatedFormDescriptors => !!item);
  // Validate every opted-in reference, including sources without display targets.
  for (const current of contracts)
    for (const relation of current.relations) selected(metadata, current, relation.relationId);
  if (transitioning && contract) {
    for (const target of contract.displayTargets) {
      if (
        selected(metadata, contract, target.relationId) &&
        !targetContract?.displayTargets.some(
          other => other.metadataPointer === target.metadataPointer && other.relationId === target.relationId
        )
      ) {
        throw new RelatedDisplayWriteError('related-display-contract-invalid');
      }
    }
  }
  // Evaluate activation before changing any metadata (including overlapping targets).
  const targets = new Map<string, { active: boolean; wasActive: boolean }>();
  for (const current of contracts)
    for (const target of current.displayTargets) {
      const previous = targets.get(target.metadataPointer);
      targets.set(target.metadataPointer, {
        active: Boolean(previous?.active || selected(metadata, current, target.relationId)),
        wasActive: Boolean(previous?.wasActive || (stored && selected(stored, current, target.relationId, false))),
      });
    }
  for (const [pointer, state] of targets) {
    const path = relatedDisplayPointerTokens(pointer);
    if (state.active) {
      if (has(input, path) && (!has(stored, path) || !isEqual(get(input, path), get(stored, path))))
        throw new RelatedDisplayWriteError();
      unset(input, path);
      if (has(stored, path)) set(metadata, path, cloneDeep(get(stored, path)));
      else unset(metadata, path);
    } else if (state.wasActive && !has(options.localInput ?? input, path)) {
      unset(metadata, path);
    }
  }
}

/** Request-local authoritative forms and declarations, including cached absence.
 * The source identity is captured before workflow hooks and never derived from their output.
 */
export interface RelatedDisplayWriteContext {
  sourceForm?: string;
  hasDeclarations?: boolean;
  forms: Map<string, Promise<FormAttributes | null>>;
  contracts: Map<string, Promise<RelatedFormDescriptors | undefined>>;
  attachmentReads: Set<string>;
}

export function createRelatedDisplayWriteContext(): RelatedDisplayWriteContext {
  return { forms: new Map(), contracts: new Map(), attachmentReads: new Set() };
}

export interface DisplayRecordType {
  name?: string;
  relatedTo?: RecordRelation[];
}
/** Uses RR-08's bounded configuration-digest cache; never expands forms per row/save. */
export async function loadRelatedDisplayContract(
  recordType: DisplayRecordType | null | undefined,
  brandId: string,
  formName: string,
  sourceForm?: FormAttributes | null
): Promise<RelatedFormDescriptors | undefined> {
  if (!recordType?.relatedTo?.some(relation => relation.resolution)) return undefined;
  // These records have no configured form and therefore no transient display targets.
  if (!formName || formName === 'generated-view-only') return undefined;
  if (!brandId) throw new RelatedDisplayWriteError('related-display-contract-invalid');
  const form =
    sourceForm === undefined ? await firstValueFrom(FormsService.getFormByName(formName, true, brandId)) : sourceForm;
  if (!form) throw new RelatedDisplayWriteError('related-display-contract-invalid');
  const reusable = sails.config.reusableFormDefinitions ?? {};
  const digest = formatRecordFormFingerprint({ form: form.configuration, reusable });
  if (!digest) throw new RelatedDisplayWriteError('related-display-contract-invalid');
  const declarations = cachedRelatedDisplayDeclarations(digest, form.configuration!, reusable);
  if (!declarations) return undefined;
  return relatedFormDescriptors(
    bindRelatedDisplayContract(declarations, recordType.name ?? '', recordType.relatedTo ?? [])
  );
}

/** Preflight the complete batch, before audit, identity claims or insertions.
 * Batch has no form-validation pipeline: active declarations cannot use that bypass.
 */
export async function assertRelatedDisplayBatchAllowed(type: unknown, data?: unknown): Promise<void> {
  const rows = Array.isArray(type) ? type : Array.isArray(data) ? data : [];
  const contracts = new Map<string, RelatedFormDescriptors[]>();
  for (const row of rows) {
    const recordTypeName = typeof type === 'string' ? type : get(row, 'metaMetadata.type');
    if (!recordTypeName) continue;
    const brandId = String(
      get(row, 'metaMetadata.brandId') ??
        (typeof BrandingService !== 'undefined' ? BrandingService.getDefault()?.id : '') ??
        ''
    );
    const key = JSON.stringify([brandId, recordTypeName]);
    let forms = contracts.get(key);
    if (!forms) {
      // Bare adapter tests and legacy bootstrap callers can lack model services.
      // Configured resolvable types must still fail closed in that environment.
      if (typeof RecordTypesService === 'undefined') {
        const configured = sails.config.recordtype?.[recordTypeName];
        if (configured?.relatedTo?.some(relation => relation.resolution))
          throw new RelatedDisplayWriteError('related-display-contract-invalid');
        continue;
      }
      const recordType = await firstValueFrom(RecordTypesService.get({ id: brandId } as BrandingModel, recordTypeName));
      if (!recordType && sails.config.recordtype?.[recordTypeName]?.relatedTo?.some(relation => relation.resolution)) {
        throw new RelatedDisplayWriteError('related-display-contract-invalid');
      }
      if (!recordType?.relatedTo?.some(relation => relation.resolution)) {
        contracts.set(key, []);
        continue;
      }
      const steps = await firstValueFrom(WorkflowStepsService.getAllForRecordType(recordType));
      const names = new Set(steps.map(step => String(get(step, 'config.form', ''))));
      for (const candidate of rows) {
        const candidateType = typeof type === 'string' ? type : get(candidate, 'metaMetadata.type');
        const candidateBrand = String(
          get(candidate, 'metaMetadata.brandId') ??
            (typeof BrandingService !== 'undefined' ? BrandingService.getDefault()?.id : '') ??
            ''
        );
        if (candidateType === recordTypeName && candidateBrand === brandId && get(candidate, 'metaMetadata.form')) {
          names.add(get(candidate, 'metaMetadata.form'));
        }
      }
      if (!names.size) throw new RelatedDisplayWriteError('related-display-contract-invalid');
      forms = [];
      for (const name of names) {
        const contract = await loadRelatedDisplayContract(recordType, brandId, name);
        if (contract) forms.push(contract);
      }
      contracts.set(key, forms);
    }
    for (const contract of forms)
      for (const target of contract.displayTargets) {
        if (selected(get(row, 'metadata', {}), contract, target.relationId))
          throw new RelatedDisplayWriteError('related-display-batch-not-supported');
      }
  }
}
