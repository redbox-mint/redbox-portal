import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import type { Services as StorageManagerServices } from '../StorageManagerService';
import type { PublicationSourceReference } from './contracts';
import { PUBLICATION_SOURCE_ENCODING, byteDigest } from './canonical';
import { PublicationStagingFence, publicationStagedReferences } from './staging-fence';

type StagingDisk = Pick<StorageManagerServices.IDisk, 'putStream' | 'getStream' | 'delete' | 'getMetaData' | 'listAll'>;
/** The caller must fence new references while checking ALL source, work and recovery references. */
export interface PublicationStagingReferences {
  deleteIfUnreferenced(reference: PublicationSourceReference, remove: () => Promise<void>): Promise<boolean>;
}
export interface PublicationStagingReferenceSources {
  /** Admission of references and cleanup use the same per-key fence. Match disk/key, never digest alone. */
  withReferenceFence<T>(reference: PublicationSourceReference, run: () => Promise<T>): Promise<T>;
  source(reference: PublicationSourceReference): Promise<boolean>;
  work(reference: PublicationSourceReference): Promise<boolean>;
  recovery(reference: PublicationSourceReference): Promise<boolean>;
}
export function publicationStagingReferences(
  sources: PublicationStagingReferenceSources
): PublicationStagingReferences {
  return {
    deleteIfUnreferenced: (reference, remove) =>
      sources.withReferenceFence(reference, async () => {
        const referenced = await Promise.all([
          sources.source(reference),
          sources.work(reference),
          sources.recovery(reference),
        ]);
        if (referenced.some(Boolean)) return false;
        await remove();
        return true;
      }),
  };
}
export interface PublicationAttachmentSource {
  id: string;
  logicalPath: string;
  /** Retain a sealed recovery copy before the host can reclaim this original attachment. */
  original?: { oid: string; fileId: string };
  inspect(): Promise<{ size: number; digest?: string; immutableVersion?: string; changeToken?: string }>;
  /** An immutable version must open those exact bytes, including after live replacement. */
  open(immutableVersion?: string): Promise<Readable>;
}
const DIGEST = /^[a-f0-9]{64}$/;
const PREFIX = 'publication-inputs';
function brandScope(brandId: string): string {
  if (!brandId.trim()) throw new Error('Publication staging brand is required');
  return `${PREFIX}/${createHash('sha256').update(brandId).digest('hex')}/`;
}
function isDigest(digest: string): boolean {
  return DIGEST.test(digest);
}
async function hashStream(stream: Readable): Promise<{ digest: string; size: number }> {
  const hash = createHash('sha256');
  let size = 0;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(bytes);
      size += bytes.length;
    }
    return { digest: hash.digest('hex'), size };
  } finally {
    stream.destroy();
  }
}
/** Append-only keys on a configured durable Flydrive disk. No process-local temporary files. */
export class PublicationStaging {
  constructor(
    readonly diskName: string,
    private readonly disk: StagingDisk,
    private readonly fence?: PublicationStagingFence
  ) {
    if (!diskName.trim()) throw new Error('A durable publication staging disk is required');
  }
  private validate(brandId: string, reference: PublicationSourceReference): void {
    if (
      reference.encodingVersion !== PUBLICATION_SOURCE_ENCODING ||
      reference.disk !== this.diskName ||
      !isDigest(reference.digest) ||
      !reference.key.startsWith(brandScope(brandId)) ||
      !/^[a-f0-9-]{36}$/.test(reference.key.slice(brandScope(brandId).length))
    )
      throw new Error('Invalid or cross-brand publication input reference');
  }
  async put(
    brandId: string,
    stream: Readable,
    children: PublicationSourceReference[] = []
  ): Promise<{ reference: PublicationSourceReference; size: number }> {
    const key = `${brandScope(brandId)}${randomUUID()}`;
    const reserved = { encodingVersion: PUBLICATION_SOURCE_ENCODING, disk: this.diskName, key, digest: '0'.repeat(64) };
    const release = await this.fence?.reserve(reserved, children);
    const hash = createHash('sha256');
    let size = 0;
    const hashing = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        size += chunk.length;
        callback(null, chunk);
      },
    });
    const onError = (error: Error) => hashing.destroy(error);
    stream.on('error', onError);
    stream.pipe(hashing);
    try {
      await this.disk.putStream(key, hashing, { contentType: 'application/octet-stream' });
      const reference: PublicationSourceReference = {
        encodingVersion: PUBLICATION_SOURCE_ENCODING,
        disk: this.diskName,
        key,
        digest: hash.digest('hex'),
      };
      // The reservation already pins this new object and its children.
      await this.verifyBytes(brandId, reference, size);
      await this.fence?.complete(reference, children);
      await release?.();
      return { reference, size };
    } finally {
      stream.off('error', onError);
      stream.destroy();
      hashing.destroy();
    }
  }
  async putJson(brandId: string, encoded: string): Promise<PublicationSourceReference> {
    if (Buffer.byteLength(encoded, 'utf8') > 32 * 1024 * 1024)
      throw new Error('Publication descriptor exceeds the supported size');
    return (
      await this.put(
        brandId,
        Readable.from([Buffer.from(encoded, 'utf8')]),
        publicationStagedReferences(JSON.parse(encoded))
      )
    ).reference;
  }
  async verify(brandId: string, reference: PublicationSourceReference, expectedSize?: number): Promise<void> {
    this.validate(brandId, reference);
    const release = await this.fence?.acquire(reference);
    try {
      await this.verifyBytes(brandId, reference, expectedSize);
    } finally {
      // A finished read has no ambiguous containing write that could admit a new reference.
      await release?.();
    }
  }
  private async verifyBytes(
    brandId: string,
    reference: PublicationSourceReference,
    expectedSize?: number
  ): Promise<void> {
    this.validate(brandId, reference);
    const actual = await hashStream(await this.disk.getStream(reference.key));
    if (actual.digest !== reference.digest || (expectedSize !== undefined && actual.size !== expectedSize))
      throw new Error('Sealed publication input integrity check failed');
  }
  async open(brandId: string, reference: PublicationSourceReference, expectedSize?: number): Promise<Readable> {
    this.validate(brandId, reference);
    const release = await this.fence?.acquire(reference);
    try {
      await this.verifyBytes(brandId, reference, expectedSize);
      const stream = await this.disk.getStream(reference.key);
      // A reader owns the pin until its stream closes, including slow provider uploads.
      if (release)
        stream.once('close', () => {
          void release().catch(() => {
            /* Retain on uncertain release. */
          });
        });
      return stream;
    } catch (error) {
      await release?.();
      throw error;
    }
  }
  async readJson(brandId: string, reference: PublicationSourceReference): Promise<unknown> {
    this.validate(brandId, reference);
    const release = await this.fence?.acquire(reference);
    try {
      return await this.readJsonBytes(brandId, reference);
    } finally {
      await release?.();
    }
  }
  private async readJsonBytes(brandId: string, reference: PublicationSourceReference): Promise<unknown> {
    this.validate(brandId, reference);
    const stream = await this.disk.getStream(reference.key);
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of stream) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > 32 * 1024 * 1024) throw new Error('Publication descriptor exceeds the supported size');
        chunks.push(bytes);
      }
    } finally {
      stream.destroy();
    }
    const bytes = Buffer.concat(chunks);
    if (byteDigest(bytes) !== reference.digest) throw new Error('Sealed publication descriptor integrity check failed');
    return JSON.parse(bytes.toString('utf8'));
  }
  async prepareAttachment(
    brandId: string,
    source: PublicationAttachmentSource
  ): Promise<import('./contracts').PublicationAttachment> {
    if (
      !source.id.trim() ||
      !source.logicalPath ||
      source.logicalPath.startsWith('/') ||
      source.logicalPath.split(/[\\/]/).some(part => !part || part === '.' || part === '..')
    )
      throw new Error('Invalid publication attachment identity or logical path');
    const before = await source.inspect();
    if (
      !Number.isSafeInteger(before.size) ||
      before.size < 0 ||
      (before.digest !== undefined && !isDigest(before.digest)) ||
      before.immutableVersion === ''
    )
      throw new Error('Invalid publication attachment version or digest');
    const base = { id: source.id, logicalPath: source.logicalPath, size: before.size };
    // Reuse trustworthy immutable identity. The worker must validate live digests or open the immutable version.
    if (before.digest && !source.original)
      return {
        ...base,
        digest: before.digest,
        ...(before.immutableVersion ? { immutableVersion: before.immutableVersion } : {}),
      };
    if (before.immutableVersion && !source.original) return { ...base, immutableVersion: before.immutableVersion };
    const original = source.original && before.digest ? { ...source.original, digest: before.digest } : undefined;
    if (source.original && !original) throw new Error('Reclaimable original attachments require a verified digest');
    const release = original && this.fence ? await this.fence.pinOriginal(brandId, original) : undefined;
    try {
      const staged = await this.put(brandId, await source.open());
      const after = await source.inspect();
      if (
        staged.size !== before.size ||
        after.size !== before.size ||
        after.changeToken !== before.changeToken ||
        after.digest !== before.digest ||
        after.immutableVersion !== before.immutableVersion
      )
        throw new Error('Publication attachment changed during preparation');
      // Stores without a trustworthy change token must prove that staged bytes match a second read.
      if (!before.changeToken) {
        const current = await hashStream(await source.open());
        if (current.digest !== staged.reference.digest || current.size !== staged.size)
          throw new Error('Publication attachment changed during preparation');
      }
      if (before.digest && staged.reference.digest !== before.digest)
        throw new Error('Original attachment digest changed');
      return { ...base, digest: staged.reference.digest, staged: staged.reference, ...(original ? { original } : {}) };
    } finally {
      // This pin protects only reads of the original. Any ambiguous staged-object write retains its own pin.
      await release?.();
    }
  }
  async openAttachment(
    brandId: string,
    attachment: import('./contracts').PublicationAttachment,
    source?: PublicationAttachmentSource
  ): Promise<Readable> {
    if (attachment.staged) {
      if (attachment.digest !== attachment.staged.digest) throw new Error('Publication attachment digest mismatch');
      return this.open(brandId, attachment.staged, attachment.size);
    }
    if (!source || source.id !== attachment.id || source.logicalPath !== attachment.logicalPath)
      throw new Error('Sealed attachment source is unavailable');
    // Verify before handing any bytes to a provider. Hash-only live stores are staged now so a second read cannot race a rewrite.
    const prepared = await this.put(brandId, await source.open(attachment.immutableVersion));
    if (prepared.size !== attachment.size || (attachment.digest && prepared.reference.digest !== attachment.digest))
      throw new Error('Approved publication attachment bytes changed');
    return this.open(brandId, prepared.reference, attachment.size);
  }
  async cleanup(
    brandId: string,
    references: PublicationStagingReferences,
    options: { now: number; graceMs: number }
  ): Promise<{ scanned: number; deleted: number; retained: number }> {
    if (!Number.isSafeInteger(options.graceMs) || options.graceMs <= 0 || !Number.isSafeInteger(options.now))
      throw new Error('Publication staging cleanup requires a positive grace period');
    const keys: string[] = [];
    let paginationToken: string | undefined;
    do {
      const listing = await this.disk.listAll(brandScope(brandId), {
        recursive: true,
        ...(paginationToken ? { paginationToken } : {}),
      });
      for (const object of listing.objects) {
        if (!object || typeof object !== 'object' || !('key' in object) || typeof object.key !== 'string')
          throw new Error('Invalid publication staging listing');
        keys.push(object.key);
      }
      paginationToken = listing.paginationToken;
    } while (paginationToken);
    const result = { scanned: keys.length, deleted: 0, retained: 0 };
    for (const key of keys) {
      const metadata = await this.disk.getMetaData(key);
      const modified = metadata.lastModified?.getTime();
      if (!Number.isFinite(modified) || options.now - modified < options.graceMs) {
        result.retained++;
        continue;
      }
      // Read-back supplies the digest for the reference guard. Malformed keys fail closed.
      const actual = await hashStream(await this.disk.getStream(key));
      const reference = {
        encodingVersion: PUBLICATION_SOURCE_ENCODING,
        disk: this.diskName,
        key,
        digest: actual.digest,
      };
      this.validate(brandId, reference);
      if (await references.deleteIfUnreferenced(reference, () => this.disk.delete(key))) result.deleted++;
      else result.retained++;
    }
    return result;
  }
}
