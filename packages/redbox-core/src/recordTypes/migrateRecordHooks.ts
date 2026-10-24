import { isDeepStrictEqual } from 'node:util';
import type { BrandingRepository } from '../persistence/branding/BrandingRepository';
import type { RecordTypeRepository } from '../persistence/reference/ReferenceRepositories';
import { convertBuiltinRecordHooks } from './RecordHookNames';

export const RECORD_HOOK_OPERATIONS_MIGRATION_NAME = '20261024T000000-v6-record-hook-operations';
/** Also repairs checkpoints already marked complete by the initial internal v6 converter. */
export const QUEUED_RECORD_HOOK_OPERATIONS_MIGRATION_NAME = '20261024T010000-v6-queued-record-hook-operations';

/** Writers must be stopped. Validate the entire plan before the first durable effect. */
export async function migrateRecordHooks(input: {
  readonly brands: Pick<BrandingRepository, 'listBrands'>;
  readonly types: Pick<RecordTypeRepository, 'listForBrand' | 'reviseDefinition'>;
}): Promise<{ inspected: number; changed: number }> {
  const pending: Array<{ id: string; hooks: ReturnType<typeof convertBuiltinRecordHooks> }> = [];
  let inspected = 0;
  for (const brand of await input.brands.listBrands()) {
    for (const type of await input.types.listForBrand(brand.id)) {
      inspected++;
      // Optional JSON columns decode missing v5 hooks as null.
      if (type.hooks === undefined || type.hooks === null) continue;
      try {
        const hooks = convertBuiltinRecordHooks(type.hooks);
        if (!isDeepStrictEqual(hooks, type.hooks)) pending.push({ id: type.id, hooks });
      } catch {
        // IDs locate the row; never include expressions, options or arbitrary names.
        throw new Error(
          `Record hook conversion failed for record type ID ${type.id}. ` +
            'Convert unsupported expressions, modes or malformed declarations to registered v6 operations before retrying.'
        );
      }
    }
  }
  for (const type of pending) {
    if (!(await input.types.reviseDefinition(type.id, { hooks: type.hooks })))
      throw new Error(`Record hook conversion lost record type ID ${type.id}; stop other writers and retry.`);
  }
  // A failed body can have partial writes. The ledger records only completion;
  // re-running this idempotent plan resumes conversion without replaying effects.
  return { inspected, changed: pending.length };
}
