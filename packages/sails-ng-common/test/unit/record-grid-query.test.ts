import assert from 'node:assert/strict';
import { recordGridRequest } from '../../src/record-grid-query';

describe('shared visual grid query', () => {
  it('binds discovery revisions only when supplied', () => {
    const input = { recordType: 'rdmp', selections: [], filters: [], sort: [], first: 25, after: null };
    const result = recordGridRequest({ ...input, revision: 'catalogue-current' });
    assert.equal(result.variables.revision, 'catalogue-current');
    assert.match(result.query, /revision: \$revision/);
    assert.ok(!recordGridRequest(input).query.includes('$revision'));
  });
  it('includes the stable oid exactly once when the selected columns include it', () => {
    const result = recordGridRequest({
      recordType: 'rdmp',
      selections: [
        { selection: 'oid', responsePath: ['oid'] },
        { selection: 'oid', responsePath: ['oid'] },
        { selection: 'workflowStep', responsePath: ['workflowStep'] },
      ],
      filters: [],
      sort: [],
      first: 25,
      after: null,
    });
    assert.equal(result.query.match(/\boid\b/g)?.length, 1);
    assert.match(result.query, /workflowStep/);
    assert.equal(result.variables.type, 'rdmp');
  });
  it('keeps the mandatory oid and selected envelope order without an oid column', () => {
    const result = recordGridRequest({
      recordType: 'rdmp',
      selections: [
        { selection: 'workflowStep', responsePath: ['workflowStep'] },
        { selection: 'id: oid', responsePath: ['id'] },
      ],
      filters: [],
      sort: [],
      first: 25,
      after: null,
    });
    assert.match(result.query, /nodes \{ oid\s+workflowStep\s+id: oid/);
  });
});
