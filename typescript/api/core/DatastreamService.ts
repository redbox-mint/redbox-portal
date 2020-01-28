interface DatastreamService{

  addDatastreams(oid: string, fileIds: any[]): any;
  updateDatastream(oid: string, record, newMetadata, fileRoot, fileIdsAdded): any;
  removeDatastream(oid, fileId): any;
  addDatastream(oid, fileId): any;
  addAndRemoveDatastreams(oid, addIds: any[], removeIds: any[]): any;
  getDatastream(oid, fileId): any;
  listDatastreams(oid, fileId): any;
}
export default DatastreamService
