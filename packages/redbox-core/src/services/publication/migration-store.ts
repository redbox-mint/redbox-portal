import { isPublicationObject } from './builtins';
import { PublicationStagingFence } from './staging-fence';
import type { Collection, Db } from 'mongodb';
import type { PublicationMigrationModel } from '../../model/storage/PublicationMigrationModel';
import type { PublicationObject } from './contracts';
import type { PublicationConfigurationContext } from './configuration';
import { canonicalPublicationJson, publicationDigest } from './canonical';
import { isDuplicateKey } from './ownership';

export interface PublicationMigrationItem {
  schemaVersion: 1;
  brandId: string;
  migrationId: string;
  id: string;
  oid: string;
  destinationId: string;
  fingerprint: string;
  evidence: PublicationObject;
  quarantine: string[];
  conflictGroup?: string;
  converted: boolean;
  resolution?: { correctionId: string; evidenceReference: string; at: string };
}

/** Immutable evidence plus conditional, monotonic progress. No method resets committed authority. */
export class PublicationMigrationStore {
  readonly collection: Collection<PublicationMigrationModel>;
  readonly items: Collection<PublicationMigrationItem>;
  constructor(readonly db: Db) {
    this.collection = db.collection('publicationmigration');
    this.items = db.collection('publicationmigrationitem');
  }
  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ brandId: 1 }, { unique: true });
    await this.items.createIndex({ brandId: 1, id: 1 }, { unique: true });
    await this.items.createIndex({ brandId: 1, oid: 1, destinationId: 1 });
    await this.items.createIndex({ conflictGroup: 1 });
    await this.db
      .collection('publicationmigrationinventory')
      .createIndex({ brandId: 1, fingerprint: 1 }, { unique: true });
  }
  async get(brandId: string): Promise<PublicationMigrationModel | null> {
    const rows = await this.collection.find({ brandId }).limit(2).toArray();
    if (rows.length > 1) throw new Error('Ambiguous publication brand authority; activation blocked');
    const row = rows[0];
    if (row && (row.schemaVersion !== 1 || !['preparing', 'shared'].includes(row.authority)))
      throw new Error('Unsupported publication migration authority; evidence retained');
    if (
      row &&
      (!['paused', 'prepared', 'converted', 'verified', 'committed'].includes(row.phase) ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 0 ||
        !isPublicationObject(row.assignments) ||
        !Object.values(row.assignments).every(value => typeof value === 'string' && value.trim()) ||
        !isPublicationObject(row.usedDestinations) ||
        !Object.values(row.usedDestinations).every(
          identity =>
            isPublicationObject(identity) &&
            typeof identity.providerId === 'string' &&
            identity.providerId.trim() &&
            typeof identity.targetFingerprint === 'string' &&
            identity.targetFingerprint.trim()
        ) ||
        !isPublicationObject(row.verifiedTargets) ||
        !Array.isArray(row.globalFailures) ||
        !isPublicationObject(row.counts) ||
        !['sources', 'converted', 'quarantined'].every(
          key => Number.isSafeInteger(Reflect.get(row.counts, key)) && Reflect.get(row.counts, key) >= 0
        ))
    )
      throw new Error('Invalid publication migration authority; activation blocked and evidence retained');
    if (row?.authority === 'shared' && (row.phase !== 'committed' || !row.committedAt))
      throw new Error('Incomplete committed publication authority; activation blocked');
    return row ?? null;
  }
  async context(brandId: string): Promise<PublicationConfigurationContext> {
    const row = await this.get(brandId);
    return row
      ? {
          authority: row.authority,
          usedDestinations: row.usedDestinations,
          verifiedTargets: row.verifiedTargets,
          legacyDestinations: Object.fromEntries(
            ['figshare', 'oni'].map(provider => [
              provider,
              Object.entries(row.assignments)
                .filter(([key]) => key === provider || key.startsWith(`${provider}:`))
                .map(([, id]) => id),
            ])
          ),
        }
      : { authority: 'legacy' };
  }
  async begin(
    initial: PublicationMigrationModel,
    afterInventory?: () => Promise<void>
  ): Promise<PublicationMigrationModel> {
    await this.db.collection('publicationmigrationinventory').updateOne(
      { brandId: initial.brandId, fingerprint: initial.inventoryFingerprint },
      {
        $setOnInsert: {
          brandId: initial.brandId,
          fingerprint: initial.inventoryFingerprint,
          configurationFingerprint: initial.configurationFingerprint,
          sourceFingerprint: initial.sourceFingerprint,
          at: initial.startedAt,
          actor: initial.actor,
        },
      },
      { upsert: true, writeConcern: { w: 'majority', j: true } }
    );
    await afterInventory?.();
    try {
      await this.collection.updateOne(
        { brandId: initial.brandId },
        { $setOnInsert: initial },
        { upsert: true, writeConcern: { w: 'majority', j: true } }
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    let row = await this.get(initial.brandId);
    // A drain can finish before preparation. Keep every prior inventory fingerprint and
    // refresh source evidence only while no converted item/configuration has been accepted.
    if (
      row?.authority === 'preparing' &&
      row.phase === 'paused' &&
      row.configurationFingerprint === initial.configurationFingerprint &&
      canonicalPublicationJson(row.assignments) === canonicalPublicationJson(initial.assignments) &&
      row.inventoryFingerprint !== initial.inventoryFingerprint &&
      !(await this.items.findOne({ brandId: initial.brandId }))
    ) {
      row = await this.collection.findOneAndUpdate(
        { brandId: row.brandId, revision: row.revision, phase: 'paused', authority: 'preparing' },
        {
          $set: {
            inventoryFingerprint: initial.inventoryFingerprint,
            sourceFingerprint: initial.sourceFingerprint,
            counts: initial.counts,
            globalFailures: initial.globalFailures,
          },
          $inc: { revision: 1 },
        },
        { returnDocument: 'after', writeConcern: { w: 'majority', j: true } }
      );
    }
    if (!row || row.inventoryFingerprint !== initial.inventoryFingerprint || row.migrationId !== initial.migrationId)
      throw new Error('Migration inventory changed; retain the fence and review source/configuration drift');
    return row;
  }
  async progress(
    snapshot: PublicationMigrationModel,
    phase: PublicationMigrationModel['phase'],
    values: Partial<Pick<PublicationMigrationModel, 'counts' | 'verifiedTargets' | 'globalFailures'>> = {}
  ): Promise<PublicationMigrationModel> {
    const phases = ['paused', 'prepared', 'converted', 'verified', 'committed'];
    if (phases.indexOf(phase) < phases.indexOf(snapshot.phase)) return snapshot;
    if (
      phase === snapshot.phase &&
      Object.entries(values).every(
        ([key, value]) => canonicalPublicationJson(value) === canonicalPublicationJson(Reflect.get(snapshot, key))
      )
    )
      return snapshot;
    if (phase === 'committed' && (snapshot.phase !== 'verified' || snapshot.globalFailures.length))
      throw new Error('Publication authority requires verified evidence and no global failures');
    const result = await this.collection.findOneAndUpdate(
      { brandId: snapshot.brandId, revision: snapshot.revision, authority: 'preparing' },
      {
        $set: {
          ...values,
          phase,
          ...(phase === 'committed' ? { authority: 'shared' as const, committedAt: new Date().toISOString() } : {}),
        },
        $inc: { revision: 1 },
        $push: {
          history: {
            phase,
            at: new Date().toISOString(),
            globalFailures: values.globalFailures ?? snapshot.globalFailures,
          },
        },
      },
      { returnDocument: 'after', writeConcern: { w: 'majority', j: true } }
    );
    if (!result) throw new Error('Publication migration progress changed; reload before continuing');
    return result;
  }
  async retain(item: PublicationMigrationItem): Promise<void> {
    try {
      await new PublicationStagingFence(this.db).admit(item.evidence, () =>
        this.items.updateOne(
          { brandId: item.brandId, id: item.id },
          { $setOnInsert: item },
          { upsert: true, writeConcern: { w: 'majority', j: true } }
        )
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    const saved = await this.items.findOne({ brandId: item.brandId, id: item.id });
    if (
      !saved ||
      saved.fingerprint !== item.fingerprint ||
      canonicalPublicationJson(saved.evidence) !== canonicalPublicationJson(item.evidence) ||
      canonicalPublicationJson(saved.quarantine) !== canonicalPublicationJson(item.quarantine)
    )
      throw new Error('Migration evidence changed; existing evidence retained');
  }
  async converted(item: PublicationMigrationItem): Promise<void> {
    await this.items.updateOne(
      { brandId: item.brandId, id: item.id, fingerprint: item.fingerprint },
      { $set: { converted: true } },
      { writeConcern: { w: 'majority', j: true } }
    );
  }
  async quarantineCount(brandId: string, oid: string, destinationId?: string): Promise<number> {
    const rows = await this.items
      .find({
        brandId,
        oid,
        ...(destinationId ? { destinationId } : {}),
        'quarantine.0': { $exists: true },
        resolution: { $exists: false },
      })
      .toArray();
    return new Set(rows.map(row => row.destinationId)).size;
  }
  async resolve(
    brandId: string,
    oid: string,
    destinationId: string,
    correctionId: string,
    evidenceReference: string
  ): Promise<void> {
    await this.items.updateMany(
      { brandId, oid, destinationId, resolution: { $exists: false } },
      { $set: { resolution: { correctionId, evidenceReference, at: new Date().toISOString() } } },
      { writeConcern: { w: 'majority', j: true } }
    );
  }
  async assertNotQuarantined(brandId: string, oid: string, destinationId: string): Promise<void> {
    if (await this.quarantineCount(brandId, oid, destinationId))
      throw new Error('Publication migration quarantine requires evidence-preserving repair');
  }
}

export function publicationMigrationId(brandId: string): string {
  return `migration-v1:${publicationDigest({ brandId, version: 1 })}`;
}
