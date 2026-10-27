import type { PersistenceOwner } from '../owner';
import { ObjectId } from 'mongodb';
import type { NamedQueryRequest, NamedQueryPage } from './NamedQueryExecution';
import { namedQueryCriteria, namedQueryScalar, namedQueryFieldType } from './NamedQueryExecution';
import { projectNamedQueryRecords } from './projection';
import type { Definition, DefinitionValues } from './ReferenceRepositories';
import type { DocumentCollection } from '../prisma/documents';
import type { LogicalDatastore } from '../types';
import { PersistenceError } from '../errors';
import {
  prismaDatabase,
  persistenceOperation,
  getReferenceRepositories,
  getConfigurationRepositories,
  getProgressRepositories,
  getVocabularyRepositories,
  getBrandingRepository,
} from '../runtime';
import { referenceFields, referenceId, decodeReference, referenceOperation } from './physical';
import {
  configurationFields,
  configurationId,
  decodeConfiguration,
  configurationOperation,
} from '../configuration/physical';
import { progressFields, progressId, decodeProgress, progressOperation } from '../progress/physical';
import { vocabularyFields } from '../vocabulary/fields';
import { vocabularyId, decodeVocabulary, vocabularyOperation } from '../vocabulary/physical';
import { brandingFields } from '../branding/fields';
import { decodeBranding } from '../branding/PrismaBrandingRepository';

interface Target {
  datastore: LogicalDatastore;
  fields: Record<string, { type: string }>;
  id(value: unknown): unknown;
  decode(row: DefinitionValues): DefinitionValues;
  ready(app: PersistenceOwner): object;
  operation<T>(run: () => Promise<T>): Promise<T>;
}
function targets<K extends string>(
  names: readonly K[],
  fields: Record<K, Target['fields']>,
  id: Target['id'],
  decode: (collection: K, row: DefinitionValues) => DefinitionValues | null,
  ready: Target['ready'],
  operation: Target['operation']
): Record<string, Target> {
  return Object.fromEntries(
    names.map(collection => [
      collection,
      {
        datastore: 'mongodb',
        fields: fields[collection],
        id,
        decode: row => decode(collection, row)!,
        ready,
        operation,
      } satisfies Target,
    ])
  );
}
// A closed catalogue: metadata never discovers new query targets or datastore mappings.
const catalogue: Readonly<Record<string, Target>> = {
  ...targets(
    ['form', 'recordtype', 'dashboardtype', 'report', 'namedquery', 'workspacetype'] as const,
    referenceFields,
    referenceId,
    (name, row) => decodeReference<Definition>(name, row),
    getReferenceRepositories,
    referenceOperation
  ),
  ...targets(
    ['appconfig', 'dashboardconfiguration', 'i18nbundle', 'i18ntranslation'] as const,
    configurationFields,
    configurationId,
    decodeConfiguration<DefinitionValues>,
    getConfigurationRepositories,
    configurationOperation
  ),
  ...targets(
    ['asynchprogress'] as const,
    progressFields,
    progressId,
    decodeProgress<DefinitionValues>,
    getProgressRepositories,
    progressOperation
  ),
  ...targets(
    ['vocabulary', 'figsharevocabularysource', 'figsharevocabularycrosswalk', 'figsharevocabularysyncrun'],
    vocabularyFields,
    vocabularyId,
    decodeVocabulary<DefinitionValues>,
    getVocabularyRepositories,
    vocabularyOperation
  ),
  brandingconfighistory: {
    datastore: 'redboxStorage',
    fields: brandingFields.brandingconfighistory,
    id: value => (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : value),
    decode: row => decodeBranding<DefinitionValues>(row, true, false)!,
    ready: getBrandingRepository,
    operation: run => run(),
  },
};
function translate(criteria: DefinitionValues, target: Target): DefinitionValues {
  return Object.fromEntries(
    Object.entries(criteria)
      .map(([field, original]) => {
        if (field === '$and' || field === '$or')
          return [field, (original as DefinitionValues[]).map(value => translate(value, target))];
        let value = original;
        if (field === 'id' || target.fields[field]?.type === 'id') {
          const convert = (item: unknown) => (item === null ? null : target.id(item));
          value =
            value && typeof value === 'object' && !Array.isArray(value)
              ? Object.fromEntries(
                  Object.entries(value).map(([operator, item]) => [
                    operator,
                    Array.isArray(item) ? item.map(convert) : convert(item),
                  ])
                )
              : convert(value);
        }
        value = namedQueryScalar(value, namedQueryFieldType(field, target.fields));
        // Text operators are case sensitive; callers cannot supply native regex/options.
        if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, '$regex'))
          value = Object.fromEntries(Object.entries(value).filter(([operator]) => operator !== '$options'));
        return [field === 'id' ? '_id' : field, value];
      })
      .filter(
        ([, value]) => !(value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length)
      )
  );
}

