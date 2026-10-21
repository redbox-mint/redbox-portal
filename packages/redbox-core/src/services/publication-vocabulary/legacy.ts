import { hostname } from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { PublicationVocabularyStore } from './store';
import { isDuplicateKey } from '../publication/ownership';
import { PublicationVocabularyError, isPublicationVocabularyAdministrationEnabled } from './contracts';

const legacyAdmission = new AsyncLocalStorage<string>();
/** Persistent admissions have no timeout promotion: an interrupted legacy writer requires operator investigation. */
export async function withLegacyVocabularyWriter<T>(
  brandId: string,
  action: () => Promise<T>,
  shared: () => Promise<T>
): Promise<T> {
  if (legacyAdmission.getStore() === brandId) return action();
  if (
    typeof PublicationVocabularyService === 'undefined' ||
    typeof Vocabulary === 'undefined' ||
    !Vocabulary.getDatastore
  )
    return action();
  const db: Db = PublicationSync.getDatastore().manager;
  if (!Object.is(Vocabulary.getDatastore().manager, db))
    throw new PublicationVocabularyError('Vocabulary conversion requires one Mongo datastore', 409);
  const store = new PublicationVocabularyStore(db);
  let control = await store.control(brandId);
  if (control?.state === 'committed') return shared();
  if (!isPublicationVocabularyAdministrationEnabled(sails.config.vocab?.publicationAdministrationEnabled) && !control)
    return action();
  await store.ensureIndexes();
  if (!control) {
    try {
      await store.controls.insertOne({ schemaVersion: 1, brandId, state: 'legacy', writers: [] });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    control = await store.control(brandId);
  }
  if (control?.state !== 'legacy')
    throw new PublicationVocabularyError('Vocabulary conversion is in progress; legacy writes are fenced', 409);
  const token = randomUUID();
  const admitted = await store.controls.updateOne(
    { brandId, state: 'legacy', $expr: { $lt: [{ $size: '$writers' }, 64] } },
    {
      $push: {
        writers: token,
        writerOwners: { id: token, host: hostname(), pid: process.pid, startedAt: new Date().toISOString() },
      },
    }
  );
  if (!admitted.matchedCount)
    throw new PublicationVocabularyError('Vocabulary conversion fenced this write; reload', 409);
  // Rejection may follow a submitted write whose acknowledgement was lost. Releasing
  // that admission would let conversion commit ahead of a late legacy write. Only
  // successful completion proves this action has no outstanding writes; failures
  // retain their owner/identity for the existing explicit operator settlement.
  const result = await legacyAdmission.run(brandId, action);
  await store.controls.updateOne({ brandId }, { $pull: { writers: token, writerOwners: { id: token } } });
  return result;
}
