import { expect } from 'chai';
import { Services, WorkflowTransitionDenied } from '../../src/services/WorkflowTransitionService';
import type { ActiveRecordDefinition } from '../../src/services/RecordDefinitionRuntimeService';

export function manualDefinition(): ActiveRecordDefinition {
  return {
    identity: { brandId: 'default', recordTypeKey: 'dataset' },
    revision: {
      id: 'revision-1',
      definition: {
        stages: [
          { key: 'draft', editRoles: ['Admin'] },
          { key: 'published', editRoles: ['Admin'] },
        ],
        transitions: [
          {
            id: 'submit',
            mode: 'manual',
            sourceStageKey: 'draft',
            targetStageKey: 'published',
            allowedRoles: ['Admin'],
            validationOperation: 'publish',
          },
        ],
      },
    },
  } as any;
}

describe('B07 authoritative manual transition resolution', () => {
  const service = new Services.WorkflowTransition();
  let active: any;
  let record: any;
  let actor: any;
  beforeEach(() => {
    active = manualDefinition();
    record = { revision: 4, workflow: { stage: 'draft' }, metadata: { ready: true } };
    actor = { id: 'admin', roles: ['Admin'] };
  });
  const resolve = (
    active: any,
    record: any,
    actor: any,
    id = 'submit',
    brand = 'default',
    revision: number | undefined = 4
  ) => service.resolve(active, id, record, actor, brand, revision, 'request-1');
  async function denied(promise: Promise<any>, code: string) {
    try {
      await promise;
      expect.fail('transition accepted');
    } catch (error) {
      expect(error).instanceOf(WorkflowTransitionDenied);
      expect((error as WorkflowTransitionDenied).code).equal(code);
      expect(String(error)).not.include('private-secret');
    }
  }
  it('execute forwards only ID and revision and forces the authoritative save path', async () => {
    const previous = (globalThis as any).RecordsService;
    let forwarded: any[] = [];
    (globalThis as any).RecordsService = {
      updateMeta: async (...args: any[]) => {
        forwarded = args;
        return 'saved';
      },
    };
    try {
      await service.execute({ id: 'default' }, actor, {
        oid: 'record-1',
        transitionId: 'submit',
        expectedRevision: 4,
        targetStep: 'forged',
        validationOperation: 'skip',
        roles: ['Guest'],
        metadata: { private: 'secret' },
      } as any);
      expect(forwarded[2]).deep.equal({});
      expect(forwarded.slice(4, 7)).deep.equal([true, true, {}]);
      expect(forwarded[8]).deep.equal({
        requestId: '',
        routeFamily: 'api',
        operation: 'transition',
        transitionId: 'submit',
        concurrency: { expectedRevision: 4, entityTagSupplied: true },
      });
      expect(JSON.stringify(forwarded)).not.include('forged');
      expect(JSON.stringify(forwarded)).not.include('secret');
    } finally {
      (globalThis as any).RecordsService = previous;
    }
  });
  it('resolves target and validation intent exclusively from the selected revision', async () => {
    record.targetStage = 'forged';
    record.allowedRoles = ['Guest'];
    record.validationOperation = 'skip';
    const result = await resolve(active, record, actor);
    expect(result).deep.equal({
      scopeId: 'submit',
      sourceStage: 'draft',
      targetStage: 'published',
      validationOperation: 'publish',
    });
    expect(Object.isFrozen(result)).equal(true);
  });
  for (const id of ['hidden-forged', 'published', 'constructor', '']) {
    it(`denies absent stable ID ${id}`, () =>
      denied(resolve(active, record, actor, id), 'workflow-transition-id-denied'));
  }
  it('denies automatic edges', () => {
    active.revision.definition.transitions[0].mode = 'automatic';
    return denied(resolve(active, record, actor), 'workflow-transition-id-denied');
  });
  it('denies another brand', () =>
    denied(resolve(active, record, actor, 'submit', 'other'), 'workflow-transition-brand-denied'));
  it('denies a wrong source stage', () => {
    record.workflow.stage = 'published';
    return denied(resolve(active, record, actor), 'workflow-transition-source-denied');
  });
  it('denies missing targets', () => {
    active.revision.definition.stages.pop();
    return denied(resolve(active, record, actor), 'workflow-transition-source-denied');
  });
  it('denies unauthenticated actors', () => denied(resolve(active, record, {}), 'workflow-transition-role-denied'));
  it('requires overlap in the same role, not separate source and edge permissions', () => {
    actor.roles = ['Admin', 'Guest'];
    active.revision.definition.transitions[0].allowedRoles = ['Guest'];
    return denied(resolve(active, record, actor), 'workflow-transition-role-denied');
  });
  it('empty allowed roles deny all', () => {
    active.revision.definition.transitions[0].allowedRoles = [];
    return denied(resolve(active, record, actor), 'workflow-transition-role-denied');
  });
  it('denies stale revisions', () =>
    denied(resolve(active, record, actor, 'submit', 'default', 3), 'record-revision-stale'));
  it('requires a usable record revision', () =>
    denied(resolve(active, record, actor, 'submit', 'default', NaN), 'record-precondition-required'));
  it('denies hidden transitions whose server eligibility is false', async () => {
    active.revision.definition.transitions[0].eligibilityCondition = 'record.candidate.metadata.ready = false';
    await denied(resolve(active, record, actor), 'workflow-transition-ineligible');
  });
  it('accepts server eligibility true', async () => {
    active.revision.definition.transitions[0].eligibilityCondition = 'record.candidate.metadata.ready = true';
    expect((await resolve(active, record, actor)).scopeId).equal('submit');
  });
  it('redacts malformed eligibility', async () => {
    active.revision.definition.transitions[0].eligibilityCondition = '$eval("private-secret")';
    await denied(resolve(active, record, actor), 'workflow-transition-eligibility-failed');
  });
});