/** Raw Mongo translation is limited to validated stored expressions. Identity/records own their semantics. */
export async function executePrismaNamedQuery(
  app: PersistenceOwner,
  request: NamedQueryRequest,
  count: boolean
): Promise<NamedQueryPage> {
  const target = Object.hasOwn(catalogue, request.target) ? catalogue[request.target] : undefined;
  if (!target) throw new PersistenceError('named-query-compatibility', 'Unsupported repository named-query target.');
  if (request.target === 'brandingconfighistory') namedQueryCriteria(request.expression, false);
  for (const entry of request.sort ?? [])
    for (const field of Object.keys(entry)) namedQueryFieldType(field, target.fields);
  for (const field of request.select ?? []) namedQueryFieldType(field, target.fields);
  const active = target.ready(app);
  let query: (pipeline: DefinitionValues[]) => Promise<DefinitionValues[]>;
  if (target.datastore === 'redboxStorage') {
    const client = await prismaDatabase(app, 'redboxStorage');
    query = async pipeline =>
      (await client.runtime())
        .query(client.raw.collection('brandingconfighistory').aggregate(pipeline).build())
        .toArray();
  } else {
    const client = await prismaDatabase(app, 'mongodb');
    query = async pipeline =>
      (await client.runtime())
        .query(
          client.raw
            .collection(request.target as DocumentCollection)
            .aggregate(pipeline)
            .build()
        )
        .toArray();
  }
  if (target.ready(app) !== active)
    throw new PersistenceError('lifecycle', 'Resolve the active named-query repository after initialization.');
  return persistenceOperation(app, () =>
    target.operation(async () => {
      const where = translate(namedQueryCriteria(request.expression, true), target);
      const total = count ? Number((await query([{ $match: where }, { $count: 'total' }]))[0]?.total ?? 0) : 0;
      const pipeline: DefinitionValues[] = [{ $match: where }];
      const sort = Object.assign(
        {},
        ...(request.sort ?? []).map(entry =>
          Object.fromEntries(
            Object.entries(entry).map(([field, order]) => [field === 'id' ? '_id' : field, order === 'DESC' ? -1 : 1])
          )
        )
      );
      if (Object.keys(sort).length) pipeline.push({ $sort: sort });
      if (request.start) pipeline.push({ $skip: request.start });
      if (request.rows) pipeline.push({ $limit: request.rows });
      if (request.select)
        pipeline.push({
          $project: Object.fromEntries(
            [
              '_id',
              ...(target.datastore === 'redboxStorage' ? ['branding'] : []),
              ...request.select.map(field => (field === 'id' ? '_id' : field.split('.')[0])),
            ].map(field => [field, 1])
          ),
        });
      const records =
        request.rows === 0 || (count && !total) ? [] : (await query(pipeline)).map(row => target.decode(row));
      return { total, records: projectNamedQueryRecords(records, request.select) };
    })
  );
}
