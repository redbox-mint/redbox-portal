import DatastreamServiceResponse from './DatastreamServiceResponse';
import Datastream from './Datastream';

interface DatastreamService{

  addDatastreams(oid: string, datastreams: Datastream[]): DatastreamServiceResponse;
  updateDatastream(oid: string, record, newMetadata, fileRoot, fileIdsAdded): any;
  removeDatastream(oid, datastream: Datastream): any;
  addDatastream(oid, datastream: Datastream): any;
  addAndRemoveDatastreams(oid, addDatastreams: Datastream[], removeDatastreams: Datastream[]): any;
  getDatastream(oid, fileId): any;
  listDatastreams(oid, fileId): any;
}
export default DatastreamService
