import { cloneDeep, get, set, toPath, unset } from 'lodash';
import type {
  PublicationAttachment,
  PublicationJson,
  PublicationObject,
  PublicationSourceDescriptor,
  PublicationSourceReference,
} from './contracts';
import type { PublicationProviderDefinition } from './contracts';
import { isPublicationObject } from './builtins';
import { canonicalPublicationJson, PUBLICATION_SOURCE_ENCODING, publicationDigest } from './canonical';
import { PublicationStaging, type PublicationAttachmentSource } from './staging';

export interface PublicationSnapshot {
  brandId: string;
  id: string;
  version: string;
  value: PublicationObject;
}
export interface PublicationCrosswalkSnapshot {
  brandId: string;
  crosswalkId: string;
  revisionId: string;
  value: PublicationObject;
}
export interface PublicationDestinationInput {
  id: string;
  provider: PublicationProviderDefinition;
  configuration: PublicationObject;
  /** Verified actual remote target, not an administrator-supplied account label. */
  targetFingerprint: string;
  mappingContextVersion: number;
  managedFields: string[];
}
export interface PublicationPreparationInput {
  brandId: string;
  oid: string;
  requestId: string;
  sourceRevision: number;
  record: PublicationObject;
  /** Backend-registered outputs only. Arbitrary hook input must never supply exemptions. */
  maintenancePaths: readonly string[];
  /** Only the coordinator's exact expected stage projection may normalize to the approved stage. */
  workflowProjection?: { approvedStage: string; expectedStage: string };
  relatedInputs: Record<string, PublicationSnapshot>;
  destinations: PublicationDestinationInput[];
  attachments: PublicationAttachmentSource[];
  generatedValues: PublicationObject;
  resolveCrosswalk(input: {
    brandId: string;
    crosswalkId: string;
    sourceVocabularyId: string;
  }): Promise<PublicationCrosswalkSnapshot>;
}
export interface SealedPublicationSource {
  descriptor: PublicationSourceDescriptor;
  reference: PublicationSourceReference;
  contentDigest: string;
  configurationDigests: Record<string, string>;
}
function jsonClone<T>(value: T): T {
  canonicalPublicationJson(value);
  return cloneDeep(value);
}
function safePath(path: string): string[] {
  const parts = toPath(path);
  if (!parts.length || parts.some(part => !part || ['__proto__', 'constructor', 'prototype'].includes(part)))
    throw new Error('Invalid publication input field path');
  return parts;
}
/** Allocate at request construction, then persist/reuse these values on every retry. */
export function allocatePublicationGeneratedValues(
  existing?: PublicationObject,
  now: () => Date = () => new Date()
): PublicationObject {
  return existing ? jsonClone(existing) : { publicationTimestamp: now().toISOString() };
}
export function publicationSourceMetadata(
  record: PublicationObject,
  maintenancePaths: readonly string[],
  projection?: PublicationPreparationInput['workflowProjection']
): PublicationObject {
  const snapshot = jsonClone(record);
  for (const path of ['recordVersion', 'lastSaveDate', 'publicationSource', 'figshareSyncIntent', ...maintenancePaths])
    unset(snapshot, safePath(path));
  if (projection && get(snapshot, 'workflow.stage') === projection.expectedStage)
    set(snapshot, 'workflow.stage', projection.approvedStage);
  return snapshot;
}
function removeSecretPath(value: PublicationJson, parts: string[]): void {
  if (value === null || typeof value !== 'object' || !parts.length) return;
  const [first, ...rest] = parts;
  const keys = first === '*' ? Object.keys(value) : [first];
  for (const key of keys) {
    if (Array.isArray(value)) {
      const index = Number(key);
      if (Number.isInteger(index) && index >= 0 && index < value.length) {
        if (!rest.length) value[index] = null;
        else removeSecretPath(value[index], rest);
      }
    } else if (!rest.length) delete value[key];
    else if (value[key] !== undefined) removeSecretPath(value[key], rest);
  }
}
/** Operational settings and runtime connection credentials never enter content approval. */
export function publicationMaterialConfiguration(destination: PublicationDestinationInput): PublicationObject {
  const clean = jsonClone(destination.configuration);
  for (const path of destination.provider.secretPaths) removeSecretPath(clean, safePath(path));
  return {
    mapping: clean.mapping ?? {},
    attachments: clean.attachments ?? {},
    providerOptions: clean.providerOptions ?? {},
  };
}
function crosswalkBindings(value: PublicationJson): Array<{ crosswalkId: string; sourceVocabularyId: string }> {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(crosswalkBindings);
  if (value.kind === 'crosswalk') {
    if (
      typeof value.crosswalkId !== 'string' ||
      !value.crosswalkId.trim() ||
      typeof value.sourceVocabularyId !== 'string' ||
      !value.sourceVocabularyId.trim()
    )
      throw new Error('Invalid publication crosswalk reference');
    return [{ crosswalkId: value.crosswalkId, sourceVocabularyId: value.sourceVocabularyId }];
  }
  return Object.values(value).flatMap(crosswalkBindings);
}
export async function sealPublicationSource(
  input: PublicationPreparationInput,
  staging: PublicationStaging
): Promise<SealedPublicationSource> {
  if (
    !input.brandId.trim() ||
    !input.oid.trim() ||
    !input.requestId.trim() ||
    !Number.isSafeInteger(input.sourceRevision) ||
    input.sourceRevision < 1 ||
    !input.destinations.length
  )
    throw new Error('Invalid publication source identity');
  const recordBrand = get(input.record, 'metaMetadata.brandId');
  if (recordBrand !== undefined && recordBrand !== input.brandId)
    throw new Error('Publication record belongs to a different brand');
  const ids = input.destinations.map(destination => destination.id).sort();
  if (new Set(ids).size !== ids.length || ids.some(id => !/^[a-z][a-z0-9-]{0,63}$/.test(id)))
    throw new Error('Invalid publication destination set');
  const metadata = publicationSourceMetadata(input.record, input.maintenancePaths, input.workflowProjection);
  const relatedInputs: PublicationObject = {};
  for (const [name, snapshot] of Object.entries(input.relatedInputs)) {
    if (name === 'crosswalks' || ['__proto__', 'prototype', 'constructor'].includes(name))
      throw new Error('Reserved publication input snapshot name');
    if (snapshot.brandId !== input.brandId || !snapshot.id || !snapshot.version)
      throw new Error('Related publication input has missing version or different brand');
    relatedInputs[name] = jsonClone({ id: snapshot.id, version: snapshot.version, value: snapshot.value });
  }
  const materialConfiguration: PublicationObject = {};
  const targets: Record<string, string> = {};
  const adapterContracts: PublicationSourceDescriptor['adapterContracts'] = {};
  const managedFields: Record<string, string[]> = {};
  const configurationDigests: Record<string, string> = {};
  const crosswalks = new Map<string, PublicationCrosswalkSnapshot>();
  for (const destination of input.destinations) {
    if (
      !destination.targetFingerprint.trim() ||
      !Number.isSafeInteger(destination.mappingContextVersion) ||
      destination.mappingContextVersion < 1
    )
      throw new Error('Invalid publication target or mapping contract');
    const material = publicationMaterialConfiguration(destination);
    materialConfiguration[destination.id] = material;
    targets[destination.id] = destination.targetFingerprint;
    adapterContracts[destination.id] = {
      providerId: destination.provider.id,
      contractVersion: destination.provider.contractVersion,
      mappingContextVersion: destination.mappingContextVersion,
    };
    destination.managedFields.forEach(safePath);
    managedFields[destination.id] = [...destination.managedFields].sort();
    for (const binding of crosswalkBindings(material)) {
      const key = canonicalPublicationJson([binding.crosswalkId, binding.sourceVocabularyId]);
      if (!crosswalks.has(key)) {
        const snapshot = await input.resolveCrosswalk({ brandId: input.brandId, ...binding });
        if (snapshot.brandId !== input.brandId || snapshot.crosswalkId !== binding.crosswalkId || !snapshot.revisionId)
          throw new Error('Publication crosswalk has no brand-owned approved revision');
        crosswalks.set(key, jsonClone(snapshot));
      }
    }
    const pins = crosswalkBindings(material).map(
      binding => crosswalks.get(canonicalPublicationJson([binding.crosswalkId, binding.sourceVocabularyId]))!
    );
    configurationDigests[destination.id] = publicationDigest({
      material,
      target: destination.targetFingerprint,
      adapter: adapterContracts[destination.id],
      managedFields: managedFields[destination.id],
      crosswalks: pins,
    });
  }
  // Freeze resolved mappings/labels alongside revision IDs; moving an approved pointer cannot alter retries.
  const pinned = [...crosswalks.values()].sort((a, b) =>
    canonicalPublicationJson([a.crosswalkId, a.revisionId]) < canonicalPublicationJson([b.crosswalkId, b.revisionId])
      ? -1
      : canonicalPublicationJson([a.crosswalkId, a.revisionId]) >
          canonicalPublicationJson([b.crosswalkId, b.revisionId])
        ? 1
        : 0
  );
  relatedInputs.crosswalks = pinned.map(pin => ({
    crosswalkId: pin.crosswalkId,
    revisionId: pin.revisionId,
    value: pin.value,
  }));
  const attachments: PublicationAttachment[] = [];
  const logicalPaths = new Set<string>();
  for (const source of input.attachments) {
    if (logicalPaths.has(source.logicalPath)) throw new Error('Duplicate publication attachment logical path');
    logicalPaths.add(source.logicalPath);
    attachments.push(await staging.prepareAttachment(input.brandId, source));
  }
  const descriptor: PublicationSourceDescriptor = {
    encodingVersion: PUBLICATION_SOURCE_ENCODING,
    brandId: input.brandId,
    oid: input.oid,
    requestId: input.requestId,
    sourceRevision: input.sourceRevision,
    metadata,
    relatedInputs,
    destinationIds: ids,
    targets,
    materialConfiguration,
    crosswalkRevisions: pinned.map(({ brandId, crosswalkId, revisionId }) => ({ brandId, crosswalkId, revisionId })),
    attachments,
    generatedValues: jsonClone(input.generatedValues),
    adapterContracts,
    managedFields,
  };
  // Content identity includes bytes, not the random location used to retain them.
  const contentDigest = publicationDigest({
    ...descriptor,
    attachments: attachments.map(({ staged: _staged, ...attachment }) => attachment),
  });
  const encoded = canonicalPublicationJson(descriptor);
  return { descriptor, reference: await staging.putJson(input.brandId, encoded), contentDigest, configurationDigests };
}
export async function reopenPublicationSource(
  brandId: string,
  reference: PublicationSourceReference,
  staging: PublicationStaging
): Promise<PublicationSourceDescriptor> {
  const value = await staging.readJson(brandId, reference);
  // Digest verification proves byte identity; validate the version and complete shape before exposing it to adapters.
  if (!isSourceDescriptor(value) || value.brandId !== brandId)
    throw new Error('Invalid sealed publication source descriptor');
  return value;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function positiveVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function sourceReference(value: unknown): boolean {
  return (
    isObject(value) &&
    value.encodingVersion === PUBLICATION_SOURCE_ENCODING &&
    nonEmptyString(value.disk) &&
    nonEmptyString(value.key) &&
    typeof value.digest === 'string' &&
    /^[a-f0-9]{64}$/.test(value.digest)
  );
}
function isSourceDescriptor(value: unknown): value is PublicationSourceDescriptor {
  if (
    !isPublicationObject(value) ||
    value.encodingVersion !== PUBLICATION_SOURCE_ENCODING ||
    !nonEmptyString(value.brandId) ||
    !nonEmptyString(value.oid) ||
    !nonEmptyString(value.requestId) ||
    !positiveVersion(value.sourceRevision)
  )
    return false;
  const { metadata, relatedInputs, targets, materialConfiguration, generatedValues, adapterContracts, managedFields } =
    value;
  if (
    ![metadata, relatedInputs, generatedValues].every(isPublicationObject) ||
    !isPublicationObject(targets) ||
    !isPublicationObject(materialConfiguration) ||
    !isPublicationObject(adapterContracts) ||
    !isPublicationObject(managedFields)
  )
    return false;
  const ids = value.destinationIds;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    !ids.every(nonEmptyString) ||
    new Set(ids).size !== ids.length ||
    !Array.isArray(value.crosswalkRevisions) ||
    !Array.isArray(value.attachments)
  )
    return false;
  for (const id of ids) {
    const adapter = adapterContracts[id];
    const fields = managedFields[id];
    if (
      !nonEmptyString(targets[id]) ||
      !isPublicationObject(materialConfiguration[id]) ||
      !isPublicationObject(adapter) ||
      !nonEmptyString(adapter.providerId) ||
      !positiveVersion(adapter.contractVersion) ||
      !positiveVersion(adapter.mappingContextVersion) ||
      !Array.isArray(fields) ||
      !fields.every(nonEmptyString)
    )
      return false;
  }
  if (
    !value.crosswalkRevisions.every(
      pin =>
        isPublicationObject(pin) &&
        pin.brandId === value.brandId &&
        nonEmptyString(pin.crosswalkId) &&
        nonEmptyString(pin.revisionId)
    )
  )
    return false;
  return value.attachments.every(attachment => {
    if (
      !isPublicationObject(attachment) ||
      !nonEmptyString(attachment.id) ||
      !nonEmptyString(attachment.logicalPath) ||
      typeof attachment.size !== 'number' ||
      !Number.isSafeInteger(attachment.size) ||
      attachment.size < 0
    )
      return false;
    const hasDigest = typeof attachment.digest === 'string' && /^[a-f0-9]{64}$/.test(attachment.digest);
    return (
      (hasDigest || nonEmptyString(attachment.immutableVersion)) &&
      (attachment.original === undefined ||
        (isPublicationObject(attachment.original) &&
          nonEmptyString(attachment.original.oid) &&
          nonEmptyString(attachment.original.fileId) &&
          attachment.original.digest === attachment.digest &&
          attachment.staged !== undefined)) &&
      (attachment.staged === undefined ||
        (hasDigest &&
          sourceReference(attachment.staged) &&
          isPublicationObject(attachment.staged) &&
          attachment.staged.digest === attachment.digest))
    );
  });
}

/** Expand current/work/recovery descriptor roots before staging cleanup, including selected staged bytes. */
export async function publicationInputReferences(
  brandId: string,
  roots: readonly PublicationSourceReference[],
  staging: PublicationStaging
): Promise<PublicationSourceReference[]> {
  const references = new Map<string, PublicationSourceReference>();
  for (const root of roots) {
    const descriptor = await reopenPublicationSource(brandId, root, staging);
    references.set(canonicalPublicationJson([root.disk, root.key]), cloneDeep(root));
    for (const attachment of descriptor.attachments) {
      if (attachment.staged) {
        await staging.verify(brandId, attachment.staged, attachment.size);
        references.set(
          canonicalPublicationJson([attachment.staged.disk, attachment.staged.key]),
          cloneDeep(attachment.staged)
        );
      }
    }
  }
  return [...references.values()];
}
