import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { firstValueFrom } from 'rxjs';
import type { RecordTypes, RecordTypesConfiguration } from '../../src/recordTypes';

export const pilotConfiguration = (): RecordTypesConfiguration => ({
  appmode: { bootstrapAlways: false },
  recordSchema: { enabled: true },
  recordtype: {
    dataset: {
      packageType: 'dataset',
      searchCore: 'records',
      dashboard: { title: 'Dataset' },
      recordSchema: { unknownProperties: 'declared' },
      concurrentModification: { mode: 'observe' },
      recordValidation: { mode: 'shadow' },
      hooks: {},
      searchable: true,
    },
  },
});

/** Same observation in separate host runs; exclude physical IDs and timestamps. */
export async function capturePilotResult(
  module: Pick<RecordTypes, 'get' | 'getAll' | 'getAllCache' | 'resolveConcurrentModificationPolicy'>,
  brand: { id: string }
) {
  const row = await firstValueFrom(module.get(brand, 'dataset'));
  const result = {
    count: (await firstValueFrom(module.getAll(brand))).length,
    cacheSize: module.getAllCache()?.length,
    packageType: row.packageType,
    schema: row.recordSchema,
    validation: row.recordValidation,
    policy: await firstValueFrom(module.resolveConcurrentModificationPolicy(brand, 'dataset')),
  };
  assert.deepEqual(result, {
    count: 1,
    cacheSize: 1,
    packageType: 'dataset',
    schema: { unknownProperties: 'declared' },
    validation: { mode: 'shadow' },
    policy: { mode: 'observe' },
  });
  const output = process.env.P1_RECORD_TYPES_COMPARISON_OUTPUT;
  if (output) await writeFile(output, JSON.stringify(result, null, 2) + '\n');
}
