import assert from 'node:assert/strict';
import { recordGridRequest } from '../../src/record-grid-query';

describe('shared visual grid query', () => {
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
});
