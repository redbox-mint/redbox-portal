import { assert } from 'chai';
import type { ActionJsonObject } from '../../src/action-registry';
import { ManagedExpressionError } from '../../src/expression-runtime';
import {
  AutomaticTransitionConfigurationError,
  evaluateAutomaticTransitionPlan,
  resolveAutomaticTransitionPlan,
  type AutomaticTransitionDefinition,
  type AutomaticTransitionEvaluationInput,
} from '../../src/workflow-transition/automatic';
import { recordtype as developmentRecordTypes } from '../../../redbox-hook-dev/src/config/recordtype';

function transition(
  id: string,
  sourceStage: string,
  targetStage: string,
  priority: number,
  condition: string,
  event: AutomaticTransitionDefinition['event'] = 'update'
): AutomaticTransitionDefinition {
  return {
    schemaVersion: 1,
    id,
    mode: 'automatic',
    event,
    sourceStage,
    targetStage,
    priority,
    condition,
  };
}

function input(
  sourceStage: string,
  candidate: ActionJsonObject,
  event: AutomaticTransitionDefinition['event'] = 'update'
): AutomaticTransitionEvaluationInput {
  return {
    executionId: 'execution-1',
    correlationId: 'correlation-1',
    timestamp: '2026-08-28T00:00:00.000Z',
    brandId: 'brand-1',
    recordTypeKey: 'dataset',
    actor: { id: 'user-1', roles: ['Researcher'] },
    event,
    oid: 'record-1',
    current: { workflow: { stage: sourceStage } },
    candidate,
    sourceStage,
  };
}

