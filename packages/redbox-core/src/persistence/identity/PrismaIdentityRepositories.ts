import { MongoAndExpr, MongoOrExpr, MongoExistsExpr, MongoFieldFilter } from '@prisma/orm-mongo/query-ast';
import type { MongoFilterExpr } from '@prisma/orm-mongo/query-ast';
import { MongoParamRef } from '@prisma/orm-mongo/value';
import { MONGO_OBJECTID_CODEC_ID } from '@prisma/orm-mongo/target/codec-ids';
import { compare, genSalt, hash } from 'bcryptjs';
import type { CorePrismaClient } from '../prisma/client';
import { normalizePersistenceField, coercePersistenceQueryScalar } from '../scalars';
import { persistenceStringTimestamps } from '../timestamps';
import { PersistenceError } from '../errors';
import { identityFields } from './fields';
import { safeIdentityValue, safeIdentityRow, identityOperation } from './safety';
import type {
  IdentityCollection,
  IdentityRows,
  IdentityRead,
  IdentityRepositories,
  Values,
} from './IdentityRepositories';

type MongoValue = Parameters<typeof MongoFieldFilter.eq>[1];
const id = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))
    throw new PersistenceError('identity-value', 'Identity writes require a valid ObjectId.');
  return value.toLowerCase();
};
function filter(entity: IdentityCollection, input: Values, typed = false): MongoFilterExpr {
  const criteria = (input.where ?? input) as Values;
  const clauses = Object.entries(criteria)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]): MongoFilterExpr => {
      if (key === 'or' || key === 'and') {
        if (!Array.isArray(value)) throw new PersistenceError('identity-query', 'Invalid identity predicate.');
        return (key === 'or' ? MongoOrExpr : MongoAndExpr).of(value.map(branch => filter(entity, branch, typed)));
      }
      const field = key === 'id' ? '_id' : key;
      const spec =
        identityFields[entity][key.split('.')[0]] ??
        (['createdAt', 'updatedAt'].includes(key) ? { type: 'string' as const } : undefined);
      if (field !== '_id' && !spec) throw new PersistenceError('identity-query', 'Undeclared identity query field.');
      const scalar = (item: unknown): MongoValue => {
        if (field === '_id' || spec?.type === 'id') {
          const value = item === null || item === '' ? null : typeof item === 'string' ? item.toLowerCase() : item;
          // Unlike model where(), the typed builder needs explicit parameter codecs.
          return typed ? new MongoParamRef(value, { codecId: MONGO_OBJECTID_CODEC_ID }) : (value as MongoValue);
        }
        if (key.includes('.') || spec.type === 'json') return item as MongoValue;
        return coercePersistenceQueryScalar(item, spec.type) as MongoValue;
      };
      if (Array.isArray(value)) return MongoFieldFilter.in(field, value.map(scalar));
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        return MongoAndExpr.of(
          Object.entries(value).map(([op, item]) => {
            if (['contains', 'startsWith', 'endsWith'].includes(op)) {
              const escaped = String(item).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              return MongoFieldFilter.of(
                field,
                '$regex',
                `${op === 'startsWith' ? '^' : ''}${escaped}${op === 'endsWith' ? '$' : ''}`
              );
            }
            const operators: Record<string, string> = {
              '!=': '$ne',
              in: '$in',
              nin: '$nin',
              '>': '$gt',
              '>=': '$gte',
              '<': '$lt',
              '<=': '$lte',
            };
            if (!operators[op]) throw new PersistenceError('identity-query', 'Unsupported identity predicate.');
            return MongoFieldFilter.of(field, operators[op], Array.isArray(item) ? item.map(scalar) : scalar(item));
          })
        );
      }
      return MongoFieldFilter.eq(field, scalar(value));
    });
  return clauses.length ? MongoAndExpr.of(clauses) : MongoExistsExpr.exists('_id');
}
function prepare(entity: IdentityCollection, values: Values, patch = false): Values {
  for (const key of Object.keys(values)) {
    if (
      !Object.hasOwn(identityFields[entity], key) &&
      !['id', 'createdAt', 'updatedAt', 'roles', 'users', 'workspaceApps', 'toJSON'].includes(key)
    )
      throw new PersistenceError(
        'identity-field',
        'Declare institution identity fields in the Prisma contract before writing them. Review the stored data and migrate institution extensions before startup;.'
      );
  }
  const result: Values = {};
  for (const [key, spec] of Object.entries(identityFields[entity])) {
    if (spec.extension && values[key] === undefined) continue;
    const value = normalizePersistenceField(values[key], spec, patch);
    if (value !== undefined) result[key] = spec.type === 'id' && value !== null ? id(value) : value;
  }
  if (
    entity === 'user' &&
    result.accountLinkState !== undefined &&
    !['active', 'linked-alias'].includes(String(result.accountLinkState))
  )
    throw new PersistenceError('identity-value', 'Invalid account link state.');
  if (entity === 'userlink' && result.status !== undefined && result.status !== 'active')
    throw new PersistenceError('identity-value', 'Invalid account link status.');
  if (!patch && values.id !== undefined) result._id = id(values.id);
  Object.assign(result, persistenceStringTimestamps(values, patch));
  return result;
}
function decode<K extends IdentityCollection>(row: Values, entity: K): IdentityRows[K] {
  const { _id, ...rest } = row;
  return safeIdentityRow({ id: String(_id), ...rest }, entity) as IdentityRows[K];
}

