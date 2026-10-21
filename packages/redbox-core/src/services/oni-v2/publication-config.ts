import Ajv from 'ajv';
import { cloneDeep, mergeWith } from 'lodash';
import { realpathSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { OniPublishing, ONI_PUBLISHING_SCHEMA } from '../../configmodels/OniPublishing';
import type { PublicationObject } from '../publication/contracts';
import { isPublicationObject, publicationTargetFingerprint } from '../publication/builtins';
import type { ResolvedOniPublishingConfigData } from './types';

const validate = new Ajv({ strict: false }).compile<OniPublishing>(ONI_PUBLISHING_SCHEMA);
function physicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || dirname(path) === path)
      throw error;
    return resolve(physicalPath(dirname(path)), basename(path));
  }
}
export function oniJson(value: unknown): PublicationObject {
  const result: unknown = JSON.parse(
    JSON.stringify(value, (_key, item: unknown) => {
      if (
        (typeof item === 'number' && !Number.isFinite(item)) ||
        ['function', 'symbol', 'bigint'].includes(typeof item)
      )
        throw new Error('Oni evidence requires finite JSON');
      return item;
    })
  );
  if (!isPublicationObject(result)) throw new Error('Oni evidence requires a JSON object');
  return result;
}
export function oniDestinationConfiguration(destination: PublicationObject): ResolvedOniPublishingConfigData {
  const options = isPublicationObject(destination.providerOptions) ? destination.providerOptions : {};
  const connection = isPublicationObject(destination.connection) ? destination.connection : {};
  const candidate: unknown = mergeWith(
    new OniPublishing(),
    cloneDeep(options),
    {
      enabled: true,
      defaultSite: 'publication',
      sites: { publication: { ...cloneDeep(connection), enabled: true } },
      mapping: cloneDeep(destination.mapping),
      selection: cloneDeep(destination.attachments),
    },
    (_target, source) => (Array.isArray(source) ? source : undefined)
  );
  if (!validate(candidate)) throw new Error('Invalid Oni destination configuration');
  const ingestion = candidate.sites.publication.ingestion;
  if (ingestion?.enabled || ingestion?.apiUrl) {
    const endpoint = new URL(ingestion.apiUrl);
    if (
      !['http:', 'https:'].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error('Invalid Oni ingestion endpoint');
  }
  const outputs = isPublicationObject(destination.writeBack) ? destination.writeBack : {};
  for (const property of ['citationUrlPath', 'citationDoiPath', 'publicationErrorPath'] as const) {
    if (typeof outputs[property] !== 'string' || !outputs[property].startsWith('metadata.'))
      throw new Error(`Oni requires a registered ${property} output`);
    candidate.writeBack[property] = outputs[property];
  }
  return candidate;
}
/** Physical backend/key namespace. Disk aliases, virtual roots and repository labels cannot create another writer. */
export function oniRepositoryIdentity(destination: PublicationObject): string {
  const config = oniDestinationConfiguration(destination);
  const storage = config.sites.publication.storage;
  const disk = StorageManagerService.getDiskConfig(storage.diskName);
  const configuredDisk = StorageManagerService.disk(storage.diskName);
  const driver: unknown = Reflect.get(configuredDisk, 'driver');
  const options: unknown = driver && typeof driver === 'object' ? Reflect.get(driver, 'options') : undefined;
  if (!options || typeof options !== 'object') throw new Error('Oni requires a verifiable Flydrive backend');
  const prefix = String(storage.prefix ?? '').replace(/^\/+|\/+$/g, '');
  if (prefix.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid Oni repository prefix');
  if (disk.driver === 'fs') {
    // Resolve aliases and symlinks before accepting a request; the durable root must already exist.
    const location: unknown = Reflect.get(options, 'location');
    const actual = location instanceof URL ? location : typeof location === 'string' ? location : undefined;
    if (!actual || realpathSync(actual) !== realpathSync(disk.config.root))
      throw new Error('Oni filesystem backend differs from its configuration');
    return publicationTargetFingerprint('oni-repository', ['fs', physicalPath(resolve(disk.config.root, prefix))]);
  }
  if (disk.driver !== 's3') throw new Error('Shared Oni supports verified FS and S3 repositories only');
  const endpoint = disk.config.endpoint ? new URL(disk.config.endpoint) : new URL('https://s3.amazonaws.com');
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error('Invalid Oni storage endpoint');
  const aws = /^s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(endpoint.hostname);
  if (!disk.config.bucket || disk.config.bucketEndpoint) throw new Error('Unverifiable Oni S3 bucket identity');
  if (Reflect.get(options, 'bucket') !== disk.config.bucket)
    throw new Error('Oni S3 backend differs from its configured bucket');
  // A supplied SDK client is not introspectable synchronously. Source preparation additionally verifies its endpoint.
  const actualEndpoint: unknown = Reflect.get(options, 'endpoint');
  if (!Reflect.has(options, 'client') && String(actualEndpoint ?? '') !== String(disk.config.endpoint ?? ''))
    throw new Error('Oni S3 backend differs from its configured endpoint');
  return publicationTargetFingerprint('oni-repository', [
    's3',
    aws ? 'aws-s3' : endpoint.href.replace(/\/+$/, ''),
    disk.config.bucket,
    // S3 preserves repeated separators; only the wrapper's edge-slash trimming is equivalent.
    prefix,
  ]);
}

export async function verifyOniRepositoryBackend(destination: PublicationObject): Promise<void> {
  oniRepositoryIdentity(destination);
  const storage = oniDestinationConfiguration(destination).sites.publication.storage;
  const declared = StorageManagerService.getDiskConfig(storage.diskName);
  if (declared.driver !== 's3') return;
  const driver: unknown = Reflect.get(StorageManagerService.disk(storage.diskName), 'driver');
  const options: unknown = driver && typeof driver === 'object' ? Reflect.get(driver, 'options') : undefined;
  const client: unknown = options && typeof options === 'object' ? Reflect.get(options, 'client') : undefined;
  if (!client) return;
  const config: unknown = typeof client === 'object' ? Reflect.get(client, 'config') : undefined;
  const endpoint: unknown = config && typeof config === 'object' ? Reflect.get(config, 'endpoint') : undefined;
  if (typeof endpoint !== 'function') {
    if (declared.config.endpoint) throw new Error('Unverifiable Oni SDK endpoint');
    return;
  }
  const resolved: unknown = await endpoint();
  if (!resolved || typeof resolved !== 'object') throw new Error('Unverifiable Oni SDK endpoint');
  const actual = new URL(
    `${Reflect.get(resolved, 'protocol')}//${Reflect.get(resolved, 'hostname')}${Reflect.get(resolved, 'port') ? `:${Reflect.get(resolved, 'port')}` : ''}${Reflect.get(resolved, 'path') ?? '/'}`
  );
  const expected = new URL(declared.config.endpoint ?? 'https://s3.amazonaws.com');
  if (actual.href.replace(/\/+$/, '') !== expected.href.replace(/\/+$/, ''))
    throw new Error('Oni SDK endpoint differs from its configured repository');
}

/** Service overrides may customise mapping, but cannot redirect an approved physical repository. */
export function assertOniRepositoryConfiguration(
  destination: PublicationObject,
  configuration: ResolvedOniPublishingConfigData
): void {
  const effective = cloneDeep(destination);
  const connection = isPublicationObject(effective.connection) ? effective.connection : {};
  effective.connection = {
    ...connection,
    storage: oniJson(configuration.sites.publication.storage),
    ...(configuration.sites.publication.ingestion
      ? { ingestion: oniJson(configuration.sites.publication.ingestion) }
      : {}),
  };
  if (oniRepositoryIdentity(effective) !== oniRepositoryIdentity(destination))
    throw new Error('Oni service override changed the approved physical repository');
}
