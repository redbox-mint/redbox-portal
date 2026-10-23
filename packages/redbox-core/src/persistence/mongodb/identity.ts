import { ObjectId } from 'mongodb';
import { PersistenceError } from '../errors';

/** Private codec for explicitly qualified ObjectId mappings; native string IDs stay separate. */
export function persistenceObjectId(value: unknown, uppercase = false): ObjectId {
  if (typeof value !== 'string' || !(uppercase ? /^[a-fA-F0-9]{24}$/ : /^[a-f0-9]{24}$/).test(value))
    throw new PersistenceError('object-id-codec', 'Identity does not match the qualified ObjectId mapping.');
  return new ObjectId(value);
}

/** Preserve model primary-key validation on both create and patch writes. */
export function persistenceObjectIdField(values: Record<string, unknown>): { _id?: ObjectId } {
  return values.id === undefined ? {} : { _id: persistenceObjectId(values.id) };
}
