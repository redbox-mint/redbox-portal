import { isDuplicateKey } from './ownership';
import { randomUUID } from 'node:crypto';
import { cloneDeep } from 'lodash';
import type { Db, Collection } from 'mongodb';
import type { PublicationPublishingConfigData } from '../../configmodels/PublicationPublishing';

interface Control {
  brandId: string;
  destinationId: string;
  paused: boolean;
  lock?: { token: string; expiresAt: number };
  correctionId?: string;
  destinationPauses?: Record<string, { paused: boolean; correctionId: string }>;
  admissions?: Array<{ token: string; expiresAt: number }>;
}
/** Durable operational gates are separate from editable configuration and never change target identity. */
export class PublicationAdminControl {
  readonly collection: Collection<Control>;
  constructor(db: Db) {
    this.collection = db.collection('publicationadmincontrol', { writeConcern: { w: 'majority', j: true } });
  }
  async acquire(brandId: string): Promise<string> {
    await this.collection.createIndex({ brandId: 1, destinationId: 1 }, { unique: true });
    await this.collection.updateOne(
      { brandId, destinationId: '' },
      { $setOnInsert: { brandId, destinationId: '', paused: false } },
      { upsert: true }
    );
    const token = randomUUID();
    const result = await this.collection.updateOne(
      {
        brandId,
        destinationId: '',
        'admissions.0': { $exists: false },
        $or: [{ lock: { $exists: false } }, { 'lock.expiresAt': { $lte: Date.now() } }],
      },
      { $set: { lock: { token, expiresAt: Date.now() + 120000 } } }
    );
    if (!result.matchedCount) throw new Error('Publication administration is already active for this brand');
    return token;
  }
  /** Shared save admissions interlock atomically with the exclusive administration lease. */
  async admit(brandId: string): Promise<string> {
    await this.collection.createIndex({ brandId: 1, destinationId: 1 }, { unique: true });
    try {
      await this.collection.updateOne(
        { brandId, destinationId: '' },
        { $setOnInsert: { brandId, destinationId: '', paused: false } },
        { upsert: true }
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    const token = randomUUID();
    const result = await this.collection.updateOne(
      { brandId, destinationId: '', $or: [{ lock: { $exists: false } }, { 'lock.expiresAt': { $lte: Date.now() } }] },
      { $push: { admissions: { token, expiresAt: Date.now() + 120000 } } }
    );
    if (!result.matchedCount) throw new Error('Publication administration fences source acceptance');
    return token;
  }
  async finishAdmission(brandId: string, token: string): Promise<void> {
    await this.collection.updateOne({ brandId, destinationId: '' }, { $pull: { admissions: { token } } });
  }
  async assertOwner(brandId: string, token: string): Promise<void> {
    if (
      !(await this.collection.findOne({
        brandId,
        destinationId: '',
        'lock.token': token,
        'lock.expiresAt': { $gt: Date.now() },
      }))
    )
      throw new Error('Publication administrative ownership expired; inspect and retry');
  }
  async release(brandId: string, token: string): Promise<void> {
    await this.collection.updateOne({ brandId, destinationId: '', 'lock.token': token }, { $unset: { lock: '' } });
  }
  async setPaused(
    brandId: string,
    destinationId: string,
    paused: boolean,
    token: string,
    correctionId: string
  ): Promise<void> {
    if (destinationId && !/^[a-z][a-z0-9-]{0,63}$/.test(destinationId))
      throw new Error('Invalid publication destination ID');
    await this.assertOwner(brandId, token);
    // Keep destination decisions on the lock-owning document too: a separate
    // destination write cannot atomically reject a late former administrator.
    const result = await this.collection.updateOne(
      { brandId, destinationId: '', 'lock.token': token, 'lock.expiresAt': { $gt: Date.now() } },
      {
        $set: destinationId
          ? { [`destinationPauses.${destinationId}`]: { paused, correctionId } }
          : { paused, correctionId },
      }
    );
    if (!result.matchedCount) throw new Error('Publication administrative ownership changed or expired');
  }
  async overlay(brandId: string, config: PublicationPublishingConfigData): Promise<PublicationPublishingConfigData> {
    const result = cloneDeep(config);
    const gates = await this.collection.find({ brandId }).toArray();
    const pauses = gates.find(gate => !gate.destinationId)?.destinationPauses ?? {};
    for (const gate of gates) {
      // An explicit new decision supersedes a retained pre-upgrade destination row.
      if (gate.destinationId && Object.hasOwn(pauses, gate.destinationId)) continue;
      if (!gate.paused && !(gate.lock && gate.lock.expiresAt > Date.now())) continue;
      if (!gate.destinationId) result.processing.enabled = false;
      else if (result.destinations[gate.destinationId]) result.destinations[gate.destinationId].enabled = false;
    }
    for (const [id, decision] of Object.entries(pauses))
      if (decision.paused && result.destinations[id]) result.destinations[id].enabled = false;
    return result;
  }
}
