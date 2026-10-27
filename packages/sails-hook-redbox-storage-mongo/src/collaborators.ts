import type { RecordTypes, StorageDisks, StorageFormReader } from '@researchdatabox/redbox-core/extensions/storage';

export interface StorageCollaborators {
  readonly log: Pick<Console, 'error'> & { verbose(...args: unknown[]): void };
  readonly recordTypes: Pick<RecordTypes, 'get'>;
  readonly forms: StorageFormReader;
  readonly disks: StorageDisks;
  translate(key: string): string;
  exportMaxRecords(): number;
}
