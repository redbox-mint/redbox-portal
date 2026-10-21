import { cloneDeep, get, has, isEqual, set, unset } from 'lodash';
import type { StorageService } from '../../StorageService';
import type { PublicationPublishingConfigData } from '../../configmodels/PublicationPublishing';
import type { PublicationProviderRegistry } from './registry';
import { assertRecordFieldPaths, type PublicationProjection } from '../../RecordWriteOptions';
import type { PublicationSourceDescriptor } from './contracts';
import type { PublicationSnapshot } from './source';
import { publicationDigest } from './canonical';
import { publicationOutputPath } from './configuration';
import { isPublicationObject } from './builtins';
import { PublicationStopped } from './execution';

/** Include adapter defaults and override outputs, rather than trusting posted writeBack keys. */
export function registeredPublicationOutputs(
  registry: PublicationProviderRegistry,
  config: PublicationPublishingConfigData,
  requiredDestinationIds: readonly string[] = []
): Record<string, string[]> {
  const outputs: Record<string, string[]> = {};
  const reserved: Array<{ destination: string; parts: string[] }> = [];
  for (const [id, destination] of Object.entries(config.destinations)) {
    const provider = registry.get(destination.provider);
    let paths: string[];
    try {
      paths = [...new Set(provider?.sourceMaintenancePaths?.(destination) ?? [])];
    } catch (error) {
      // Invalid unselected drafts must not block independent requests or acquire maintenance exemptions.
      if (requiredDestinationIds.includes(id)) throw error;
      continue;
    }
    for (const path of paths) {
      const parts = publicationOutputPath(path);
      assertRecordFieldPaths({ [path]: null }, [path]);
      if (
        reserved.some(
          previous =>
            previous.destination !== id &&
            previous.parts.slice(0, Math.min(parts.length, previous.parts.length)).every((part, i) => part === parts[i])
        )
      )
        throw new Error('Publication destinations cannot write overlapping paths or array roots');
      reserved.push({ destination: id, parts });
    }
    outputs[id] = paths;
  }
  return outputs;
}

/** Revalidation restores only outputs registered when this request was sealed. */
export function publicationProjectionInputs(
  record: Record<string, unknown>,
  source: PublicationSourceDescriptor,
  registry: PublicationProviderRegistry,
  config: PublicationPublishingConfigData
): Record<string, unknown> {
  const inputs = cloneDeep(record);
  const frozen = source.relatedInputs['publication:outputs'];
  const ids =
    isPublicationObject(frozen) && isPublicationObject(frozen.value)
      ? Object.keys(frozen.value)
      : source.destinationIds;
  const outputs = registeredPublicationOutputs(registry, config, ids);
  for (const id of ids) {
    const prepared = source.relatedInputs[`${id}:prepared`];
    const sealed =
      isPublicationObject(frozen) && isPublicationObject(frozen.value)
        ? frozen.value[id]
        : isPublicationObject(prepared) && isPublicationObject(prepared.value)
          ? prepared.value.outputPaths
          : undefined;
    const paths = outputs[id] ?? [];
    if (!paths.length && sealed === undefined) continue;
    if (!Array.isArray(sealed) || publicationDigest(sealed) !== publicationDigest(paths))
      throw new PublicationStopped('superseded', 'registered_outputs_changed');
    for (const path of paths) {
      if (has(source.metadata, path)) set(inputs, path, cloneDeep(get(source.metadata, path)));
      else {
        unset(inputs, path);
        const parts = path.split('.');
        while (parts.length > 1) {
          parts.pop();
          const parent = parts.join('.');
          const value = get(inputs, parent);
          if (!has(source.metadata, parent) && isPublicationObject(value) && !Object.keys(value).length)
            unset(inputs, parent);
          else break;
        }
      }
    }
  }
  return inputs;
}

/** Validate the proposal before handing it to async projection persistence. @internal */
export function assertPublicationProjection(
  storage: StorageService,
  projection: Omit<PublicationProjection, 'expectedRevision'>
): asserts storage is StorageService & Required<Pick<StorageService, 'setPublicationRecordFields'>> {
  if (!storage.setPublicationRecordFields) throw new Error('Publication projection capability is unavailable');
  for (const path of Object.keys(projection.fields)) {
    publicationOutputPath(path);
    if (!projection.allowedPaths.includes(path)) throw new Error('Unregistered publication output');
  }
}

/** Every retry reloads both authority and the record; only the requested fields reach storage. */
export async function applyPublicationProjection(input: {
  storage: StorageService;
  projection: Omit<PublicationProjection, 'expectedRevision'>;
  assertAuthority(): Promise<void>;
  assertProposal(): void;
}): Promise<void> {
  const { storage, projection } = input;
  assertPublicationProjection(storage, projection);
  for (let attempt = 0; attempt < 5; attempt++) {
    await input.assertAuthority();
    const current = await storage.getMeta(projection.oid);
    if (!current || current.metaMetadata?.brandId !== projection.brandId)
      throw new PublicationStopped('revoked', 'record_unavailable');
    input.assertProposal();
    if (Object.entries(projection.fields).every(([path, value]) => isEqual(get(current, path), value))) return;
    const result = await storage.setPublicationRecordFields({ ...projection, expectedRevision: current.revision ?? 0 });
    if (result.updated) return;
  }
  throw new Error('Publication projection revision conflict; retry from confirmed provider evidence');
}

export function publicationOutputSnapshot(brandId: string, outputs: Record<string, string[]>): PublicationSnapshot {
  return { brandId, id: 'registered-outputs', version: publicationDigest(outputs), value: outputs };
}
