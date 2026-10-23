import { prismaModelFilter } from '@researchdatabox/redbox-core';
import type { StoragePrismaClient } from '@researchdatabox/redbox-core';
import type { Document } from 'mongodb';
import type { SchemaDocumentRepository } from './StorageProtocol';

/** Private model IO for the unchanged immutable-artifact/reference protocol. */
export function prismaSchemaDocuments(
  client: StoragePrismaClient,
  name: 'recordschemaartifact' | 'recordschemareference'
): SchemaDocumentRepository {
  const model = client.orm[name];
  // Domain codecs accept absent optional values. Never feed these read results
  // into a write: explicit null is still preserved by supplied-field patches.
  const document = (row: Document): Document =>
    Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null));
  const list: SchemaDocumentRepository['list'] = async (criteria, options = {}) => {
    const { sort: order = {}, limit } = options;
    let query = model.where(prismaModelFilter(criteria));
    if (Object.keys(order).length) query = query.orderBy(order);
    if (limit !== undefined) query = query.limit(limit);
    // Projections avoid loading the schema body for bounded artifact pages.
    const fields = Object.entries(options?.projection ?? {})
      .filter(([, include]) => include === 1)
      .map(([field]) => field)
      .filter((field): field is '_id' | 'digest' | 'createdAt' => ['_id', 'digest', 'createdAt'].includes(field));
    const rows = fields.length
      ? await query
          .select(...fields)
          .all()
          .toArray()
      : await query.all().toArray();
    return rows.map(document);
  };
  return {
    list,
    async findOne(criteria, options) {
      return (await list(criteria, { ...options, limit: 1 }))[0] ?? null;
    },
    async insertOne(values) {
      return model.create(values);
    },
    async updateOne(criteria, update) {
      const row =
        name === 'recordschemaartifact'
          ? await client.orm.recordschemaartifact.where(prismaModelFilter(criteria)).update(update.$set)
          : await client.orm.recordschemareference.where(prismaModelFilter(criteria)).update(update.$set);
      return { matchedCount: row ? 1 : 0 };
    },
    async deleteOne(criteria) {
      return model.where(prismaModelFilter(criteria)).delete();
    },
  };
}
