import { escapeRegExp } from 'lodash';
import {
  prismaDatabase,
  getIdentityRepositories,
  getVocabularyRepositories,
  getBrandingRepository,
  getConfigurationRepositories,
} from '@researchdatabox/redbox-core';
import { prismaModelFilter } from '../../packages/redbox-core/src/persistence/prisma/modelFilter';

// Test setup/inspection uses the application's Prisma model API. Service assertions
// still exercise the public services; these helpers never register model globals.
const aliases: Record<string, string> = { RBReport: 'report' };
const collection = (name: string) => aliases[name] ?? name.toLowerCase();
async function model(name: string): Promise<any> {
  return (
    await prismaDatabase(
      sails,
      [
        'IntegrationAudit',
        'BrandingConfigHistory',
        'RecordAudit',
        'Record',
        'DeletedRecord',
        'RecordSchemaArtifact',
        'RecordSchemaReference',
      ].includes(name)
        ? 'redboxStorage'
        : 'mongodb'
    )
  ).orm[collection(name)];
}
function predicate(input: any = {}): any {
  if (typeof input === 'string') return { _id: input };
  return Object.fromEntries(
    Object.entries(input.where ?? input).map(([key, value]: [string, any]) => {
      if (['or', 'and'].includes(key)) return ['$' + key, value.map(predicate)];
      if (Array.isArray(value)) value = { $in: value };
      else if (value && typeof value === 'object' && typeof value.contains === 'string')
        value = { $regex: escapeRegExp(value.contains) };
      else if (value && typeof value === 'object' && !(value instanceof Date))
        value = Object.fromEntries(
          Object.entries(value).map(([op, v]) => [
            { in: '$in', nin: '$nin', '!=': '$ne', '>': '$gt', '>=': '$gte', '<': '$lt', '<=': '$lte' }[op] ?? op,
            v,
          ])
        );
      return [key === 'id' ? '_id' : key, value];
    })
  );
}
function snapshot(row: any): any {
  if (!row) return null;
  const { _id, ...values } = row;
  return { ...values, id: _id };
}
function order(value: any): any {
  if (!value) return undefined;
  const parts =
    typeof value === 'string'
      ? value.split(',').map((v: string) => {
          const [field, direction = 'ASC'] = v.trim().split(/\s+/);
          return { [field]: direction };
        })
      : Array.isArray(value)
        ? value
        : [value];
  return Object.assign(
    {},
    ...parts.map((part: any) =>
      Object.fromEntries(
        Object.entries(part).map(([k, v]) => [k === 'id' ? '_id' : k, v === 'DESC' || v === -1 ? -1 : 1])
      )
    )
  );
}
export async function fixtureRows(name: string, where: any = {}, options: any = {}): Promise<any[]> {
  if (options.populate && ['User', 'Role'].includes(name))
    return getIdentityRepositories().list(collection(name) as any, where, { populate: [options.populate] });
  let query = (await model(name)).where(prismaModelFilter(predicate(where)));
  if (options.sort ?? where.sort) query = query.orderBy(order(options.sort ?? where.sort));
  if (options.skip) query = query.offset(options.skip);
  if (options.limit) query = query.limit(options.limit);
  return (await query.all().toArray()).map(snapshot);
}
export async function fixtureRow(name: string, where: any, options: any = {}): Promise<any> {
  return (await fixtureRows(name, where, options))[0] ?? null;
}
export async function fixtureCount(name: string, where: any = {}): Promise<number> {
  return (await fixtureRows(name, where)).length;
}
export async function fixtureCreate(name: string, values: any): Promise<any> {
  if (name === 'User') return getIdentityRepositories().create('user', values);
  if (name === 'BrandingConfig') return getBrandingRepository().createBrand(values);
  if (name === 'BrandingConfigHistory') return getBrandingRepository().insertHistory(values);
  if (name === 'Vocabulary') return getVocabularyRepositories().createVocabulary(values);
  if (name === 'VocabularyEntry') return getVocabularyRepositories().createEntry(values);
  if (name === 'I18nTranslation') return getConfigurationRepositories().translations.createEntry(values);
  const { id, ...data } = values;
  return snapshot(
    await (
      await model(name)
    ).create({
      ...data,
      ...(id ? { _id: id } : {}),
      createdAt: data.createdAt ?? new Date().toISOString(),
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    })
  );
}
export async function fixturePatch(name: string, where: any, values: any): Promise<any[]> {
  const rows = await fixtureRows(name, where);
  if (name === 'BrandingConfig')
    return Promise.all(rows.map(row => getBrandingRepository().reviseBrand(row.id, values)));
  const entity = await model(name),
    result = [];
  for (const row of rows) result.push(snapshot(await entity.where(prismaModelFilter({ _id: row.id })).update(values)));
  return result;
}
export async function fixturePatchOne(name: string, where: any, values: any): Promise<any> {
  return (await fixturePatch(name, where, values))[0] ?? null;
}
export async function fixtureRemove(name: string, where: any): Promise<any[]> {
  const rows = await fixtureRows(name, where),
    entity = await model(name);
  for (const row of rows) await entity.where(prismaModelFilter({ _id: row.id })).delete();
  return rows;
}
export async function fixtureRemoveOne(name: string, where: any): Promise<any> {
  return (await fixtureRemove(name, where))[0] ?? null;
}
