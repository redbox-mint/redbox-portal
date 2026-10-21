import { createHash } from 'node:crypto';
import type {
  OcflObjectAdapter,
  OcflObjectReader,
  OniOcflCommitExpectation,
  OniOcflCommitResolution,
  OniOcflContentFile,
  OniOcflDesiredContent,
  OniOcflObjectEvidence,
} from './types';

type Inventory = {
  id: string;
  type: string;
  head: string;
  digestAlgorithm: 'sha256' | 'sha512';
  manifest: Record<string, string[]>;
  versions: Record<string, { state: Record<string, string[]> }>;
};

export interface OcflObjectPaths {
  files: string[];
  rootEntries: string[];
  workspaceEntries: string[];
}

export function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function relativePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    value.split('/').every(part => part !== '' && part !== '.' && part !== '..')
  );
}

function versionNumber(value: string): number {
  return /^v[1-9]\d*$/.test(value) ? Number(value.slice(1)) : NaN;
}

/** Build before submission from sealed bytes/digests; array order is normalized by logical path. */
export function createOniOcflDesiredContent(
  metadataLogicalPath: string,
  files: readonly OniOcflContentFile[]
): OniOcflDesiredContent {
  const sorted = files
    .map(file => ({ logicalPath: file.logicalPath, size: file.size, sha256: file.sha256 }))
    .sort((a, b) => (a.logicalPath < b.logicalPath ? -1 : a.logicalPath > b.logicalPath ? 1 : 0));
  const seen = new Set<string>();
  for (const file of sorted) {
    if (
      !relativePath(file.logicalPath) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      seen.has(file.logicalPath)
    ) {
      throw new Error('Invalid OCFL desired file manifest');
    }
    seen.add(file.logicalPath);
  }
  for (const file of sorted) {
    const parts = file.logicalPath.split('/');
    parts.pop();
    while (parts.length) {
      if (seen.has(parts.join('/'))) throw new Error('Conflicting OCFL logical paths');
      parts.pop();
    }
  }
  if (!relativePath(metadataLogicalPath) || !seen.has(metadataLogicalPath))
    throw new Error('OCFL metadata file is required');
  return {
    schemaVersion: 1,
    metadataLogicalPath,
    files: sorted,
    digest: sha256(JSON.stringify([1, metadataLogicalPath, sorted])),
  };
}

function validateInventory(value: unknown, objectId: string): Inventory {
  if (
    !isRecord(value) ||
    value.id !== objectId ||
    !['https://ocfl.io/1.0/spec/#inventory', 'https://ocfl.io/1.1/spec/#inventory'].includes(String(value.type)) ||
    typeof value.head !== 'string' ||
    !Number.isSafeInteger(versionNumber(value.head)) ||
    (value.digestAlgorithm !== 'sha256' && value.digestAlgorithm !== 'sha512') ||
    !isRecord(value.manifest) ||
    !isRecord(value.versions)
  ) {
    throw new Error('Incomplete OCFL inventory');
  }
  const head = versionNumber(value.head);
  const digestLength = value.digestAlgorithm === 'sha512' ? 128 : 64;
  const manifest: Record<string, string[]> = {};
  const physicalPaths = new Set<string>();
  for (const [digest, paths] of Object.entries(value.manifest)) {
    if (
      !new RegExp(`^[a-f0-9]{${digestLength}}$`).test(digest) ||
      !Array.isArray(paths) ||
      !paths.length ||
      !paths.every(relativePath)
    )
      throw new Error('Invalid OCFL manifest');
    for (const path of paths) {
      const parts = path.split('/');
      if (parts.length < 3 || !(versionNumber(parts[0]) <= head) || physicalPaths.has(path))
        throw new Error('Invalid OCFL content path');
      physicalPaths.add(path);
    }
    manifest[digest] = paths;
  }
  const versions: Inventory['versions'] = {};
  if (Object.keys(value.versions).length !== head) throw new Error('Incomplete OCFL version history');
  for (let index = 1; index <= head; index++) {
    const version = value.versions[`v${index}`];
    if (!isRecord(version) || !isRecord(version.state)) throw new Error('Incomplete OCFL version state');
    const state: Record<string, string[]> = {};
    const seen = new Set<string>();
    for (const [digest, paths] of Object.entries(version.state)) {
      if (!manifest[digest] || !Array.isArray(paths) || !paths.length || !paths.every(relativePath))
        throw new Error('Incomplete OCFL file evidence');
      for (const path of paths) {
        if (seen.has(path)) throw new Error('Duplicate OCFL logical path');
        seen.add(path);
      }
      state[digest] = paths;
    }
    versions[`v${index}`] = { state };
  }
  return {
    id: objectId,
    type: String(value.type),
    head: value.head,
    digestAlgorithm: value.digestAlgorithm,
    manifest,
    versions,
  };
}

