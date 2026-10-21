import assert from 'node:assert/strict';
import { publicationContentDigest } from '../../../src/services/publication/canonical';
import {
  publicationWorkflowSnapshot,
  publicationWorkflowContent,
  publicationWorkflowDecisionId,
  assertPublicationWorkflowDecision,
} from '../../../src/services/publication/workflow';
import type { PublicationWorkflowDecision } from '../../../src/services/publication/contracts';
import { isPublicationObject } from '../../../src/services/publication/builtins';

const before = {
  metadata: { title: 'Approved' },
  workflow: { stage: 'queued', stageLabel: 'Queued' },
  metaMetadata: { form: 'queued-form' },
};
const after = {
  ...before,
  workflow: { stage: 'published', stageLabel: 'Published' },
  metaMetadata: { form: 'published-form' },
};
function decision(): PublicationWorkflowDecision {
  const value: PublicationWorkflowDecision = {
    id: '',
    sourceRevision: 1,
    rule: {
      id: 'rule',
      version: 1,
      recordType: 'dataPublication',
      destinations: ['archive', 'repository'],
      completion: 'any',
      targetStage: 'published',
    },
    approvals: [
      { destinationId: 'archive', approvalId: 'approved', epoch: 1, generation: 2 },
      { destinationId: 'repository', approvalId: 'approved', epoch: 1, generation: 3 },
    ],
    status: 'stage_applied',
    startedAt: '2026-10-19T00:00:00Z',
    before: publicationWorkflowSnapshot(before, ['workflow', 'metaMetadata.form']),
    after: publicationWorkflowSnapshot(after, ['workflow', 'metaMetadata.form']),
  };
  value.id = publicationWorkflowDecisionId(value);
  return value;
}
describe('Publication workflow projection contracts (PUB-12)', () => {
  it('derives one identity from rule version, fixed approvals/generations and target, independent of worker order', () => {
    const value = decision();
    assertPublicationWorkflowDecision(value);
    assert.equal(publicationWorkflowDecisionId({ ...value, approvals: [...value.approvals].reverse() }), value.id);
    assert.notEqual(publicationWorkflowDecisionId({ ...value, rule: { ...value.rule, version: 2 } }), value.id);
    assert.notEqual(
      publicationWorkflowDecisionId({ ...value, approvals: [{ ...value.approvals[0], epoch: 2 }, value.approvals[1]] }),
      value.id
    );
    assert.notEqual(
      publicationWorkflowDecisionId({ ...value, rule: { ...value.rule, targetStage: 'other' } }),
      value.id
    );
  });
  it('normalizes only the full expected internal workflow/form projection', () => {
    assert.equal(
      publicationContentDigest(publicationWorkflowContent(after, decision())),
      publicationContentDigest(before)
    );
    const changed = { ...after, workflow: { ...after.workflow, stageLabel: 'Unapproved label' } };
    assert.deepEqual(publicationWorkflowContent(changed, decision()), changed);
  });
  it('retains hook changes to publication inputs while restoring the expected internal stage', () => {
    const changed = { ...after, metadata: { title: 'Hook edit' } };
    assert.notEqual(
      publicationContentDigest(publicationWorkflowContent(changed, decision())),
      publicationContentDigest(before)
    );
    const normalized = publicationWorkflowContent(changed, decision()).workflow;
    assert.ok(isPublicationObject(normalized));
    assert.equal(normalized.stage, 'queued');
  });
  it('refuses metadata output or attachment fields as workflow maintenance exemptions', () => {
    const value = decision();
    value.before['metadata.title'] = { present: true, value: 'Approved' };
    value.after['metadata.title'] = { present: true, value: 'Hook edit' };
    assert.throws(() => assertPublicationWorkflowDecision(value), /Invalid publication workflow/);
  });
  it('rejects a decision that silently shrinks an approved rule destination set', () => {
    const value = decision();
    value.approvals.pop();
    value.id = publicationWorkflowDecisionId(value);
    assert.throws(() => assertPublicationWorkflowDecision(value), /Invalid publication workflow/);
  });
  it('serializes BSON-compatible optional workflow values without granting arbitrary content exemptions', () => {
    assert.deepEqual(publicationWorkflowSnapshot({ workflow: { stage: 'queued', next: undefined } }, ['workflow']), {
      workflow: { present: true, value: { stage: 'queued', next: null } },
    });
  });
});
