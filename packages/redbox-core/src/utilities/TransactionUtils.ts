export interface RunWithOptionalTransactionOptions {
  logger?: Pick<Sails.Log, 'warn'>;
  unsupportedAdapterWarning?: string;
}

export function isUnsupportedTransactionAdapterError(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error).toLowerCase();
  return message.includes('transactional') && message.includes('adapter');
}

export async function runWithOptionalTransaction<T>(
  datastore: Sails.Datastore | null | undefined,
  work: (connection?: Sails.Connection) => Promise<T>,
  options: RunWithOptionalTransactionOptions = {}
): Promise<T> {
  if (datastore?.transaction) {
    try {
      return await datastore.transaction(async (connection: Sails.Connection) => work(connection));
    } catch (error) {
      if (!isUnsupportedTransactionAdapterError(error)) {
        throw error;
      }
      options.logger?.warn?.(
        options.unsupportedAdapterWarning
        ?? 'Transactions are not supported by this datastore adapter. Falling back to non-transactional execution.'
      );
      return work(undefined);
    }
  }
  return work(undefined);
}
