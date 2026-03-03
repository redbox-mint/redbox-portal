import DatastreamServiceResponse from './DatastreamServiceResponse';
import Datastream from './Datastream';
import { Observable } from 'rxjs';
import type { Services as StorageManagerServices } from './services/StorageManagerService';

type DatastreamContent = {
  readstream?: NodeJS.ReadableStream;
  body?: Buffer | string;
} & Record<string, unknown>;

export interface DatastreamService {
  addDatastreams(oid: string, datastreams: Datastream[]): Promise<DatastreamServiceResponse>;
  updateDatastream(
    oid: string,
    record: unknown,
    newMetadata: unknown,
    stagingDisk: StorageManagerServices.IDisk,
    fileIdsAdded: Datastream[]
  ): Observable<Promise<unknown>[]>;
  removeDatastream(oid: string, datastream: Datastream): Promise<unknown>;
  addDatastream(oid: string, datastream: Datastream, stagingDisk?: StorageManagerServices.IDisk): Promise<unknown>;
  addAndRemoveDatastreams(
    oid: string,
    addDatastreams: Datastream[],
    removeDatastreams: Datastream[],
    stagingDisk?: StorageManagerServices.IDisk
  ): Promise<unknown>;
  getDatastream(oid: string, fileId: string): Promise<DatastreamContent>;
  listDatastreams(oid: string, fileId: string): Promise<Record<string, unknown>[]>;
}
