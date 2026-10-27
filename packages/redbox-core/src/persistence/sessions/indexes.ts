import type { PersistenceOwner } from '../owner';
import { mongoSessionDatabase } from '../runtime';
import type { PersistenceIndexInspection } from '../indexes';

/** The connect-mongo TTL index is prepared explicitly, never by HTTP startup. */
export async function prepareSessionIndexes(
  owner: PersistenceOwner,
  configuration: Record<string, unknown>,
  mode: 'inspect' | 'ensure'
): Promise<Omit<PersistenceIndexInspection, 'datastore'>[]> {
  const database = await mongoSessionDatabase(owner, configuration);
  const collection = typeof configuration.collection === 'string' ? configuration.collection : 'sessions';
  const info = await database.listCollections({ name: collection }).next();
  if (info && 'options' in info && info.options?.collation && info.options.collation.locale !== 'simple')
    throw new Error('Session collections require simple collation.');
  const indexes = info ? await database.collection(collection).listIndexes().toArray() : [];
  const relevant = indexes.filter(index => index.name === 'expires_1' || JSON.stringify(index.key) === '{"expires":1}');
  const compatible = (index: (typeof indexes)[number]) =>
    JSON.stringify(index.key) === '{"expires":1}' &&
    index.expireAfterSeconds === 0 &&
    !index.unique &&
    !index.sparse &&
    !index.hidden &&
    !index.partialFilterExpression &&
    (!index.collation || index.collation.locale === 'simple');
  const state = relevant.some(index => !compatible(index)) ? 'conflicting' : relevant.length ? 'ready' : 'missing';
  if (mode === 'ensure' && state === 'missing') {
    await database.collection(collection).createIndex({ expires: 1 }, { name: 'expires_1', expireAfterSeconds: 0 });
    return prepareSessionIndexes(owner, configuration, 'inspect');
  }
  return [{ collection, name: 'expires_1', index: state }];
}
