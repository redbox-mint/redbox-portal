import _ from 'lodash';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { StorageService } from '../StorageService';
import type { RecordAuditParams } from '../RecordAuditParams';
type AnyRecord = Record<string, unknown>;
export interface RecordAuditReaderInput {
  readonly storage: Pick<StorageService, 'getMeta' | 'getRecordAudit'>;
  readonly log: ILogger;
  resolveUser(username: string): Promise<unknown>;
}
export class RecordAuditReader {
  public constructor(private readonly input: RecordAuditReaderInput) {}
  public async getRecordAudit(params: RecordAuditParams): Promise<Record<string, unknown>[]> {
    const audit = (await this.input.storage.getRecordAudit(params)) as Record<string, unknown>[];
    const actionFilter = _.isString(params.action) ? params.action.trim().toLowerCase() : '';
    const workflowStateFilter = _.isString(params.workflowState) ? params.workflowState.trim().toLowerCase() : '';

    return audit.filter(auditRow => {
      const action = String(auditRow['action'] ?? '')
        .trim()
        .toLowerCase();
      const workflowStageLabel = String(_.get(auditRow, 'record.workflow.stageLabel', ''))
        .trim()
        .toLowerCase();
      const actionMatches = _.isEmpty(actionFilter) || action === actionFilter;
      const workflowMatches = _.isEmpty(workflowStateFilter) || workflowStageLabel.includes(workflowStateFilter);
      return actionMatches && workflowMatches;
    });
  }

  public async getResolvedPermissionsSummary(oid: string) {
    const record = await this.input.storage.getMeta(oid);
    if (_.isEmpty(record)) {
      throw new Error(`Record not found: ${oid}`);
    }

    const authorization = ((record as unknown as AnyRecord).authorization ?? {}) as AnyRecord;
    const resolveUsers = async (value: unknown) => {
      const usernames = Array.isArray(value) ? value : [];
      const resolvedUsers = [];
      for (const usernameValue of usernames) {
        const username = String(usernameValue ?? '');
        if (_.isEmpty(username)) {
          continue;
        }
        try {
          const user = await this.input.resolveUser(username);
          resolvedUsers.push({
            username,
            name: String(_.get(user, 'name', '')),
            email: String(_.get(user, 'email', '')),
          });
        } catch {
          this.input.log.warn(
            `RecordsService.getResolvedPermissionsSummary could not resolve user '${username}' for record '${oid}'.`
          );
          resolvedUsers.push({
            username,
            name: '',
            email: '',
          });
        }
      }
      return resolvedUsers;
    };

    return {
      edit: await resolveUsers(authorization.edit),
      view: await resolveUsers(authorization.view),
      editPending: _.castArray(authorization.editPending ?? []).map(value => String(value ?? '')),
      viewPending: _.castArray(authorization.viewPending ?? []).map(value => String(value ?? '')),
      editRoles: _.castArray(authorization.editRoles ?? []).map(value => String(value ?? '')),
      viewRoles: _.castArray(authorization.viewRoles ?? []).map(value => String(value ?? '')),
    };
  }
}
