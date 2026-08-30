import { isUnsupportedTransactionAdapterError } from './TransactionUtils';

export const AUTHORIZATION_TRANSACTION_UNAVAILABLE = 'authorization.transaction-unavailable' as const;

export class AuthorizationTransactionUnavailableError extends Error {
  readonly code = AUTHORIZATION_TRANSACTION_UNAVAILABLE;

  constructor(message = 'Authorization persistence requires datastore transaction support.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'AuthorizationTransactionUnavailableError';
  }
}

interface NativeMongoSession {
  abortTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  endSession(): Promise<void> | void;
  startTransaction(): void;
}

interface NativeMongoClient {
  startSession(): NativeMongoSession;
}

interface NativeMongoManager {
  readonly client?: NativeMongoClient;
  collection(name: string, options?: unknown): unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNativeMongoSession(value: unknown): value is NativeMongoSession {
  return (
    isRecord(value) &&
    typeof value.abortTransaction === 'function' &&
    typeof value.commitTransaction === 'function' &&
    typeof value.endSession === 'function' &&
    typeof value.startTransaction === 'function'
  );
}

const MONGO_COLLECTION_SESSION_OPTION_INDEX = Object.freeze<Record<string, number>>({
  aggregate: 1,
  bulkWrite: 1,
  countDocuments: 1,
  deleteMany: 1,
  deleteOne: 1,
  distinct: 2,
  estimatedDocumentCount: 0,
  find: 1,
  findOne: 1,
  findOneAndDelete: 1,
  findOneAndReplace: 2,
  findOneAndUpdate: 2,
  insertMany: 1,
  insertOne: 1,
  replaceOne: 2,
  updateMany: 2,
  updateOne: 2,
});

function sessionArguments(args: readonly unknown[], optionsIndex: number, session: NativeMongoSession): unknown[] {
  const result = [...args];
  while (result.length <= optionsIndex) {
    result.push(undefined);
  }
  const existingOptions = result[optionsIndex];
  result[optionsIndex] =
    typeof existingOptions === 'object' && existingOptions !== null && !Array.isArray(existingOptions)
      ? { ...existingOptions, session }
      : { session };
  return result;
}

function sessionBoundCollection(collection: object, session: NativeMongoSession): object {
  return new Proxy(collection, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      const optionsIndex = typeof property === 'string' ? MONGO_COLLECTION_SESSION_OPTION_INDEX[property] : undefined;
      if (optionsIndex === undefined) {
        return value.bind(target);
      }
      return (...args: unknown[]) => Reflect.apply(value, target, sessionArguments(args, optionsIndex, session));
    },
  });
}

