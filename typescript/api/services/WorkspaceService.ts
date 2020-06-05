import { Observable } from 'rxjs/Rx';
import services = require('../core/CoreService.js');
import { Sails, Model } from "sails";
import * as request from "request-promise";

declare var RecordsService, BrandingService;
declare var sails: Sails;
declare var _this;
declare var _;
declare var Institution, User: Model, WorkspaceApp: Model, Form: Model;

export module Services {

  export class WorkspaceService extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'createWorkspaceRecord',
      'getRecordMeta',
      'updateRecordMeta',
      'registerUserApp',
      'userInfo',
      'provisionerUser',
      'getCookies',
      'getCookieValue',
      'cookieJar',
      'infoFormUserId',
      'createWorkspaceInfo',
      'updateWorkspaceInfo',
      'workspaceAppFromUserId',
      'removeAppFromUserId',
      'mapToRecord'
    ];

    constructor() {
      super();
    }

    getCookies(cookies) {
      const cookieJar = [];
      cookies.forEach((rawcookies) => {
        var cookie = request.cookie(rawcookies);
        cookieJar.push({key: cookie.key, value: cookie.value, expires: cookie.expires});
      });
      return cookieJar;
    }

    getCookieValue(cookieJar, key) {
      const cookie = _.findWhere(cookieJar, {key: key});
      if(cookie) {
        return cookie.value;
      }else return '';
    }

    cookieJar(jar: any, config:any, key: string, value: string){
      const keyvalue = key + '=' + value;
      const cookie = request.cookie('' + keyvalue);
      jar.setCookie(cookie, config.host, function(error, cookie) {
        sails.log.debug(cookie);
      });
      return jar;
    }

    mapToRecord(obj: any, recordMap: any) {
      let newObj = {};
      _.each(recordMap, (value) => {
        newObj[value.record] = _.get(obj, value.ele);
      });
      return newObj;
    }

    createWorkspaceRecord(config: any, username: string, project: any, recordType: string, workflowStage: string, emailPendingUsers: Array<string>) {
      // TODO: how to get the workflowStage??
      // TODO: Get the project metadata from the form, move this logic to the controller
      if(!emailPendingUsers) {
        emailPendingUsers = [];
      }
      sails.log.debug(config);
      const post = request({
        uri: config.brandingAndPortalUrl + `/api/records/metadata/${recordType}`,
        method: 'POST',
        body: {
          authorization: {
            edit: [username],
            view: [username],
            editPending: [...emailPendingUsers],
            viewPending: [...emailPendingUsers]
          },
          metadata: project,
          workflowStage: workflowStage
        },
        json: true,
        headers: config.redboxHeaders
      });
      return Observable.fromPromise(post);
    }

    getRecordMeta(config: any, rdmp: string) {
      const get = request({
        uri: config.brandingAndPortalUrl + '/api/records/metadata/' + rdmp,
        json: true,
        headers: config.redboxHeaders
      });
      return Observable.fromPromise(get);
    }

    updateRecordMeta(config: any, record: any, id: string) {
      const post = request({
        uri: config.brandingAndPortalUrl + '/api/records/metadata/' + id,
        method: 'PUT',
        body: record,
        json: true,
        headers: config.redboxHeaders
      });
      return Observable.fromPromise(post);
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
