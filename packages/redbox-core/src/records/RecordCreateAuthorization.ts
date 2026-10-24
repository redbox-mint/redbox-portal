import { RECORD_VALIDATION_DIAGNOSTIC_CODES } from '../forms/RecordValidation';
import { RECORD_VALIDATION_REFERENCE_PATTERN } from '@researchdatabox/sails-ng-common';
import _ from 'lodash';
import { firstValueFrom } from 'rxjs';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { RecordTypeModel } from '../model/storage/RecordTypeModel';
import type { WorkflowStepModel } from '../model/storage/WorkflowStepModel';
import type { RecordTypes } from '../recordTypes/RecordTypes';
import type { Services as Workflow } from '../workflows/WorkflowSteps';
import { hasEditAccess, hasTransitionRoleAuthorization } from './access';

type AnyRecord = Record<string, unknown>;
type RecordTypeLike = Partial<RecordTypeModel>;
type WorkflowStepLike = Partial<WorkflowStepModel>;
export interface RecordCreateAuthorizationInput {
  readonly recordTypes: Pick<RecordTypes, 'get'>;
  readonly workflows: Pick<Workflow.WorkflowSteps, 'get' | 'getFirst'>;
  hasEditAccess: typeof hasEditAccess;
  hasTransitionRoleAuthorization: typeof hasTransitionRoleAuthorization;
}
/** The same authoritative ACL projection used by create and schema discovery. */
export class RecordCreateAuthorization {
  public constructor(private readonly input: RecordCreateAuthorizationInput) {}
  private recordObject(value: unknown): AnyRecord {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : {};
  }
  public hasConfiguredRecordCreatorEditPermission(recordType: RecordTypeLike): boolean {
    const declarations = _.get(recordType, 'hooks.onCreate.pre');
    if (!Array.isArray(declarations)) return false;

    return declarations.some(declaration => {
      const hook = this.recordObject(declaration);
      const hookFunction = String(hook.function ?? '').trim();
      if (hookFunction !== 'record.assignPermissions' && hookFunction !== 'record.complexAssignPermissions') {
        return false;
      }

      const options = this.recordObject(hook.options);
      // A conditional hook cannot be treated as an unconditional create
      // capability before the candidate exists and the hook has run.
      if (String(options.triggerCondition ?? '').trim()) return false;
      const creatorPermissions = String(options.recordCreatorPermissions ?? '').trim();
      return creatorPermissions === 'edit' || creatorPermissions === 'view&edit';
    });
  }

  /**
   * Project create authorization only from authoritative workflow ACLs and
   * explicit built-in creator permissions. Submitted record authorization is
   * persistence data and must never grant the capability that permits schema
   * compilation or grant persistence.
   */
  public createAuthorizationProjection(
    workflowSteps: readonly WorkflowStepLike[],
    recordType?: RecordTypeLike,
    user?: AnyRecord
  ): AnyRecord {
    const projection = { authorization: {} } as AnyRecord;
    const authorization = projection.authorization as AnyRecord;
    for (const workflowStep of workflowSteps) {
      const configured = this.recordObject(_.get(workflowStep, 'config.authorization'));
      authorization.viewRoles = authorization.viewRoles ?? _.cloneDeep(configured.viewRoles);
      authorization.editRoles = authorization.editRoles ?? _.cloneDeep(configured.editRoles);
    }
    if (recordType && user && this.hasConfiguredRecordCreatorEditPermission(recordType)) {
      const username = String(user.username ?? '').trim();
      if (username) authorization.edit = [username];
    }
    return projection;
  }

  public async hasCreateAccess(
    brand: unknown,
    user: AnyRecord,
    roles: AnyRecord[],
    recordTypeName: string,
    workflowStepName: string
  ): Promise<boolean> {
    const brandObj = brand as BrandingModel;
    const normalizedRecordType = String(recordTypeName ?? '').trim();
    const normalizedWorkflowStep = String(workflowStepName ?? '').trim();
    if (!String(brandObj?.id ?? '').trim() || !normalizedRecordType || !normalizedWorkflowStep) return false;

    const recordType = (await firstValueFrom(
      this.input.recordTypes.get(brandObj, normalizedRecordType)
    )) as RecordTypeLike | null;
    if (!recordType) return false;
    const startingStep = (await firstValueFrom(this.input.workflows.getFirst(recordType))) as WorkflowStepLike | null;
    if (!startingStep) return false;
    const workflowSteps: WorkflowStepLike[] = [startingStep];
    if (normalizedWorkflowStep !== String(startingStep.name ?? '').trim()) {
      const targetStep = (await firstValueFrom(
        this.input.workflows.get(recordType, normalizedWorkflowStep)
      )) as WorkflowStepLike | null;
      if (resolvedWorkflowTargetDiagnostic(targetStep, normalizedWorkflowStep)) return false;
      if (!this.input.hasTransitionRoleAuthorization(targetStep, user)) return false;
      workflowSteps.push(targetStep as WorkflowStepLike);
    }
    return this.input.hasEditAccess(
      brandObj,
      user,
      roles,
      this.createAuthorizationProjection(workflowSteps, recordType, user)
    );
  }
}
export function resolvedWorkflowTargetDiagnostic(step: unknown, expectedName: string) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    return RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound;
  }
  const candidate = step as WorkflowStepLike;
  const stepName = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(stepName) || stepName !== expectedName) {
    return RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound;
  }
  if (!candidate.config || typeof candidate.config !== 'object' || Array.isArray(candidate.config)) {
    return RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed;
  }
  const form: unknown = Reflect.get(candidate.config, 'form');
  if (typeof form !== 'string' || !form.trim()) {
    return RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepFormMissing;
  }
  if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(form.trim())) {
    return RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceMalformed;
  }
  return undefined;
}