function sessionBoundConnection(manager: NativeMongoManager, session: NativeMongoSession): Sails.Connection {
  return new Proxy(manager, {
    get(target, property, receiver) {
      if (property === 'collection') {
        return (name: string, options?: unknown) => {
          const collection = target.collection(name, options);
          if (typeof collection !== 'object' || collection === null) {
            throw new Error(`Mongo collection '${name}' is unavailable.`);
          }
          return sessionBoundCollection(collection, session);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function nativeMongoManager(datastore: Sails.Datastore | null | undefined): NativeMongoManager | undefined {
  const manager: unknown = datastore?.manager;
  if (!isRecord(manager)) {
    return undefined;
  }
  const collection = manager.collection;
  if (typeof collection !== 'function') {
    return undefined;
  }
  const client = manager.client;
  if (!isRecord(client)) {
    return undefined;
  }
  const startSession = client.startSession;
  if (typeof startSession !== 'function') {
    return undefined;
  }
  return {
    client: {
      startSession() {
        const session = Reflect.apply(startSession, client, []);
        if (!isNativeMongoSession(session)) {
          throw new AuthorizationTransactionUnavailableError('MongoDB returned an invalid transaction session.');
        }
        return session;
      },
    },
    collection(name: string, options?: unknown) {
      return Reflect.apply(collection, manager, [name, options]);
    },
  };
}

async function proveNativeMongoTransaction(manager: NativeMongoManager, session: NativeMongoSession): Promise<void> {
  const collection = manager.collection('authorizationaudit');
  if (!isRecord(collection) || typeof collection.findOne !== 'function') {
    throw new AuthorizationTransactionUnavailableError(
      'MongoDB cannot run the authorization transaction capability read.'
    );
  }
  await Reflect.apply(collection.findOne, collection, [{}, { projection: { _id: 1 }, session }]);
}

async function runWithNativeMongoTransaction<T>(
  manager: NativeMongoManager,
  work: (connection: Sails.Connection) => Promise<T>
): Promise<T> {
  const session = manager.client?.startSession();
  if (session === undefined) {
    throw new AuthorizationTransactionUnavailableError();
  }
  session.startTransaction();
  try {
    // A native session does not contact MongoDB until its first operation. This
    // read proves transaction support before caller work can run and does not
    // mutate authorization data.
    await proveNativeMongoTransaction(manager, session);
    const result = await work(sessionBoundConnection(manager, session));
    await session.commitTransaction();
    return result;
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_abortError) {
      // Preserve the mutation/commit failure that caused the rollback attempt.
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export function isAuthorizationTransactionUnavailableError(
  error: unknown
): error is AuthorizationTransactionUnavailableError {
  return error instanceof AuthorizationTransactionUnavailableError;
}

function transactionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
}

function isMongoIllegalOperation(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  const code = typeof error.code === 'number' ? error.code : undefined;
  const codeName = typeof error.codeName === 'string' ? error.codeName : undefined;
  return code === 20 || codeName === 'IllegalOperation';
}

export function isUnavailableTransactionCapabilityError(error: unknown): boolean {
  const message = transactionErrorMessage(error);
  return (
    isMongoIllegalOperation(error) ||
    isUnsupportedTransactionAdapterError(error) ||
    message.includes('transactions are not supported') ||
    message.includes('does not support transactions') ||
    message.includes('transaction numbers are only allowed on a replica set member or mongos') ||
    message.includes('current topology does not support sessions') ||
    message.includes('transaction support is required')
  );
}

/**
 * Runs authorization persistence work exactly once on a leased datastore connection.
 * Every Waterline query created inside `work`, including association mutations, must
 * append `.usingConnection(connection)` before it is awaited. A transaction error is
 * never retried outside the transaction.
 */
export async function runWithRequiredTransaction<T>(
  datastore: Sails.Datastore | null | undefined,
  work: (connection: Sails.Connection) => Promise<T>
): Promise<T> {
  const mongoManager = nativeMongoManager(datastore);
  if (mongoManager === undefined && typeof datastore?.transaction !== 'function') {
    throw new AuthorizationTransactionUnavailableError();
  }
  try {
    if (mongoManager !== undefined) {
      return await runWithNativeMongoTransaction(mongoManager, work);
    }
    if (datastore === null || datastore === undefined || typeof datastore.transaction !== 'function') {
      throw new AuthorizationTransactionUnavailableError();
    }
    return await datastore.transaction(connection => work(connection));
  } catch (error) {
    if (isAuthorizationTransactionUnavailableError(error)) {
      throw error;
    }
    if (isUnavailableTransactionCapabilityError(error)) {
      throw new AuthorizationTransactionUnavailableError(undefined, { cause: error });
    }
    throw error;
  }
}

export type RequiredTransactionCapabilityProbe =
  | { readonly available: true }
  | { readonly available: false; readonly code: typeof AUTHORIZATION_TRANSACTION_UNAVAILABLE };

/**
 * Probes transaction capability with a caller-supplied read-only query. An empty
 * callback is insufficient for MongoDB because it may not start a server transaction.
 */
export async function probeRequiredTransactionCapability(
  datastore: Sails.Datastore | null | undefined,
  readOnlyProbe: (connection: Sails.Connection) => Promise<void>
): Promise<RequiredTransactionCapabilityProbe> {
  try {
    await runWithRequiredTransaction(datastore, async connection => {
      await readOnlyProbe(connection);
    });
    return { available: true };
  } catch (error) {
    if (isAuthorizationTransactionUnavailableError(error)) {
      return { available: false, code: AUTHORIZATION_TRANSACTION_UNAVAILABLE };
    }
    throw error;
  }
}
