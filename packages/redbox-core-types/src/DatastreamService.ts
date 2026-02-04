import DatastreamServiceResponse from './DatastreamServiceResponse';
import Datastream from './Datastream';
import { Observable } from 'rxjs';

export interface DatastreamService {
  addDatastreams(oid: string, datastreams: Datastream[]): Promise<DatastreamServiceResponse>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateDatastream(oid: string, record: any, newMetadata: any, fileRoot: string, fileIdsAdded: string[]): Observable<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeDatastream(oid: string, datastream: Datastream): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addDatastream(oid: string, datastream: Datastream): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addAndRemoveDatastreams(oid: string, addDatastreams: Datastream[], removeDatastreams: Datastream[]): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDatastream(oid: string, fileId: string): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listDatastreams(oid: string, fileId: string): any;
}
