import type { IdentityRepositories } from '../persistence/identity/IdentityRepositories';
import type { RecordsService } from '../RecordsService';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import _ from 'lodash';
import { Observable, from, defer } from 'rxjs';
export interface WorkspaceInput {
  readonly identities: Pick<IdentityRepositories, 'one' | 'update' | 'remove' | 'findOrCreateWorkspace'>;
  readonly records: Pick<RecordsService, 'getMeta' | 'appendToRecord' | 'removeFromRecord'>;
  readonly log: ILogger;
}
import axios, { AxiosResponse } from 'axios';

function isActor(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export namespace Services {
  export class WorkspaceService {
    protected _exportedMethods: string[] = [
      'createWorkspaceRecord',
      'getRecordMeta',
      'updateRecordMeta',
      'userInfo',
      'provisionerUser',
      'infoFormUserId',
      'createWorkspaceInfo',
      'updateWorkspaceInfo',
      'workspaceAppFromUserId',
      'removeAppFromUserId',
      'mapToRecord',
      'addWorkspaceToRecord',
      'removeWorkspaceFromRecord',
      'getWorkspaces',
    ];

    constructor(protected readonly input: WorkspaceInput) {}

    protected getObservable<T>(operation: () => Promise<T>): Observable<T> {
      let pending: Promise<T> | undefined;
      return defer(() => (pending ??= Promise.resolve().then(operation)));
    }

    mapToRecord(obj: Record<string, unknown>, recordMap: Array<{ record: string; ele: string }>) {
      const newObj: Record<string, unknown> = {};
      _.each(recordMap, (value: { record: string; ele: string }) => {
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
    public async addWorkspaceToRecord(
      targetRecordOid: string,
      workspaceOid: string,
      workspaceData: Record<string, unknown> = {},
      targetRecord: Record<string, unknown> | undefined = undefined,
      initiatingUser: unknown = {}
    ) {
      if (!isActor(initiatingUser)) throw new TypeError('Workspace changes require an initiating user object.');
      workspaceData.id = workspaceOid;
      return await this.input.records.appendToRecord(
        targetRecordOid,
        workspaceData,
        'metadata.workspaces',
        'array',
        targetRecord,
        initiatingUser
      );
    }

    /**
     * Remove a workspace to a record.
     *
     * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
     * @param  targetRecordOid - the OID of the record to update
     * @param  workspaceOid - the OID of the workspace, this will override the 'id' field in workspaceData parameter
     * @param  workspaceData - in addition to the workspace id, any optional data to add, defaults to empty map. Note that the user interface will not be relying on the data on this array to display the association.
     * @param  targetRecord - the target record to update, leaving it empty will retrieve the record
     * @return
     */
    public async removeWorkspaceFromRecord(
      targetRecordOid: string,
      workspaceOid: string,
      workspaceData: Record<string, unknown> = {},
      targetRecord: Record<string, unknown> | undefined = undefined,
      initiatingUser: unknown = {}
    ) {
      if (!isActor(initiatingUser)) throw new TypeError('Workspace changes require an initiating user object.');
      workspaceData.id = workspaceOid;
      return await this.input.records.removeFromRecord(
        targetRecordOid,
        workspaceData,
        'metadata.workspaces',
        targetRecord,
        initiatingUser
      );
    }

    /**
     * Retrieves workspaces from a record.
     *
     * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
     * @param  targetRecordOid
     * @param  targetRecord
     * @return list of workspaces
     */
    public async getWorkspaces(targetRecordOid: string, targetRecord: unknown = undefined) {
      if (_.isUndefined(targetRecord)) {
        targetRecord = await this.input.records.getMeta(targetRecordOid);
      }
      const workspaces: unknown[] = [];
      for (const workspaceInfo of _.get(targetRecord, 'metadata.workspaces', []) as Array<{ id: string }>) {
        workspaces.push(await this.input.records.getMeta(workspaceInfo.id));
      }
      return workspaces;
    }

    createWorkspaceRecord(
      config: { brandingAndPortalUrl: string; redboxHeaders: Record<string, string> },
      username: string,
      project: Record<string, unknown>,
      recordType: string,
      workflowStage: string
    ): Observable<AxiosResponse<unknown>> {
      // TODO: how to get the workflowStage??
      // TODO: Get the project metadata from the form, move this logic to the controller
      this.input.log.debug('Creating workspace record.');
      const post = {
        method: 'post',
        url: config.brandingAndPortalUrl + `/api/records/metadata/${recordType}`,
        data: {
          authorization: {
            edit: [username],
            view: [username],
            editPending: [],
            viewPending: [],
          },
          metadata: project,
          workflowStage: workflowStage,
        },
        headers: config.redboxHeaders,
      };
      return from(axios(post));
    }

    getRecordMeta(
      config: { brandingAndPortalUrl: string; redboxHeaders: Record<string, string> },
      rdmp: string
    ): Observable<AxiosResponse<unknown>> {
      const get = {
        method: 'get',
        url: config.brandingAndPortalUrl + '/api/records/metadata/' + rdmp,
        headers: config.redboxHeaders,
      };
      return from(axios(get));
    }

    updateRecordMeta(
      config: { brandingAndPortalUrl: string; redboxHeaders: Record<string, string> },
      record: Record<string, unknown>,
      id: string
    ): Observable<AxiosResponse<unknown>> {
      const post = {
        method: 'put',
        url: config.brandingAndPortalUrl + '/api/records/metadata/' + id,
        data: record,
        headers: config.redboxHeaders,
      };
      return from(axios(post));
    }

    userInfo(userId: string) {
      return this.getObservable(() => this.input.identities.one('user', { id: userId }));
    }

    provisionerUser(username: string) {
      return this.getObservable(() => this.input.identities.one('user', { username: username }));
    }

    infoFormUserId(userId: string) {
      return this.getObservable(() =>
        this.input.identities.one('user', { id: userId }, { populate: ['workspaceApps'] })
      );
    }

    createWorkspaceInfo(userId: string, appName: string, info: unknown) {
      return this.getObservable(() =>
        this.input.identities.findOrCreateWorkspace(
          { app: appName, user: userId },
          { app: appName, user: userId, info: info }
        )
      );
    }

    updateWorkspaceInfo(id: string, info: unknown) {
      return this.getObservable(() => this.input.identities.update('workspaceapp', { id: id }, { info: info }));
    }

    workspaceAppFromUserId(userId: string, appName: string) {
      return this.getObservable(() => this.input.identities.one('workspaceapp', { app: appName, user: userId }));
    }

    removeAppFromUserId(userId: string, id: string) {
      return this.getObservable(() => this.input.identities.remove('workspaceapp', { id: id, user: userId }));
    }
  }
}