export function ocflObjectReader(object: OcflObjectAdapter): OcflObjectReader {
  if (
    !('root' in object) ||
    typeof object.root !== 'string' ||
    !('getInventory' in object) ||
    typeof object.getInventory !== 'function' ||
    !('readFile' in object) ||
    typeof object.readFile !== 'function' ||
    !('getFile' in object) ||
    typeof object.getFile !== 'function'
  )
    throw new Error('Unsupported OCFL read API');
  // The adapter contract describes public methods checked above, not library internals.
  return object as OcflObjectReader;
}

async function readText(object: OcflObjectReader, path: string): Promise<string> {
  const bytes = await object.readFile(path, 'utf8');
  if (typeof bytes !== 'string') throw new Error('OCFL read did not return text');
  return bytes;
}

async function checkedInventory(object: OcflObjectReader, path: string, objectId: string) {
  const raw = await readText(object, path);
  const parsed: unknown = JSON.parse(raw);
  const data = validateInventory(parsed, objectId);
  const sidecar = await readText(object, `${path}.${data.digestAlgorithm}`);
  if (sidecar.trim() !== `${createHash(data.digestAlgorithm).update(raw).digest('hex')} inventory.json`)
    throw new Error('OCFL inventory checksum mismatch');
  return { raw, data, digest: sha256(raw) };
}

/**
 * Reads public library APIs and the wrapper's complete, paginated path listing.
 * Fresh object instances and repeated inventory/list reads avoid the library cache.
 * This is evidence under exclusive writer ownership, not a storage transaction/CAS.
 */
export async function readOniOcflObject(
  object: OcflObjectReader,
  objectId: string,
  storageIdentity: string,
  metadataLogicalPath: string,
  inspectPaths: () => Promise<OcflObjectPaths>
): Promise<OniOcflObjectEvidence> {
  const scope = { schemaVersion: 1 as const, objectId, storageIdentity };
  const before = await inspectPaths();
  if (before.workspaceEntries.length) throw new Error('Uncommitted OCFL workspace');
  const libraryInventory = await object.getInventory();
  if (!libraryInventory) {
    const after = await inspectPaths();
    if (
      before.files.length ||
      after.files.length ||
      before.rootEntries.length ||
      after.rootEntries.length ||
      after.workspaceEntries.length
    )
      throw new Error('Incomplete OCFL object without root inventory');
    return { ...scope, kind: 'absent' };
  }
  const root = await checkedInventory(object, 'inventory.json', objectId);
  if (JSON.stringify(libraryInventory.toJSON()) !== JSON.stringify(JSON.parse(root.raw)))
    throw new Error('OCFL inventory changed while reading');
  const inventory = root.data;
  const expectedPaths = new Set<string>(['inventory.json', `inventory.json.${inventory.digestAlgorithm}`]);
  const marker = `0=ocfl_object_${inventory.type.includes('/1.1/') ? '1.1' : '1.0'}`;
  expectedPaths.add(marker);
  if ((await readText(object, marker)) !== `${marker.slice(2)}\n`) throw new Error('Invalid OCFL object marker');
  const versionInventoryDigests: Record<string, string> = {};
  for (const version of Object.keys(inventory.versions)) {
    const path = `${version}/inventory.json`;
    const historical = await checkedInventory(object, path, objectId);
    if (
      historical.data.head !== version ||
      (version === inventory.head && historical.raw !== root.raw) ||
      JSON.stringify(historical.data.versions[version]) !== JSON.stringify(inventory.versions[version])
    )
      throw new Error('Inconsistent OCFL version inventory');
    versionInventoryDigests[version] = historical.digest;
    expectedPaths.add(path);
    expectedPaths.add(`${path}.${historical.data.digestAlgorithm}`);
  }
  for (const paths of Object.values(inventory.manifest)) for (const path of paths) expectedPaths.add(path);
  const files: OniOcflContentFile[] = [];
  for (const [digest, paths] of Object.entries(inventory.versions[inventory.head].state)) {
    for (const logicalPath of paths) {
      const file = object.getFile(logicalPath, inventory.head);
      if (!file) throw new Error('OCFL logical file missing');
      const hash = createHash('sha256');
      const ocflHash = createHash(inventory.digestAlgorithm);
      let size = 0;
      for await (const chunk of await file.stream()) {
        if (!(chunk instanceof Uint8Array)) throw new Error('Unsupported OCFL content stream');
        size += chunk.byteLength;
        hash.update(chunk);
        ocflHash.update(chunk);
      }
      if (ocflHash.digest('hex') !== digest) throw new Error('OCFL content digest mismatch');
      files.push({ logicalPath, size, sha256: hash.digest('hex') });
    }
  }
  const after = await inspectPaths();
  const rootAgain = await checkedInventory(object, 'inventory.json', objectId);
  const expectedFiles = [...expectedPaths].sort();
  const expectedEntries = [...new Set(expectedFiles.map(path => path.split('/')[0]))].sort();
  for (const paths of [before, after]) {
    if (
      paths.workspaceEntries.length ||
      JSON.stringify(paths.files.sort()) !== JSON.stringify(expectedFiles) ||
      JSON.stringify(paths.rootEntries.sort()) !== JSON.stringify(expectedEntries)
    )
      throw new Error('Incomplete or unexplained OCFL files');
  }
  if (rootAgain.raw !== root.raw) throw new Error('OCFL head changed during read');
  return {
    ...scope,
    kind: 'present',
    head: inventory.head,
    inventoryDigest: root.digest,
    versionInventoryDigests,
    content: createOniOcflDesiredContent(metadataLogicalPath, files),
  };
}

