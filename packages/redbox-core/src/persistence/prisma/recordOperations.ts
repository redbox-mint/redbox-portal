import type { FieldOperation } from '@prisma/orm-mongo/orm';
import { MongoParamRef } from '@prisma/orm-mongo/value';
import { PersistenceError } from '../errors';
import type { StoragePrismaClient } from './client';
import { prismaModelFilter } from './modelFilter';
/** Public model field-operation callback values. Scalar/Json codecs run in the model API. */
export function prismaRecordFieldOperations(
  update: Record<string, unknown> | Record<string, unknown>[]
): FieldOperation[] {
  if (Array.isArray(update))
    throw new PersistenceError(
      'storage-contract',
      'Use conditional intent transformations instead of native pipelines.'
    );
  return Object.entries(update).flatMap(([operator, fields]) => {
    if (operator !== '$set' && operator !== '$inc' && operator !== '$unset')
      throw new PersistenceError('storage-contract', 'Unsupported record field operation.');
    if (!fields || typeof fields !== 'object')
      throw new PersistenceError('storage-contract', 'Record field operations require a field map.');
    return Object.entries(fields).map(([field, value]) => ({
      operator,
      field,
      value: new MongoParamRef(prismaRecordValues({ value }).value),
    }));
  });
}

/** Native record writes used BSON's default undefined-as-null serialization.
 * Keep that behavior for supplied fields only; never round-trip a model read.
 */
export function prismaRecordValues(values: Record<string, unknown>): Record<string, unknown> {
  const normalize = (value: unknown): unknown => {
    if (value === undefined) return null;
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
    return value;
  };
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, normalize(value)]));
}

/** Lifecycle snapshots and notification initialization must distinguish absence
 * from explicit null. RC19's model decoder coalesces both. Public typed plan
 * result shapes can retain undefined for absent leaves while still running each
 * declared field codec. Strip only those undefined keys before a caller can
 * persist a snapshot. S-PG-07; no raw command or untyped BSON result.
 */
export async function prismaRecordSnapshot(
  client: StoragePrismaClient,
  where: Record<string, unknown>,
  remove = false
): Promise<Record<string, unknown> | null> {
  const query = client.query.from('record').match(prismaModelFilter(where, ['_id']));
  const read = query.limit(1).build();
  const plan = remove ? query.findOneAndDelete() : read;
  // The typed delete terminal defaults to an unknown result shape. Reuse the
  // same model's read shape so the atomic before-image runs all field codecs.
  const shape = read.resultShape;
  if (shape?.kind !== 'document')
    throw new PersistenceError('storage-codec', 'Record snapshot requires a declared result shape.');
  const fields = Object.fromEntries(
    Object.entries(shape.fields).map(([key, field]) => [
      key,
      field.kind === 'leaf' ? { ...field, nullable: false } : field,
    ])
  );
  const rows = await (
    await client.runtime()
  )
    .query({
      ...plan,
      resultShape: { kind: 'document', fields },
    })
    .toArray();
  const row = rows[0];
  return row ? Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)) : null;
}
