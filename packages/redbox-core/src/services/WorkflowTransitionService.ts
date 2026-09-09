import { Services as services } from '../CoreService';
import type { RecordSaveResponse } from '../RecordSaveResponse';
import type { ActionJsonObject } from '../action-registry';
import {
  compileManagedJsonataExpression,
  evaluateManagedCondition,
  projectTransitionConditionContext,
} from '../expression-runtime';
import { projectRecordActionActor, projectRecordActionCandidate } from './record-actions/coordinator';
import type { ActiveRecordDefinition } from './RecordDefinitionRuntimeService';

export interface ManualTransitionRequest {
  readonly oid: string;
  readonly transitionId: string;
  readonly expectedRevision: number;
}

export class WorkflowTransitionDenied extends Error {
  constructor(public readonly code: string) {
    super('Workflow transition was denied.');
  }
}

export interface WorkflowTransitionServiceExports {
  execute(
    brand: ActionJsonObject,
    actor: ActionJsonObject,
    request: ManualTransitionRequest
  ): Promise<RecordSaveResponse>;
}

export namespace Services {
  export class WorkflowTransition extends services.Core.Service {
    protected override _exportedMethods = ['execute'];

    /** Brand and actor are authenticated server facts; request contributes only ID and revision. */
    public async execute(
      brand: ActionJsonObject,
      actor: ActionJsonObject,
      request: ManualTransitionRequest
    ): Promise<RecordSaveResponse> {
      return RecordsService.updateMeta(brand, request.oid, {}, actor, true, true, {}, undefined, {
        requestId: '',
        routeFamily: 'api',
        operation: 'transition',
        transitionId: request.transitionId,
        concurrency: { expectedRevision: request.expectedRevision, entityTagSupplied: true },
      });
    }

    /** Called inside the save boundary with its selected immutable definition and stored snapshot. */
    public async resolve(
      active: ActiveRecordDefinition,
      transitionId: string | undefined,
      record: ActionJsonObject,
      actorValue: ActionJsonObject,
      brandId: string,
      expectedRevision: number | undefined,
      requestId: string
    ) {
      const deny = (code: string): never => {
        throw new WorkflowTransitionDenied(code);
      };
      if (active.identity.brandId !== brandId) deny('workflow-transition-brand-denied');
      const transition = active.revision.definition.transitions.find(item => item.id === transitionId);
      if (!transition || transition.mode !== 'manual') return deny('workflow-transition-id-denied');
      const source = active.revision.definition.stages.find(stage => stage.key === transition.sourceStageKey);
      const target = active.revision.definition.stages.find(stage => stage.key === transition.targetStageKey);
      const candidate = projectRecordActionCandidate(record);
      const workflow = candidate.workflow;
      if (
        !source ||
        !target ||
        !workflow ||
        typeof workflow !== 'object' ||
        Array.isArray(workflow) ||
        workflow.stage !== source.key
      )
        return deny('workflow-transition-source-denied');
      const actor = projectRecordActionActor(actorValue);
      if (
        !actor ||
        !actor.roles.some(role => source.editRoles.includes(role) && transition.allowedRoles.includes(role))
      )
        return deny('workflow-transition-role-denied');
      if (expectedRevision === undefined || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
        deny('record-precondition-required');
      if (expectedRevision !== (record.revision ?? 0)) deny('record-revision-stale');
      if (transition.eligibilityCondition) {
        try {
          const context = projectTransitionConditionContext({
            schemaVersion: 1,
            executionId: requestId,
            correlationId: requestId,
            timestamp: new Date().toISOString(),
            brandId,
            recordTypeKey: active.identity.recordTypeKey,
            actor,
            scope: {
              context: 'workflow-transition',
              mode: 'onTransitionWorkflow',
              phase: 'pre',
              scopeId: transition.id,
            },
            record: { current: candidate, candidate },
            transition: { scopeId: transition.id, sourceStage: source.key, targetStage: target.key },
            priorOutputs: [],
          });
          if (
            !(await evaluateManagedCondition(compileManagedJsonataExpression(transition.eligibilityCondition), context))
          )
            deny('workflow-transition-ineligible');
        } catch (error) {
          if (error instanceof WorkflowTransitionDenied) throw error;
          deny('workflow-transition-eligibility-failed');
        }
      }
      return Object.freeze({
        scopeId: transition.id,
        sourceStage: source.key,
        targetStage: target.key,
        validationOperation: transition.validationOperation,
      });
    }
  }
}