function validEvidence(evidence: OniOcflObjectEvidence): boolean {
  if (evidence.schemaVersion !== 1 || !evidence.objectId || !evidence.storageIdentity) return false;
  if (evidence.kind === 'absent') return true;
  return (
    evidence.kind === 'present' &&
    Number.isSafeInteger(versionNumber(evidence.head)) &&
    /^[a-f0-9]{64}$/.test(evidence.inventoryDigest) &&
    evidence.versionInventoryDigests[evidence.head] === evidence.inventoryDigest &&
    evidence.content.schemaVersion === 1 &&
    evidence.content.digest ===
      createOniOcflDesiredContent(evidence.content.metadataLogicalPath, evidence.content.files).digest
  );
}

/** No mutation or automatic retry takes place here. Persist the returned evidence before resuming. */
export async function reconcileOniOcflCommit(
  input: OniOcflCommitExpectation,
  read: () => Promise<OniOcflObjectEvidence>
): Promise<OniOcflCommitResolution> {
  try {
    if (
      !validEvidence(input.prior) ||
      input.desired.schemaVersion !== 1 ||
      input.desired.digest !==
        createOniOcflDesiredContent(input.desired.metadataLogicalPath, input.desired.files).digest ||
      typeof input.priorWriterQuiesced !== 'boolean'
    )
      return { kind: 'repair_required', reason: 'invalid_expectation' };
  } catch {
    return { kind: 'repair_required', reason: 'invalid_expectation' };
  }
  let observed: OniOcflObjectEvidence;
  try {
    observed = await read();
  } catch {
    return { kind: 'repair_required', reason: 'unreadable_evidence' };
  }
  const prior = input.prior;
  if (observed.storageIdentity !== prior.storageIdentity || observed.objectId !== prior.objectId)
    return { kind: 'repair_required', reason: 'invalid_expectation', evidence: observed };
  const unchanged =
    observed.kind === 'absent'
      ? prior.kind === 'absent'
      : prior.kind === 'present' &&
        observed.head === prior.head &&
        observed.inventoryDigest === prior.inventoryDigest &&
        observed.content.digest === prior.content.digest;
  const successor =
    observed.kind === 'present' &&
    (prior.kind === 'absent'
      ? observed.head === 'v1'
      : versionNumber(observed.head) === versionNumber(prior.head) + 1 &&
        observed.versionInventoryDigests[prior.head] === prior.inventoryDigest);
  if (observed.kind === 'present' && observed.content.digest === input.desired.digest && (unchanged || successor))
    return { kind: 'confirmed', evidence: observed };
  if (!unchanged) return { kind: 'repair_required', reason: 'unexpected_head', evidence: observed };
  if (!input.priorWriterQuiesced) return { kind: 'repair_required', reason: 'writer_not_quiesced', evidence: observed };
  return { kind: 'not_applied', evidence: observed };
}
