import { repositoryFixtures } from './repositoryFixtures';
import * as sinon from 'sinon';
import * as runtime from '../../src/persistence/storage/runtime';
/** Existing service model spies sit behind the new plain read contract. */
export function installStorageRecordMock() {
  const translate = (value: any): any =>
    Array.isArray(value)
      ? value.map(translate)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
              { $or: 'or', $and: 'and', $in: 'in' }[key] ?? key,
              translate(item),
            ])
          )
        : value;
  const records = {
    async find(where: object, options?: { limit?: number }) {
      const model = repositoryFixtures.Record;
      let query = model?.find(translate(where));
      if (options?.limit && query?.limit) query = query.limit(options.limit);
      if (query?.meta) query = query.meta({ enableExperimentalDeepTargets: true });
      const result = await query;
      return result ?? [];
    },
  };
  sinon
    .stub(runtime, 'getStorageRepositories')
    .returns({ records } as unknown as ReturnType<typeof runtime.getStorageRepositories>);
}
