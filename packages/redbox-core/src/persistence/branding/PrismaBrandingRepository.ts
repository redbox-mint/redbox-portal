import { brandingThemeAllowedVariableNames } from '../../services/BrandingThemeTokens';
import { ObjectId } from 'mongodb';
import type { CorePrismaClient, StoragePrismaClient } from '../prisma/client';
import { prismaModelValues } from '../prisma/modelValues';
import { prismaModelFilter } from '../prisma/modelFilter';
import { MongoExistsExpr, MongoFieldFilter } from '@prisma/orm-mongo/query-ast';
import { migrateBrandingSidebar } from './sidebarMigration';
import type { BrandingRepository, BrandRow, BrandingHistoryRow, BrandingValues } from './BrandingRepository';
import { normalizeBrandingFields } from './validation';
import { normalizeBrandingVariables } from './normalization';
import { persistenceStringTimestamps } from '../timestamps';
import { assertJsonValue } from '../cache/validation';
import { PersistenceError } from '../errors';
import type { RoleModel } from '../../model/storage/RoleModel';

function id(value: unknown): ObjectId | unknown {
  return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value) ? new ObjectId(value) : value;
}
export function decodeBranding<T>(row: BrandingValues | null, history: boolean, model = true): T | null {
  if (!row) return null;
  if (
    (model ? typeof row._id !== 'string' : !(row._id instanceof ObjectId)) ||
    (history && (model ? typeof row.branding !== 'string' : !(row.branding instanceof ObjectId)))
  )
    throw new PersistenceError(
      'model-mapping',
      'Unsupported branding identity/relationship. Review the stored data and migrate institution extensions before startup; inventory stored data.'
    );
  const result: BrandingValues = { id: row._id instanceof ObjectId ? row._id.toHexString() : row._id };
  for (const [field, value] of Object.entries(row)) {
    if (field === '_id') continue;
    if (['__proto__', 'constructor', 'prototype'].includes(field))
      throw new PersistenceError('model-mapping', 'Unsupported branding stored field.');
    result[field] = history && field === 'branding' && value instanceof ObjectId ? value.toHexString() : value;
  }
  try {
    assertJsonValue(result);
  } catch {
    throw new PersistenceError('model-mapping', 'Branding requires plain JSON; reads never rewrite unsupported BSON.');
  }
  return result as T;
}
function criteria(lookup: object): BrandingValues {
  return Object.fromEntries(
    Object.entries(lookup)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k === 'id' ? '_id' : k, k === 'id' || k === 'branding' ? id(v) : v])
  );
}
function modelCriteria(lookup: object) {
  return prismaModelFilter(criteria(lookup));
}
async function operation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error && typeof error === 'object' && Reflect.get(error, 'code') === 11000)
      throw Object.assign(
        new Error('Would violate uniqueness constraint-- a record already exists with conflicting value(s).'),
        { code: 'E_UNIQUE', name: 'AdapterError' }
      );
    if (error instanceof Error && !error.name.startsWith('Mongo')) throw error;
    // Unknown transport/write outcomes MUST NOT become a certified-not-applied code.
    throw new PersistenceError(
      'branding-operation',
      'Branding persistence failed. Retain history and inspect the active snapshot before retrying.'
    );
  }
}
/** Concrete adapter over the two existing datastore owners; no sessions, retries or transactions. */
export function prismaBrandingRepository(
  application: CorePrismaClient,
  storage: StoragePrismaClient,
  app: Sails.Application
): BrandingRepository {
  const collection = (history: boolean) =>
    history ? storage.orm.brandingconfighistory : application.orm.brandingconfig;
  const prepare = (values: BrandingValues, patch: boolean, history: boolean): BrandingValues => {
    const result = normalizeBrandingFields(history ? 'brandingconfighistory' : 'brandingconfig', values, patch);
    Object.assign(result, persistenceStringTimestamps(values, patch));
    if (history) {
      if (!patch) result.dateCreated = values.dateCreated === undefined ? new Date().toISOString() : values.dateCreated;
      if (result.branding !== undefined) {
        const brandId = id(result.branding);
        if (!(brandId instanceof ObjectId))
          throw Object.assign(new Error('Invalid branding identity'), {
            code: patch ? 'E_INVALID_VALUES_TO_SET' : 'E_INVALID_NEW_RECORD',
          });
        result.branding = brandId;
      }
    } else {
      const variables = result.variables;
      const allowed = app.config.branding?.variableAllowList ?? brandingThemeAllowedVariableNames;
      if (
        variables != null &&
        (typeof variables !== 'object' ||
          Array.isArray(variables) ||
          !Object.keys(variables).every(k => allowed.includes(k.startsWith('$') ? k.slice(1) : k)))
      ) {
        throw Object.assign(new Error('Invalid variable key supplied (not in allowlist)'), {
          code: patch ? 'E_INVALID_VALUES_TO_SET' : 'E_INVALID_NEW_RECORD',
        });
      }
      normalizeBrandingVariables(result, allowed);
    }
    if (values.id !== undefined) {
      const value = id(values.id);
      if (!(value instanceof ObjectId))
        throw Object.assign(new Error('Invalid branding identity'), {
          code: patch ? 'E_INVALID_VALUES_TO_SET' : 'E_INVALID_NEW_RECORD',
        });
      result._id = value;
    }
    return prismaModelValues(result);
  };
  const get = async <T>(lookup: object, history: boolean): Promise<T | null> => {
    return decodeBranding<T>(await collection(history).where(modelCriteria(lookup)).first(), history);
  };
  const create = async <T>(values: BrandingValues, history: boolean): Promise<T> => {
    const doc = prepare(values, false, history);
    const result = history
      ? await storage.orm.brandingconfighistory.create(doc)
      : await application.orm.brandingconfig.create(doc);
    return decodeBranding<T>(result, history)!;
  };
  const revise = async <T>(lookup: object, values: BrandingValues, history = false): Promise<T | null> => {
    // Every caller selects a unique ID. TX-PARITY-01a permits the natural atomic
    // conditional write instead of reproducing Waterline's select-then-write race.
    const patch = prepare(values, true, history);
    return decodeBranding<T>(
      history
        ? await storage.orm.brandingconfighistory.where(modelCriteria(lookup)).update(patch)
        : await application.orm.brandingconfig.where(modelCriteria(lookup)).update(patch),
      history
    );
  };
  // Explicit U-owned projection through the identity repository.
  const withRoles = async (brand: BrandRow | null): Promise<BrandRow | null> => {
    if (!brand) return null;
    brand.roles = (await (require('../runtime') as typeof import('../runtime'))
      .getIdentityRepositories(app)
      .list('role', { branding: brand.id })) as RoleModel[];
    return brand;
  };
  return {
    migrateAdminSidebarTextColor: () => operation(() => migrateBrandingSidebar(application, storage)),
    getBrand: (lookup, roles) =>
      operation(async () => {
        const row = await get<BrandRow>(lookup, false);
        return roles ? withRoles(row) : row;
      }),
    listBrands: roles =>
      operation(async () => {
        const rows = (await application.orm.brandingconfig.all().toArray()).map(
          row => decodeBranding<BrandRow>(row, false)!
        );
        return roles ? Promise.all(rows.map(async row => (await withRoles(row))!)) : rows;
      }),
    createBrand: values => operation(() => create<BrandRow>(values, false)),
    setBrandAssets: (id, values) =>
      operation(async () => {
        await application.orm.brandingconfig.where(modelCriteria({ id })).update(prepare(values, true, false));
      }),
    reviseBrand: (id, values) => operation(() => revise<BrandRow>({ id }, values)),
    reviseDraft: (id, draftRevision, values) => operation(() => revise<BrandRow>({ id, draftRevision }, values)),
    publishBrand: (id, version, draftRevision, values) =>
      operation(() => revise<BrandRow>({ id, version, draftRevision }, values)),
    getHistory: lookup => operation(() => get<BrandingHistoryRow>(lookup, true)),
    listHistories: (branding, order) =>
      operation(async () => {
        let cursor = storage.orm.brandingconfighistory.where(modelCriteria(branding === undefined ? {} : { branding }));
        if (order) cursor = cursor.orderBy({ version: order === 'DESC' ? -1 : 1 });
        return (await cursor.all().toArray()).map(row => decodeBranding<BrandingHistoryRow>(row, true)!);
      }),
    insertHistory: values => operation(() => create<BrandingHistoryRow>(values, true)),
    removeHistory: id =>
      operation(async () => {
        await storage.orm.brandingconfighistory.where(modelCriteria({ id })).deleteAndCount();
      }),
    backfillBrandTypeface: id =>
      operation(async () => {
        const brand = application.orm.brandingconfig.where(modelCriteria({ id }));
        const values: BrandingValues = {};
        // Normal model reads collapse missing and explicit null. Inspect physical
        // presence via model predicates so this frozen backfill remains idempotent.
        for (const field of ['typeface', 'draftTypeface'])
          if ((await brand.where(MongoExistsExpr.notExists(field)).select('_id').limit(1).all().toArray()).length)
            values[field] = null;
        if (
          (await brand.where(MongoFieldFilter.eq('draftRevision', null)).select('_id').limit(1).all().toArray()).length
        )
          values.draftRevision = 0;
        if (Object.keys(values).length) await revise({ id }, values);
      }),
    backfillHistoryTypeface: id =>
      operation(async () => {
        await storage.orm.brandingconfighistory
          .where(modelCriteria({ id }))
          .where(MongoExistsExpr.notExists('typeface'))
          .update(prepare({ typeface: null }, true, true));
      }),
  };
}