export function prismaIdentityRepositories(
  client: CorePrismaClient,
  pendingAccess: (user: Values) => Promise<unknown>,
  branding: (identity: string) => Promise<unknown>
): IdentityRepositories {
  const list = async <K extends IdentityCollection>(
    entity: K,
    criteria: Values = {},
    options: IdentityRead = {}
  ): Promise<IdentityRows[K][]> => {
    const sort: Record<string, 1 | -1> = {};
    for (const order of options.sort ?? [])
      for (const [field, direction] of Object.entries(order)) {
        const parts = field.split('.');
        const root = parts[0];
        if (
          !parts.every(
            part => /^[A-Za-z0-9_-]+$/.test(part) && !['__proto__', 'prototype', 'constructor'].includes(part)
          ) ||
          (!Object.hasOwn(identityFields[entity], root) && !['id', 'createdAt', 'updatedAt'].includes(root)) ||
          (parts.length > 1 && identityFields[entity][root]?.type !== 'json')
        )
          throw new PersistenceError('identity-query', 'Undeclared identity sort field.');
        sort[field === 'id' ? '_id' : field] = direction.toLowerCase() === 'desc' ? -1 : 1;
      }
    let documents: Values[];
    if (Object.keys(sort).some(field => field.includes('.'))) {
      // RC19 model orderBy is root-only. Typed sorting keeps Mongo's deep-path,
      // missing/null and array ordering before paging, without raw access.
      const sorted = client.query
        .from(entity as IdentityCollection)
        .match(filter(entity, criteria, true))
        .sort(sort);
      const skipped = options.skip ? sorted.skip(options.skip) : sorted;
      const bounded = options.limit ? skipped.limit(options.limit) : skipped;
      documents = await (await client.runtime()).query(bounded.build()).toArray();
    } else {
      let query = client.orm[entity as IdentityCollection].where(filter(entity, criteria));
      if (Object.keys(sort).length) query = query.orderBy(sort);
      if (options.skip) query = query.offset(options.skip);
      if (options.limit) query = query.limit(options.limit);
      documents = await query.all().toArray();
    }
    const rows = documents.map(row => decode(row, entity));
    for (const row of rows) {
      for (const relation of options.populate ?? []) {
        if ((entity === 'user' && relation === 'roles') || (entity === 'role' && relation === 'users')) {
          const from = entity === 'user' ? 'user_roles' : 'role_users';
          const to = entity === 'user' ? 'role_users' : 'user_roles';
          const edges = await client.orm.role_users__user_roles
            .where(MongoFieldFilter.eq(from, String(row.id)))
            .all()
            .toArray();
          // Waterline population returns the target set, even when physical edges repeat.
          row[relation] = edges.length
            ? await list(entity === 'user' ? 'role' : 'user', { id: edges.map(edge => edge[to]) })
            : [];
        } else if (entity === 'user' && relation === 'workspaceApps') {
          row['workspaceApps'] = await list('workspaceapp', { user: row.id });
        } else if ((entity === 'role' || entity === 'pathrule') && relation === 'branding') {
          row['branding'] = row['branding'] ? await branding(String(row['branding'])) : null;
        } else if (entity === 'pathrule' && relation === 'role') {
          row['role'] = row['role'] ? await one('role', { id: row['role'] }) : null;
        } else throw new PersistenceError('identity-relation', 'Unsupported identity population.');
      }
    }
    return rows;
  };
  const one = async <K extends IdentityCollection>(
    entity: K,
    criteria: Values,
    options: IdentityRead = {}
  ): Promise<IdentityRows[K] | null> => {
    return (await list(entity, criteria, { ...options, limit: 1 }))[0] ?? null;
  };
  const callback = async (entity: IdentityCollection, row: Values) => {
    if (entity === 'user' && row.email != null && row.name !== 'Local Admin') await pendingAccess(row);
  };
  const add = async (side: 'user' | 'role', identity: string | number, members: readonly (string | number)[]) => {
    const from = side === 'user' ? 'user_roles' : 'role_users';
    const to = side === 'user' ? 'role_users' : 'user_roles';
    const source = id(String(identity));
    const targets = [...new Set(members)].map(member => id(String(member)));
    for (const member of targets) await client.orm.role_users__user_roles.create({ [from]: source, [to]: member });
  };
  const remove = async (side: 'user' | 'role', identity: string | number, members?: readonly (string | number)[]) => {
    const from = side === 'user' ? 'user_roles' : 'role_users';
    const to = side === 'user' ? 'role_users' : 'user_roles';
    const where = MongoAndExpr.of([
      MongoFieldFilter.eq(from, id(String(identity))),
      ...(members
        ? [
            MongoFieldFilter.in(
              to,
              members.map(member => id(String(member)))
            ),
          ]
        : []),
    ]);
    await client.orm.role_users__user_roles.where(where).deleteAndCount();
  };
  const replace = async (side: 'user' | 'role', identity: string | number, members: readonly (string | number)[]) => {
    // Validate before delete, then keep Waterline's delete-before-insert partial failure.
    members.forEach(member => id(String(member)));
    await remove(side, identity);
    await add(side, identity, members);
  };
  const creates = {
    user: (values: Values) => client.orm.user.create(values),
    role: (values: Values) => client.orm.role.create(values),
    userlink: (values: Values) => client.orm.userlink.create(values),
    useraudit: (values: Values) => client.orm.useraudit.create(values),
    pathrule: (values: Values) => client.orm.pathrule.create(values),
    workspaceapp: (values: Values) => client.orm.workspaceapp.create(values),
  };
  const updates = {
    user: (where: MongoFilterExpr, values: Values) => client.orm.user.where(where).update(values),
    role: (where: MongoFilterExpr, values: Values) => client.orm.role.where(where).update(values),
    userlink: (where: MongoFilterExpr, values: Values) => client.orm.userlink.where(where).update(values),
    useraudit: (where: MongoFilterExpr, values: Values) => client.orm.useraudit.where(where).update(values),
    pathrule: (where: MongoFilterExpr, values: Values) => client.orm.pathrule.where(where).update(values),
    workspaceapp: (where: MongoFilterExpr, values: Values) => client.orm.workspaceapp.where(where).update(values),
  };
  const repository: IdentityRepositories = {
    list: (entity, criteria, options) => identityOperation(() => list(entity, criteria, options)),
    one: (entity, criteria, options) => identityOperation(() => one(entity, criteria, options)),
    create: (entity, values) =>
      identityOperation(async () => {
        const data = prepare(entity, entity === 'useraudit' ? (safeIdentityValue(values) as Values) : values);
        if (entity === 'user' && data.password) data.password = await hash(String(data.password), await genSalt(10));
        const row = decode(await creates[entity](data), entity);
        if (entity === 'user' && Array.isArray(values.roles)) await replace('user', String(row.id), values.roles);
        if (entity === 'role' && Array.isArray(values.users)) await replace('role', String(row.id), values.users);
        await callback(entity, row);
        return row;
      }),
    update: (entity, criteria, values) =>
      identityOperation(async () => {
        const patch = prepare(entity, entity === 'useraudit' ? (safeIdentityValue(values) as Values) : values, true);
        const selected = await list(entity, criteria);
        const result: IdentityRows[typeof entity][] = [];
        for (const row of selected) {
          const updated = await updates[entity](
            MongoAndExpr.of([filter(entity, criteria), MongoFieldFilter.eq('_id', String(row.id))]),
            patch
          );
          if (!updated) continue;
          const after = decode(updated, entity);
          if (entity === 'user' && Array.isArray(values.roles)) await replace('user', String(row.id), values.roles);
          await callback(entity, after);
          result.push(after);
        }
        return result;
      }),
    remove: (entity, criteria) =>
      identityOperation(async () => {
        await client.orm[entity as IdentityCollection].where(filter(entity, criteria)).deleteAndCount();
      }),
    findOrCreateWorkspace: (criteria, values) =>
      identityOperation(async () => {
        const found = await one('workspaceapp', criteria);
        return found ?? repository.create('workspaceapp', values);
      }),
    addMemberships: (side, identity, members) => identityOperation(() => add(side, identity, members)),
    removeMemberships: (side, identity, members) => identityOperation(() => remove(side, identity, members)),
    replaceMemberships: (side, identity, members) => identityOperation(() => replace(side, identity, members)),
    assignBrandRoles: (brand, roles) =>
      identityOperation(async () => {
        for (const role of roles)
          await client.orm.role
            .where(MongoFieldFilter.eq('_id', id(String(role))))
            .update({ branding: id(brand), updatedAt: new Date().toISOString() });
      }),
    verifyPassword: (userId, password) =>
      identityOperation(async () => {
        const rows = await client.orm.user
          .where(MongoFieldFilter.eq('_id', id(userId)))
          .select('password')
          .limit(1)
          .all()
          .toArray();
        return typeof rows[0]?.password === 'string' && compare(password, rows[0].password);
      }),
    findByApiTokenHash: (token, options) => identityOperation(() => one('user', { token }, options)),
  };
  return repository;
}
