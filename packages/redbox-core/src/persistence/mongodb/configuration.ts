import { createHash } from 'node:crypto';
import ConnectionString from 'mongodb-connection-string-url';
import { MongoClient } from 'mongodb';
import type { MongoClientOptions } from 'mongodb';
import { PersistenceError } from '../errors';

/** Private concrete adapter configuration. Never log this object or its URL/options. */
export interface ResolvedDatastore {
  url: string;
  options: MongoClientOptions;
  database: string;
  poolKey: string;
}

function stable(value: unknown, plainOnly = false): string {
  if (value === undefined) return 'undefined';
  if (Buffer.isBuffer(value)) return `buffer:${value.toString('base64')}`;
  if (Array.isArray(value)) return `[${value.map(item => stable(item, plainOnly)).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    if (plainOnly && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
      throw new PersistenceError('configuration', 'Connection policy must contain plain serializable MongoDB options.');
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stable(Reflect.get(value, key), plainOnly)}`)
      .join(',')}}`;
  }
  if (typeof value === 'function' || typeof value === 'symbol')
    throw new PersistenceError(
      'configuration',
      'Connection policy must contain explicit serializable MongoDB options.'
    );
  return JSON.stringify(value);
}

/** Resolve raw Sails config, without requiring ORM loading, normalization or a manager. */
export function resolveDatastore(config: Record<string, unknown>): ResolvedDatastore {
  if (
    ['adapter', 'identity', 'schema', 'forceLoadAdapter', 'migrate', 'dontUseObjectIds'].some(key =>
      Object.hasOwn(config, key)
    )
  )
    throw new PersistenceError(
      'configuration',
      'Remove retired ORM datastore adapter/schema/migrate/identity settings. Keep URL, split credentials/database and MongoDB driver options under datastores.mongodb/redboxStorage. See Persistence-Migration.md.'
    );
  try {
    const { url, user, password, host, port, database, ...options } = config;
    let resolvedUrl = url;
    if (url === undefined && host !== undefined && database !== undefined) resolvedUrl = 'mongodb://localhost/';
    if (typeof resolvedUrl !== 'string' || !resolvedUrl) throw new Error('url');
    if (resolvedUrl.startsWith('://')) resolvedUrl = `mongodb${resolvedUrl}`;
    else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(resolvedUrl)) resolvedUrl = `mongodb://${resolvedUrl}`;
    const connection = new ConnectionString(String(resolvedUrl));
    const complex = String(resolvedUrl).includes(',');
    // Legacy URL credentials pass through url.parse and the driver (two decodes).
    // Split credentials pass only through the driver (one decode). Complex URLs
    // bypass normalization and ignore all split settings, including DB/credentials.
    if (!complex) {
      const legacyAuth = `${decodeURIComponent(connection.username)}:${decodeURIComponent(connection.password)}`.split(
        ':'
      );
      const username = user === undefined ? decodeURIComponent(legacyAuth[0] ?? '') : decodeURIComponent(String(user));
      const effectivePassword =
        password === undefined ? decodeURIComponent(legacyAuth[1] ?? '') : decodeURIComponent(String(password));
      if (
        (user !== undefined && typeof user !== 'string' && typeof user !== 'number') ||
        (password !== undefined && typeof password !== 'string') ||
        (!username && effectivePassword)
      )
        throw new Error('credentials');
      if (username) {
        connection.username = encodeURIComponent(username);
        connection.password = encodeURIComponent(effectivePassword);
      }
      if (host !== undefined || port !== undefined) {
        const target = new URL(`mongodb://${connection.hosts[0]}`);
        if (host !== undefined) {
          if (typeof host !== 'string' && typeof host !== 'number') throw new Error('host');
          const override = new URL(`mongodb://${host}`);
          if (
            override.username ||
            override.password ||
            override.port ||
            override.search ||
            override.hash ||
            (override.pathname && override.pathname !== '/')
          )
            throw new Error('host');
          target.hostname = override.hostname;
        }
        if (port !== undefined) {
          const numericPort = Number(port);
          if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535 || connection.isSRV)
            throw new Error('port');
          target.port = String(numericPort);
        }
        connection.hosts = [target.host];
      }
      if (database !== undefined) {
        if (typeof database !== 'string' && typeof database !== 'number') throw new Error('database');
        // Split DB text is passed verbatim and decoded once by the driver.
        connection.pathname = `/${String(database)}`;
      }
    }
    if (!connection.pathname || connection.pathname === '/') throw new Error('database');
    for (const key of ['ignoreUndefined', 'serializeFunctions', 'raw', 'promoteBuffers']) {
      if (options[key] === true || connection.searchParams.get(key)?.toLowerCase() === 'true') throw new Error('json');
    }
    // Parse offline to validate URI/options and obtain effective driver policy.
    const candidate = new MongoClient(connection.toString(), options);
    const effective = candidate.options;
    const db = candidate.db().databaseName;
    // Compare normalized options, including effective authSource/TLS/pool/read/write
    // policy. Default authSource may depend on DB, so equal server text is insufficient.
    // These fields contain driver-generated functions/process metadata, not
    // connection policy. User-provided rich options are refused below instead
    // of accidentally pooling unequal callback/certificate policies.
    stable(options, true);
    const policy = Object.fromEntries(
      Object.entries(effective).filter(
        ([key]) => !['dbName', 'pkFactory', 'mongoLoggerOptions', 'metadata', 'runtime'].includes(key)
      )
    );
    const poolKey = createHash('sha256').update(stable(policy)).digest('hex');
    return { url: connection.toString(), options, database: db, poolKey };
  } catch {
    // Neither parse error messages nor causes are safe: they may contain secrets.
    throw new PersistenceError(
      'configuration',
      'Cannot resolve MongoDB datastore. Review URL/split settings, credentials, database, TLS/SRV and supported driver options. No loaded model or manager is required.'
    );
  }
}

export function resolveApplicationDatastore(app: Sails.Application, name: string): ResolvedDatastore {
  const config: unknown = app.config.datastores?.[name];
  if (typeof config !== 'object' || config === null)
    throw new PersistenceError(
      'configuration',
      `Configure the ${name} logical MongoDB datastore before using its repositories.`
    );
  return resolveDatastore(config as Record<string, unknown>);
}

/** Session URLs have always used the driver's URI rules, without split normalization. */
export function resolveSessionDatastore(config: Record<string, unknown>): ResolvedDatastore {
  try {
    if (typeof config.mongoUrl !== 'string' || config.client || config.clientPromise) throw new Error('settings');
    const url = config.mongoUrl;
    const options = (config.mongoOptions ?? {}) as MongoClientOptions;
    stable(options, true);
    const candidate = new MongoClient(url, options);
    const policy = Object.fromEntries(
      Object.entries(candidate.options).filter(
        ([key]) => !['dbName', 'pkFactory', 'mongoLoggerOptions', 'metadata', 'runtime'].includes(key)
      )
    );
    const database = typeof config.dbName === 'string' ? config.dbName : candidate.db().databaseName;
    return { url, options, database, poolKey: createHash('sha256').update(stable(policy)).digest('hex') };
  } catch {
    throw new PersistenceError(
      'configuration',
      'Configure redboxSession.mongoUrl/mongoOptions/dbName. Session client/clientPromise overrides are unsupported; the application runtime owns its pool.'
    );
  }
}