describe('automatic transition evaluation', function () {
  it('returns no match without changing the candidate', async function () {
    const candidate: ActionJsonObject = { workflow: { stage: 'draft' }, metadata: { ready: false } };
    const snapshot = structuredClone(candidate);
    const plan = resolveAutomaticTransitionPlan(
      {
        automaticTransitions: [
          transition('draft-to-review', 'draft', 'review', 10, 'record.candidate.metadata.ready = true'),
        ],
      },
      'dataset'
    );

    const match = await evaluateAutomaticTransitionPlan(plan, input('draft', candidate));

    assert.equal(match, null);
    assert.deepEqual(candidate, snapshot);
  });

  it('sorts by priority and applies only the first competing match', async function () {
    const plan = resolveAutomaticTransitionPlan(
      {
        automaticTransitions: [
          transition('draft-to-published', 'draft', 'published', 20, 'true'),
          transition('draft-to-review', 'draft', 'review', 10, 'true'),
        ],
      },
      'dataset'
    );

    const match = await evaluateAutomaticTransitionPlan(
      plan,
      input('draft', { workflow: { stage: 'draft' }, metadata: {} })
    );

    assert.equal(match?.definition.id, 'draft-to-review');
    assert.equal(match?.definition.targetStage, 'review');
  });

  it('does not chain from the selected target during the same evaluation', async function () {
    const plan = resolveAutomaticTransitionPlan(
      {
        automaticTransitions: [
          transition('draft-to-review', 'draft', 'review', 10, 'true'),
          transition('review-to-published', 'review', 'published', 10, 'true'),
        ],
      },
      'dataset'
    );

    const match = await evaluateAutomaticTransitionPlan(
      plan,
      input('draft', { workflow: { stage: 'draft' }, metadata: {} })
    );

    assert.equal(match?.definition.targetStage, 'review');
  });

  it('filters by save event and permits the same source priority across different events', async function () {
    const plan = resolveAutomaticTransitionPlan(
      {
        automaticTransitions: [
          transition('draft-on-create', 'draft', 'queued', 10, 'true', 'create'),
          transition('draft-on-update', 'draft', 'review', 10, 'true', 'update'),
        ],
      },
      'dataset'
    );
    const candidate: ActionJsonObject = { workflow: { stage: 'draft' }, metadata: {} };

    const createMatch = await evaluateAutomaticTransitionPlan(plan, input('draft', candidate, 'create'));
    const updateMatch = await evaluateAutomaticTransitionPlan(plan, input('draft', candidate, 'update'));
    const wrongEventMatch = await evaluateAutomaticTransitionPlan(
      resolveAutomaticTransitionPlan(
        {
          automaticTransitions: [transition('create-only', 'draft', 'queued', 10, 'true', 'create')],
        },
        'dataset'
      ),
      input('draft', candidate, 'update')
    );

    assert.equal(createMatch?.definition.id, 'draft-on-create');
    assert.equal(updateMatch?.definition.id, 'draft-on-update');
    assert.equal(wrongEventMatch, null);
  });

  it('rejects duplicate source priorities and duplicate IDs before evaluation', function () {
    assert.throws(
      () =>
        resolveAutomaticTransitionPlan(
          {
            automaticTransitions: [
              transition('first', 'draft', 'review', 10, 'true'),
              transition('second', 'draft', 'published', 10, 'true'),
            ],
          },
          'dataset'
        ),
      AutomaticTransitionConfigurationError
    );
    assert.throws(
      () =>
        resolveAutomaticTransitionPlan(
          {
            automaticTransitions: [
              transition('same-id', 'draft', 'review', 10, 'true'),
              transition('same-id', 'review', 'published', 20, 'true'),
            ],
          },
          'dataset'
        ),
      AutomaticTransitionConfigurationError
    );
  });

  it('rejects forbidden JSONata properties and non-boolean results without source disclosure', async function () {
    let configurationFailure: Error | undefined;
    try {
      resolveAutomaticTransitionPlan(
        {
          automaticTransitions: [
            transition('unsafe', 'draft', 'review', 10, 'record.candidate.metadata.apiToken = "private"'),
          ],
        },
        'dataset'
      );
    } catch (error) {
      configurationFailure = error instanceof Error ? error : undefined;
    }
    assert.instanceOf(configurationFailure, AutomaticTransitionConfigurationError);
    assert.notInclude(configurationFailure?.message ?? '', 'apiToken');
    assert.notInclude(JSON.stringify(configurationFailure), 'private');

    const nonBoolean = resolveAutomaticTransitionPlan(
      { automaticTransitions: [transition('invalid-result', 'draft', 'review', 10, '"not-a-boolean"')] },
      'dataset'
    );
    let evaluationFailure: Error | undefined;
    try {
      await evaluateAutomaticTransitionPlan(
        nonBoolean,
        input('draft', { workflow: { stage: 'draft' }, metadata: { password: 'must-not-escape' } })
      );
    } catch (error) {
      evaluationFailure = error instanceof Error ? error : undefined;
    }
    assert.instanceOf(evaluationFailure, ManagedExpressionError);
    assert.notInclude(JSON.stringify(evaluationFailure), 'must-not-escape');
  });

  it('rejects proxy-backed configuration without invoking its traps', function () {
    let reads = 0;
    const hostile = new Proxy(
      {},
      {
        get: () => {
          reads += 1;
          return [];
        },
      }
    );

    assert.throws(() => resolveAutomaticTransitionPlan(hostile, 'dataset'), AutomaticTransitionConfigurationError);
    assert.equal(reads, 0);
  });

  it('migrates a legacy transition hook into a first-class edge without executing its function string', function () {
    const plan = resolveAutomaticTransitionPlan(
      {
        hooks: {
          onCreate: {
            pre: [
              {
                function: 'sails.services.triggerservice.transitionWorkflow',
                options: {
                  triggerCondition: "<%= record.workflow.stage == 'queued' %>",
                  targetWorkflowStageName: 'published',
                  targetWorkflowStageLabel: 'Published',
                  targetForm: 'dataset-1.0-published',
                },
              },
            ],
          },
        },
      },
      'dataset'
    );

    assert.lengthOf(plan.transitions, 1);
    assert.deepInclude(plan.transitions[0]?.definition, {
      id: 'legacy-onCreate-pre-0',
      mode: 'automatic',
      event: 'create',
      sourceStage: 'queued',
      targetStage: 'published',
      priority: 0,
      targetStageLabelCheck: 'Published',
      targetFormCheck: 'dataset-1.0-published',
    });
    assert.notInclude(JSON.stringify(plan), 'sails.services');
    assert.notInclude(JSON.stringify(plan), 'function');
  });

  it('characterizes the migrated embargo and publication examples as explicit edges', async function () {
    const dataPublication = developmentRecordTypes.dataPublication;
    assert.isDefined(dataPublication);
    assert.notInclude(JSON.stringify(dataPublication?.hooks), 'sails.services.triggerservice.transitionWorkflow');
    const plan = resolveAutomaticTransitionPlan(dataPublication ?? {}, 'dataPublication');

    assert.deepEqual(
      plan.transitions.map(transitionPlan => ({
        id: transitionPlan.definition.id,
        event: transitionPlan.definition.event,
        sourceStage: transitionPlan.definition.sourceStage,
        targetStage: transitionPlan.definition.targetStage,
        priority: transitionPlan.definition.priority,
      })),
      [
        {
          id: 'published-to-embargoed',
          event: 'update',
          sourceStage: 'published',
          targetStage: 'embargoed',
          priority: 0,
        },
        {
          id: 'queued-to-embargoed',
          event: 'create',
          sourceStage: 'queued',
          targetStage: 'embargoed',
          priority: 0,
        },
      ]
    );

    const queued = await evaluateAutomaticTransitionPlan(
      plan,
      input(
        'queued',
        {
          workflow: { stage: 'queued' },
          metadata: { embargoByDate: true },
        },
        'create'
      )
    );
    const published = await evaluateAutomaticTransitionPlan(
      plan,
      input('published', {
        workflow: { stage: 'published' },
        metadata: { embargoByDate: 'true' },
      })
    );

    assert.equal(queued?.definition.targetStage, 'embargoed');
    assert.equal(published?.definition.targetStage, 'embargoed');
  });
});
