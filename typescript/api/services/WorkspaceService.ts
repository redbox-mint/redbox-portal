import { Observable } from 'rxjs/Rx';
import {Services as services}   from '@researchdatabox/redbox-core-types';
import { Sails, Model } from "sails";
import axios from 'axios';

declare var RecordsService, BrandingService;
declare var sails: Sails;
declare var _this;
declare var _;
declare var Institution, User: Model, WorkspaceApp: Model, Form: Model;

export module Services {

  export class WorkspaceService extends services.Core.Service {

    protected _exportedMethods: any = [
      'createWorkspaceRecord',
      'getRecordMeta',
      'updateRecordMeta',
      'registerUserApp',
      'userInfo',
      'provisionerUser',
      'infoFormUserId',
      'createWorkspaceInfo',
      'updateWorkspaceInfo',
      'workspaceAppFromUserId',
      'removeAppFromUserId',
      'mapToRecord',
      'addWorkspaceToRecord',
      'getWorkspaces'
    ];

    constructor() {
      super();
    }

    mapToRecord(obj: any, recordMap: any) {
      let newObj = {};
      _.each(recordMap, (value) => {
        newObj[value.record] = _.get(obj, value.ele);
      });
      return newObj;
    }

    /**
     * Adds a workspace to a record.
     *
     * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
     * @param  targetRecordOid - the OID of the record to update
     * @param  workspaceOid - the OID of the workspace, this will override the 'id' field in workspaceData parameter
     * @param  workspaceData - in addition to the workspace id, any optional data to add, defaults to empty map. Note that the user interface will not be relying on the data on this array to display the association.
     * @param  targetRecord - the target record to update, leaving it empty will retrieve the record
     * @return
     */
    public async addWorkspaceToRecord(targetRecordOid: string, workspaceOid: string, workspaceData:any = {}, targetRecord: any = undefined) {
      workspaceData.id = workspaceOid;
      return await RecordsService.appendToRecord(targetRecordOid, workspaceData, 'metadata.workspaces', 'array', targetRecord);
    }

    /**
     * Retrieves workspaces from a record.
     *
     * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
     * @param  targetRecordOid
     * @param  targetRecord
     * @return list of workspaces
     */
    public async getWorkspaces(targetRecordOid: string, targetRecord:any = undefined) {
      if (_.isUndefined(targetRecord)) {
        targetRecord = await RecordsService.getMeta(targetRecordOid).toPromise();
      }
      const workspaces = [];
      _.each(_.get(targetRecord, 'metadata.workspaces'), async (workspaceInfo:any) => {
        workspaces.push(await RecordsService.getMeta(workspaceInfo.id).toPromise());
      });
      return workspaces;
    }

    createWorkspaceRecord(config: any, username: string, project: any, recordType: string, workflowStage: string) {
      // TODO: how to get the workflowStage??
      // TODO: Get the project metadata from the form, move this logic to the controller
      sails.log.debug(config);
      const post = {
        method: 'post',
        url: config.brandingAndPortalUrl + `/api/records/metadata/${recordType}`,
        data: {
          authorization: {
            edit: [username],
            view: [username],
            editPending:[],
            viewPending:[]
          },
          metadata: project,
          workflowStage: workflowStage
        },
        headers: config.redboxHeaders
      };
      return Observable.fromPromise(axios(post));
    }

    getRecordMeta(config: any, rdmp: string) {
      const get = {
        method: 'get',
        url: config.brandingAndPortalUrl + '/api/records/metadata/' + rdmp,
        headers: config.redboxHeaders
      };
      return Observable.fromPromise(axios(get));
    }

    updateRecordMeta(config: any, record: any, id: string) {
      const post = {
        method: 'put',
        url: config.brandingAndPortalUrl + '/api/records/metadata/' + id,
        data: record,
        headers: config.redboxHeaders
      };
      return Observable.fromPromise(axios(post));
    }

    userInfo(userId: string) {
      return super.getObservable(
        User.findOne({ id: userId })
      )
    }

    provisionerUser(username: string) {
      return super.getObservable(
        User.findOne({username: username})
      )
    }

    infoFormUserId(userId) {
      return this.getObservable(
        User.findOne({ id: userId }).populate('workspaceApps')
      );
    }

    createWorkspaceInfo(userId, appName, info) {
      return this.getObservable(
        WorkspaceApp.findOrCreate(
          {app: appName, user: userId},
          {app: appName, user: userId, info: info}
        )
      );
    }

    updateWorkspaceInfo(id, info) {
      return this.getObservable(
        WorkspaceApp.update(
          {id: id},
          {info: info}
        )
      );
    }

    workspaceAppFromUserId(userId, appName){
      return this.getObservable(
        WorkspaceApp.findOne({app: appName, user: userId})
      );
    }

    removeAppFromUserId(userId, id){
      return this.getObservable(
        WorkspaceApp.destroy({id: id, user: userId})
      );
    }

  }

}
module.exports = new Services.WorkspaceService().exports();
