import { expect } from 'chai';

import {
  mapAjvErrorsToRecordSchemaProblems,
  RecordSchemaValidationProblemMapperConfigurationError,
} from '../../../src/record-contract/ajv-error-mapper';

describe('AJV-like record-schema error mapping', function () {
  it('snapshots stable codes, nested pointers, escaped property tokens, and the generic fallback', function () {
    const result = mapAjvErrorsToRecordSchemaProblems(
      [
        {
          keyword: 'type',
          instancePath: '/metadata/contributors/0/display~1name',
          params: { type: 'string' },
        },
        { keyword: 'items', instancePath: '/metadata/contributors/1', params: { limit: 1 } },
        {
          keyword: 'enum',
          instancePath: '/metadata/status',
          params: { allowedValues: ['draft', 'submitted'] },
        },
        {
          keyword: 'additionalProperties',
          instancePath: '/metadata/group~1name',
          params: { additionalProperty: 'extra/value~key' },
        },
        {
          keyword: 'unevaluatedProperties',
          instancePath: '/metadata/group~1name',
          params: { unevaluatedProperty: 'unevaluated/value~key' },
        },
        {
          keyword: 'required',
          instancePath: '/metadata/group~1name',
          params: { missingProperty: 'required/value~key' },
        },
        { keyword: 'oneOf', instancePath: '/metadata/choice', params: { passingSchemas: null } },
      ],
      10
    );

    expect(result).to.deep.equal({
      problems: [
        {
          code: 'record-schema.type',
          pointer: '/metadata/contributors/0/display~1name',
          expected: { type: 'string' },
        },
        { code: 'record-schema.array-item', pointer: '/metadata/contributors/1' },
        { code: 'record-schema.enum', pointer: '/metadata/status' },
        {
          code: 'record-schema.additional-property',
          pointer: '/metadata/group~1name/extra~1value~0key',
        },
        {
          code: 'record-schema.additional-property',
          pointer: '/metadata/group~1name/unevaluated~1value~0key',
        },
        {
          code: 'record-schema.required',
          pointer: '/metadata/group~1name/required~1value~0key',
        },
        { code: 'record-schema.validation', pointer: '/metadata/choice' },
      ],
      truncated: false,
    });
  });

  it('maps the AJV false-schema array-item form without returning its schema path', function () {
    const result = mapAjvErrorsToRecordSchemaProblems(
      [
        {
          keyword: 'false schema',
          instancePath: '/metadata/tags/0',
          schemaPath: '#/properties/metadata/properties/tags/items/false schema',
          params: {},
        },
      ],
      10
    );

    expect(result.problems).to.deep.equal([{ code: 'record-schema.array-item', pointer: '/metadata/tags/0' }]);
    expect(JSON.stringify(result)).not.to.include('schemaPath').and.not.to.include('false schema');
  });

  it('returns only allowlisted expected-shape data and no raw AJV or submitted content', function () {
    const submittedSecret = 'submitted-value-secret';
    const schemaSecret = 'schema-fragment-secret';
    const oidSecret = 'oid-secret-123';
    const userSecret = 'private-user@example.test';
    const roleSecret = 'PrivateAdministrator';
    const result = mapAjvErrorsToRecordSchemaProblems(
      [
        {
          keyword: 'enum',
          instancePath: '/metadata/status',
          params: {
            allowedValues: [schemaSecret],
            submittedValue: submittedSecret,
            oid: oidSecret,
            user: userSecret,
            roles: [roleSecret],
          },
          message: `must equal ${submittedSecret}`,
          schema: { enum: [schemaSecret] },
          parentSchema: { description: schemaSecret },
          data: submittedSecret,
        },
        {
          keyword: 'type',
          instancePath: '/metadata/count',
          params: { type: 'integer', actual: submittedSecret, implementation: 'ajv-internal' },
          message: submittedSecret,
        },
      ],
      10
    );
    const serialized = JSON.stringify(result);

    expect(result.problems).to.deep.equal([
      { code: 'record-schema.enum', pointer: '/metadata/status' },
      { code: 'record-schema.type', pointer: '/metadata/count', expected: { type: 'integer' } },
    ]);
    for (const forbidden of [
      submittedSecret,
      schemaSecret,
      oidSecret,
      userSecret,
      roleSecret,
      'allowedValues',
      'message',
      'schemaPath',
      'implementation',
    ]) {
      expect(serialized).not.to.include(forbidden);
    }
  });

  it('bounds pointer-derived output even when error fields are oversized', function () {
    const oversized = 'x'.repeat(10_000);
    const result = mapAjvErrorsToRecordSchemaProblems(
      [
        { keyword: 'type', instancePath: `/${oversized}`, params: { type: 'string' } },
        { keyword: 'required', instancePath: '/safe', params: { missingProperty: oversized } },
      ],
      10
    );

    expect(result).to.deep.equal({
      problems: [
        { code: 'record-schema.type', pointer: '', expected: { type: 'string' } },
        { code: 'record-schema.required', pointer: '/safe' },
      ],
      truncated: false,
    });
    expect(JSON.stringify(result).length).to.be.lessThan(256);
  });

  it('preserves deterministic input order and reports truncation at the explicit diagnostic limit', function () {
    const errors = [
      { keyword: 'enum', instancePath: '/third', params: { allowedValues: ['secret'] } },
      { keyword: 'type', instancePath: '/first', params: { type: 'number' } },
      { keyword: 'required', instancePath: '', params: { missingProperty: 'second' } },
    ];
    const first = mapAjvErrorsToRecordSchemaProblems(errors, 2);
    const second = mapAjvErrorsToRecordSchemaProblems(errors, 2);

    expect(first).to.deep.equal({
      problems: [
        { code: 'record-schema.enum', pointer: '/third' },
        { code: 'record-schema.type', pointer: '/first', expected: { type: 'number' } },
      ],
      truncated: true,
    });
    expect(second).to.deep.equal(first);
    expect(Object.isFrozen(first)).to.equal(true);
    expect(Object.isFrozen(first.problems)).to.equal(true);
    expect(Object.isFrozen(first.problems[0])).to.equal(true);
    expect(Object.isFrozen(first.problems[1].expected)).to.equal(true);
    expect(() => JSON.stringify(first)).not.to.throw();
  });

  it('rejects an invalid max-diagnostics configuration without reading the error input', function () {
    const errors = new Proxy([], {
      getOwnPropertyDescriptor: () => {
        throw new Error('errors were read');
      },
    });

    for (const maximum of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => mapAjvErrorsToRecordSchemaProblems(errors, maximum)).to.throw(
        RecordSchemaValidationProblemMapperConfigurationError,
        'finite positive integer'
      );
    }
  });
});
