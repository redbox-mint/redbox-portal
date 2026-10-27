import { get, set } from 'lodash';
import { PersistenceError } from '../errors';
import type { DefinitionValues } from './ReferenceRepositories';
export function projectNamedQueryRecords(records: DefinitionValues[], select?: readonly string[]): DefinitionValues[] {
  if (!select) return records;
  return records.map(row => {
    const selected: DefinitionValues = { ...(row.id !== undefined ? { id: row.id } : {}) };
    for (const path of select) {
      const value = get(row, path);
      if (typeof value === 'function')
        throw new PersistenceError(
          'named-query-compatibility',
          'The named-query projection refers to a non-data member. Select stored data fields explicitly.'
        );
      if (value !== undefined) set(selected, path, value);
    }
    return selected;
  });
}
