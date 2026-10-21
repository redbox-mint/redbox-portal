import { createHash } from 'node:crypto';
import type { Collection, Db } from 'mongodb';
import type { PublicationSourceReference } from './contracts';
import { isDuplicateKey } from './ownership';

/** References are identities by disk/key, including references embedded in provider evidence. */
export function publicationStagedReferences(value: unknown): PublicationSourceReference[] {
  const found = new Map<string, PublicationSourceReference>();
  const seen = new WeakSet<object>();
  const visit = (item: unknown): void => {
    if (!item || typeof item !== 'object') return;
    if (seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) return item.forEach(visit);
    const disk: unknown = Reflect.get(item, 'disk');
    const key: unknown = Reflect.get(item, 'key');
    const digest: unknown = Reflect.get(item, 'digest');
    const encoding: unknown = Reflect.get(item, 'encodingVersion');
    if (Object.hasOwn(item, 'disk') && Object.hasOwn(item, 'key') && encoding !== undefined) {
      if (
        encoding !== 1 ||
        typeof disk !== 'string' ||
        !disk.trim() ||
        typeof key !== 'string' ||
        !key.trim() ||
        typeof digest !== 'string' ||
        !/^[a-f0-9]{64}$/.test(digest)
      )
        throw new Error('Unsupported publication staging reference; inputs retained');
    }
    if (
      Reflect.get(item, 'encodingVersion') === 1 &&
      typeof disk === 'string' &&
      disk.trim() &&
      typeof key === 'string' &&
      key.trim() &&
      typeof digest === 'string' &&
      /^[a-f0-9]{64}$/.test(digest)
    ) {
      const reference = { encodingVersion: 1, disk, key, digest };
      found.set(identity(reference), reference);
    }
    Object.values(item).forEach(visit);
  };
  visit(value);
  return [...found.values()];
}
function identity(reference: Pick<PublicationSourceReference, 'disk' | 'key'>): string {
  return createHash('sha256')
    .update(JSON.stringify([reference.disk, reference.key]))
    .digest('hex');
}
/** A separate fence identity: deleting original bytes never tombstones their retained staged recovery copy. */
export function publicationOriginalReference(
  brandId: string,
  original: { oid: string; fileId: string; digest: string }
): PublicationSourceReference {
  if (
    ![brandId, original.oid, original.fileId].every(value => typeof value === 'string' && value.trim()) ||
    !/^[a-f0-9]{64}$/.test(original.digest)
  )
    throw new Error('Invalid original attachment identity');
  return {
    encodingVersion: 1,
    disk: 'publication-original-attachments',
    key: JSON.stringify([brandId, original.oid, original.fileId]),
    digest: original.digest,
  };
}
/** Examine live record metadata only; historical approval snapshots are separate recovery evidence. */
export function publicationRecordAttachmentIds(value: unknown): string[] {
  const result = new Set<string>();
  const seen = new WeakSet<object>();
  const visit = (item: unknown): void => {
    if (!item || typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    if (Reflect.get(item, 'type') === 'attachment' && typeof Reflect.get(item, 'fileId') === 'string')
      result.add(String(Reflect.get(item, 'fileId')));
    Object.values(item).forEach(visit);
  };
  visit(value);
  return [...result];
}
interface StagingReferenceRow {
  _id: string;
  schemaVersion: 1;
  reference: PublicationSourceReference;
  state: 'live' | 'deleting';
  generation: number;
  admissions: number;
  managed: boolean;
  children: PublicationSourceReference[];
  deletedAt?: number;
}

/** Admission failed before the containing reference write was dispatched. */
export class PublicationStagingAdmissionDenied extends Error {
  constructor() {
    super('Publication staging input is fenced for deletion');
    this.name = 'PublicationStagingAdmissionDenied';
  }
}

/**
 * A pin is durable and has no expiry: an interrupted Mongo write/reader may still finish.
 * Only a successful containing operation releases it. A deletion tombstone is irreversible,
 * so a delayed disk delete is safe even after a cleaner crashes or loses its Agenda lock.
 */
/** Host-owned publication implementation; extend through PublicationService and adapter contexts. @internal */
export class PublicationStagingFence {
  readonly collection: Collection<StagingReferenceRow>;
  constructor(db: Db, collectionName = 'publicationstagingreference') {
    this.collection = db.collection<StagingReferenceRow>(collectionName);
  }
  private validate(row: StagingReferenceRow): void {
    if (
      row.schemaVersion !== 1 ||
      !['live', 'deleting'].includes(row.state) ||
      !Number.isSafeInteger(row.generation) ||
      row.generation < 0 ||
      !Number.isSafeInteger(row.admissions) ||
      row.admissions < 0 ||
      !Array.isArray(row.children)
    )
      throw new Error('Unsupported staging reference fence; inputs retained');
  }
  async expand(value: unknown): Promise<PublicationSourceReference[]> {
    const references = new Map<string, PublicationSourceReference>();
    const pending = publicationStagedReferences(value);
    while (pending.length) {
      const reference = pending.pop()!;
      const id = identity(reference);
      if (references.has(id)) continue;
      references.set(id, reference);
      const row = await this.collection.findOne({ _id: id });
      // An older/extension-written manifest may hide references to managed children.
      // Its missing graph is incomplete evidence, never proof of unreachability.
      if (!row?.managed) throw new Error('Publication staging graph is unregistered; inputs retained');
      this.validate(row);
      pending.push(...row.children);
    }
    return [...references.values()];
  }
  async acquire(value: unknown): Promise<() => Promise<void>> {
    return this.acquireReferences(value);
  }
  async pinOriginal(
    brandId: string,
    original: { oid: string; fileId: string; digest: string }
  ): Promise<() => Promise<void>> {
    const reference = publicationOriginalReference(brandId, original);
    const release = await this.reserve(reference, []);
    try {
      // A live file ID can receive new bytes before cleanup. Admission protects the physical
      // location; each deletion still has to match its own approved digest and the live bytes.
      const result = await this.collection.updateOne(
        { _id: identity(reference), state: 'live', admissions: { $gt: 0 } },
        { $set: { reference, managed: true }, $inc: { generation: 1 } },
        { writeConcern: { w: 'majority', j: true } }
      );
      if (!result.matchedCount) throw new Error('Original attachment admission was lost');
      return release;
    } catch (error) {
      // Registration cannot start a reader or a containing write. Even a late
      // registration result cannot use these bytes or admit a new reference.
      await release();
      throw error;
    }
  }
  /** Register a deterministic host identity under a pin, without reopening an existing tombstone. */
  async pinRegistered(reference: PublicationSourceReference): Promise<() => Promise<void>> {
    const release = await this.reserve(reference, []);
    try {
      const row = await this.collection.findOne({ _id: identity(reference) });
      if (!row || row.reference.digest !== reference.digest)
        throw new Error('Original attachment identity changed; retained for recovery');
      if (!row.managed) {
        // Two independent preflights can register the same immutable identity concurrently.
        await this.collection.updateOne(
          { _id: row._id, state: 'live', managed: false, admissions: { $gt: 0 } },
          { $set: { managed: true }, $inc: { generation: 1 } },
          { writeConcern: { w: 'majority', j: true } }
        );
      }
      return release;
    } catch (error) {
      // The capability was never returned, so its containing write has not started.
      await release();
      throw error;
    }
  }
  /** A host decision has no hidden byte graph and needs no admission pin of its own. */
  async registerDecision(reference: PublicationSourceReference): Promise<void> {
    if (reference.disk !== 'publication-completion-admission') throw new Error('Invalid publication decision identity');
    try {
      await this.collection.updateOne(
        { _id: identity(reference) },
        {
          $setOnInsert: {
            schemaVersion: 1,
            reference,
            state: 'live',
            generation: 0,
            admissions: 0,
            managed: true,
            children: [],
          },
        },
        { upsert: true, writeConcern: { w: 'majority', j: true } }
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  /** A fresh UUID is private until put/read-back/registration finish under this pin. */
  async reserve(
    reference: PublicationSourceReference,
    children: PublicationSourceReference[]
  ): Promise<() => Promise<void>> {
    return this.acquireReferences([reference, ...children], identity(reference));
  }
  private async acquireReferences(value: unknown, reserved?: string): Promise<() => Promise<void>> {
    const acquired = new Set<string>();
    const pending = publicationStagedReferences(value);
    let opaqueGraph = false;
    try {
      while (pending.length) {
        const reference = pending.pop()!;
        const id = identity(reference);
        if (acquired.has(id)) continue;
        try {
          await this.collection.updateOne(
            { _id: id },
            {
              $setOnInsert: {
                schemaVersion: 1,
                reference,
                state: 'live',
                generation: 0,
                admissions: 0,
                managed: false,
                children: [],
              },
            },
            { upsert: true, writeConcern: { w: 'majority', j: true } }
          );
        } catch (error) {
          if (!isDuplicateKey(error)) throw error;
        }
        const row = await this.collection.findOneAndUpdate(
          { _id: id, schemaVersion: 1, state: 'live' },
          { $inc: { admissions: 1, generation: 1 } },
          { returnDocument: 'after', includeResultMetadata: false, writeConcern: { w: 'majority', j: true } }
        );
        if (!row) throw new PublicationStagingAdmissionDenied();
        acquired.add(id);
        this.validate(row);
        pending.push(...row.children);
        if (!row.managed && id !== reserved && !opaqueGraph) {
          // A pre-fence immutable manifest can hide any previously registered input.
          // Pin the whole existing set before admitting it. Rows are never removed,
          // and a staged UUID is not exposed until registration, so its possible
          // managed children already belong to this set. Any tombstone rejects the
          // opaque admission rather than guessing whether it hides deleted bytes.
          opaqueGraph = true;
          for await (const known of this.collection.find({ managed: true })) pending.push(known.reference);
        }
      }
    } catch (error) {
      // No containing write has started. Known acquired pins can be released.
      await this.release(acquired);
      throw error;
    }
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      await this.release(acquired);
    };
  }
  private async release(ids: Iterable<string>): Promise<void> {
    for (const id of ids)
      await this.collection.updateOne(
        { _id: id, schemaVersion: 1, state: 'live', admissions: { $gt: 0 } },
        { $inc: { admissions: -1 } },
        { writeConcern: { w: 'majority', j: true } }
      );
  }
  async admit<T>(value: unknown, run: () => Promise<T>): Promise<T> {
    const release = await this.acquire(value);
    const result = await run();
    await release();
    return result;
  }
  /** Source/lifecycle writes interlock with original-byte tombstones, including ordinary draft saves. */
  async admitRecord<T>(record: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
    const snapshot: unknown = record.deletedRecordMetadata;
    const content =
      snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
        ? (snapshot as Record<string, unknown>)
        : record;
    const brandId: unknown =
      content.metaMetadata && typeof content.metaMetadata === 'object'
        ? Reflect.get(content.metaMetadata, 'brandId')
        : undefined;
    const oid = content.redboxOid ?? record.redboxOid;
    const references: PublicationSourceReference[] = [];
    if (typeof brandId === 'string' && typeof oid === 'string') {
      for (const fileId of publicationRecordAttachmentIds(content.metadata)) {
        const key = JSON.stringify([brandId, oid, fileId]);
        const row = await this.collection.findOne({
          _id: identity({ disk: 'publication-original-attachments', key }),
        });
        if (row) references.push(row.reference);
      }
    }
    return this.admit([record, ...references], run);
  }
  /** Called under a pin, after durable read-back. Only this writer creates reclaimable objects. */
  async complete(reference: PublicationSourceReference, children: PublicationSourceReference[]): Promise<void> {
    const result = await this.collection.updateOne(
      { _id: identity(reference), schemaVersion: 1, state: 'live', admissions: { $gt: 0 }, managed: false },
      { $set: { reference, children, managed: true }, $inc: { generation: 1 } },
      { writeConcern: { w: 'majority', j: true } }
    );
    if (!result.matchedCount) throw new Error('Publication staging registration was lost');
  }
  async deleteIfUnreferenced(
    reference: PublicationSourceReference,
    referenced: () => Promise<boolean>,
    remove: () => Promise<void>
  ): Promise<boolean> {
    const row = await this.collection.findOne({ _id: identity(reference) });
    // Pre-fence/unregistered files have no complete admission history. Retain them.
    if (!row?.managed) return false;
    this.validate(row);
    if (row.state === 'live') {
      if (reference.digest !== row.reference.digest)
        throw new Error('Publication staging bytes changed; inputs retained');
      if (row.admissions || (await referenced())) return false;
      const decision = await this.collection.updateOne(
        { _id: row._id, schemaVersion: 1, state: 'live', generation: row.generation, admissions: 0 },
        { $set: { state: 'deleting' }, $inc: { generation: 1 } },
        { writeConcern: { w: 'majority', j: true } }
      );
      if (!decision.matchedCount) return false;
    }
    await remove();
    await this.collection.updateOne({ _id: row._id, state: 'deleting' }, { $set: { deletedAt: Date.now() } });
    return true;
  }
}
