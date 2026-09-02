import { expect } from 'chai';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

import {
  RecordContractCoverageError,
  runRecordContractCoverage,
} from '../../../scripts/verify-record-contract-coverage';
import { recordSchema } from '../../../src/config/recordSchema.config';
import { createCoreRecordContractContributors } from '../../../src/record-contract/core-contributors';
import type { RecordContractComponentContributor } from '../../../src/record-contract/contributor-registry';

function coreRegistrations() {
  return createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' as const }));
}

function configuredForm(name: string, componentType: string): FormConfigFrame {
  return {
    name,
    type: 'coverage-test',
    componentDefinitions: [
      {
        name: 'value',
        component: { class: componentType, config: {} },
        model: { class: `${componentType}Model`, config: {} },
      },
    ],
  } as FormConfigFrame;
}

async function captureFailure(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('record-contract CI coverage command', function () {
  it('passes the approved offline configured-form contracts', async function () {
    const report = await runRecordContractCoverage();

    expect(report).to.deep.equal({
      formsChecked: 3,
      schemasChecked: 6,
      persistedCoreComponentsCovered: 18,
    });
  });

  it('fails safely when a persisted core component has no core contributor', async function () {
    const registrations = coreRegistrations().filter(
      registration => registration.contributor.componentType !== 'SimpleInputComponent'
    );
    const failure = await captureFailure(() => runRecordContractCoverage({ registrations }));

    expect(failure).to.be.instanceOf(RecordContractCoverageError);
    expect(failure).to.deep.include({
      code: 'record-contract-coverage.uncovered-persisted-component',
      target: 'SimpleInputComponent',
    });
    expect((failure as Error).message).to.equal('A persisted core component has no core record-contract contributor.');
  });

  it('fails safely when a generated schema does not satisfy the metaschema', async function () {
    const contributor: RecordContractComponentContributor = {
      kind: 'component',
      key: 'test.invalid-schema',
      version: '1',
      componentType: 'InvalidSchemaComponent',
      ownedPointers: [''],
      nullability: 'non-null',
      compile: () => ({
        kind: 'node',
        node: { kind: 'scalar', scalarType: 'string', nullable: false, enum: [] },
      }),
    };
    const failure = await captureFailure(() =>
      runRecordContractCoverage({
        forms: [{ id: 'test/invalid-schema', form: configuredForm('invalid-schema', contributor.componentType) }],
        registrations: [...coreRegistrations(), { contributor, source: 'hook', packageName: '@test/invalid-schema' }],
      })
    );

    expect(failure).to.be.instanceOf(RecordContractCoverageError);
    expect(failure).to.deep.include({
      code: 'record-contract-coverage.invalid-schema',
      target: 'test/invalid-schema:create',
    });
    expect((failure as Error).message).to.equal(
      'A generated record JSON Schema does not satisfy the configured schema contract.'
    );
  });

  it('fails when a previously unexercised persisted core contributor renders an invalid schema', async function () {
    const registrations = coreRegistrations().map(registration =>
      registration.contributor.componentType === 'CheckboxTreeComponent'
        ? {
            ...registration,
            contributor: {
              ...registration.contributor,
              compile: () => ({
                kind: 'node' as const,
                node: { kind: 'scalar' as const, scalarType: 'string' as const, nullable: false, enum: [] },
              }),
            },
          }
        : registration
    );
    const failure = await captureFailure(() => runRecordContractCoverage({ registrations }));

    expect(failure).to.be.instanceOf(RecordContractCoverageError);
    expect(failure).to.deep.include({
      code: 'record-contract-coverage.invalid-schema',
      target: 'core/persisted-contributors:create',
    });
  });

  it('fails safely when repeated compilation produces different canonical output', async function () {
    let invocation = 0;
    const contributor: RecordContractComponentContributor = {
      kind: 'component',
      key: 'test.nondeterministic-schema',
      version: '1',
      componentType: 'NondeterministicSchemaComponent',
      ownedPointers: [''],
      nullability: 'non-null',
      compile: () => ({
        kind: 'node',
        node: {
          kind: 'scalar',
          scalarType: 'string',
          nullable: false,
          annotations: { description: invocation++ % 2 === 0 ? 'first' : 'second' },
        },
      }),
    };
    const failure = await captureFailure(() =>
      runRecordContractCoverage({
        forms: [
          {
            id: 'test/nondeterministic-schema',
            form: configuredForm('nondeterministic-schema', contributor.componentType),
          },
        ],
        registrations: [
          ...coreRegistrations(),
          { contributor, source: 'hook', packageName: '@test/nondeterministic-schema' },
        ],
      })
    );

    expect(failure).to.be.instanceOf(RecordContractCoverageError);
    expect(failure).to.deep.include({
      code: 'record-contract-coverage.nondeterministic-output',
      target: 'test/nondeterministic-schema:create',
    });
    expect((failure as Error).message).to.equal(
      'Repeated compilation produced different canonical record JSON Schemas.'
    );
  });

  it('fails safely when the approved deterministic snapshot is stale', async function () {
    const failure = await captureFailure(() =>
      runRecordContractCoverage({ approvedSnapshot: { version: 1, schemas: [] } })
    );

    expect(failure).to.be.instanceOf(RecordContractCoverageError);
    expect(failure).to.deep.include({
      code: 'record-contract-coverage.stale-snapshot',
      target: 'record-contract-coverage.json',
    });
    expect((failure as Error).message).to.equal(
      'Generated record-contract output does not match the approved deterministic snapshot.'
    );
  });

  it('fails safely when a configured form exceeds a compiler limit', async function () {
    const form = configuredForm('limit-exceeded', 'SimpleInputComponent');
    form.componentDefinitions.push({
      name: 'second_value',
      component: { class: 'SimpleInputComponent', config: {} },
      model: { class: 'SimpleInputModel', config: {} },
    });
    const failure = await captureFailure(() =>
      runRecordContractCoverage({
        forms: [{ id: 'test/limit-exceeded', form }],
        limits: { ...recordSchema.limits, maxProperties: 1 },
      })
    );

    expect(failure).to.be.instanceOf(RecordContractCoverageError);
    expect(failure).to.deep.include({
      code: 'record-contract-coverage.compiler-limit-exceeded',
      target: 'test/limit-exceeded:create',
    });
    expect((failure as Error).message).to.equal('A configured form exceeds the record-contract compiler limits.');
  });
});
