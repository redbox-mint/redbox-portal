import DatastreamServiceResponse from './DatastreamServiceResponse';
import Datastream from './Datastream';

export interface DatastreamService{

  addDatastreams(oid: string, datastreams: Datastream[]): Promise<DatastreamServiceResponse>;
  updateDatastream(oid: string, record, newMetadata, fileRoot, fileIdsAdded): any;
  removeDatastream(oid, datastream: Datastream): any;
  addDatastream(oid, datastream: Datastream): any;
  addAndRemoveDatastreams(oid, addDatastreams: Datastream[], removeDatastreams: Datastream[]): any;
  getDatastream(oid, fileId): any;
  listDatastreams(oid, fileId): any;
}
