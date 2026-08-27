import { expect } from 'chai';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

import {
  generateRecordSchemaRolloutEvidence,
  RecordSchemaRolloutEvidenceError,
  runRecordSchemaRolloutEvidence,
} from '../../../scripts/verify-record-schema-rollout';

function form(name: string, components: readonly unknown[]): FormConfigFrame {
  return {
    name,
    type: 'rollout-evidence-test',
    componentDefinitions: components,
  } as unknown as FormConfigFrame;
}

describe('record-schema shadow-rollout evidence command', function () {
  it('passes the approved bounded dev-hook report without enabling global enforcement', async function () {
    const report = await runRecordSchemaRolloutEvidence();

    expect(report.defaults).to.deep.equal({
      recordSchemaEnabled: false,
      recordValidationMode: 'shadow',
      unknownProperties: 'allow',
    });
    expect(report.shadowRun).to.deep.equal({
      recordSchemaEnabled: true,
      recordValidationMode: 'shadow',
      unknownProperties: 'allow',
    });
    expect(report.summary).to.deep.include({
      formsChecked: 8,
      schemasChecked: 16,
      unsupportedComponents: 0,
      legacyNullability: 0,
      unknownPropertyProbesAccepted: 16,
    });
    expect(report.limitHeadroom.cacheEntries.remaining).to.be.greaterThan(0);
    expect(report.limitHeadroom.maxDepth.remaining).to.be.greaterThan(0);
    expect(report.limitHeadroom.maxProperties.remaining).to.be.greaterThan(0);
    expect(report.limitHeadroom.maxDocumentBytes.remaining).to.be.greaterThan(0);
    expect(report.limitHeadroom.maxDiagnostics.remaining).to.be.greaterThan(0);
    expect(report.limitHeadroom.contributorTimeoutMs.breaches).to.equal(0);
    expect(report.schemas.every(schema => schema.unknownPropertyProbe === 'accepted')).to.equal(true);
    expect(report.schemas.every(schema => schema.shadowWarningCodes.includes('record-schema.type'))).to.equal(true);
  });

  it('reports unsupported components and legacy nullability without rejecting the partial form', async function () {
    const report = await generateRecordSchemaRolloutEvidence({
      forms: [
        {
          id: 'test/remediation-categories',
          form: form('remediation-categories', [
            {
              name: 'legacy_tree',
              component: { class: 'CheckboxTreeComponent', config: {} },
              model: { class: 'CheckboxTreeModel', config: {} },
            },
            {
              name: 'custom_value',
              module: '@test/custom-hook',
              component: { class: 'CustomHookComponent', config: {} },
              model: { class: 'CustomHookModel', config: {} },
            },
          ]),
        },
      ],
    });

    expect(report.summary).to.deep.include({
      formsChecked: 1,
      schemasChecked: 2,
      completeSchemas: 0,
      partialSchemas: 2,
      unsupportedComponents: 1,
      legacyNullability: 1,
      unknownPropertyProbesAccepted: 2,
    });
    expect(report.unsupportedComponents[0]).to.deep.include({
      form: 'test/remediation-categories',
      code: 'x-redbox-unsupported-component',
      pointer: '/custom_value',
      componentType: 'CustomHookComponent',
    });
    expect(report.unsupportedComponents[0].kinds).to.deep.equal(['create', 'update']);
    expect(report.legacyNullability[0]).to.deep.equal({
      form: 'test/remediation-categories',
      kinds: ['create', 'update'],
      pointer: '/legacy_tree',
      componentType: 'CheckboxTreeComponent',
    });
  });

  it('rejects an unbounded representative form set before compilation', async function () {
    const forms = Array.from({ length: 21 }, (_, index) => ({
      id: `test/form-${index}`,
      form: form(`form-${index}`, [
        {
          name: 'value',
          component: { class: 'SimpleInputComponent', config: {} },
          model: { class: 'SimpleInputModel', config: {} },
        },
      ]),
    }));

    let failure: unknown;
    try {
      await generateRecordSchemaRolloutEvidence({ forms });
    } catch (error) {
      failure = error;
    }
    expect(failure).to.be.instanceOf(RecordSchemaRolloutEvidenceError);
    expect(failure).to.deep.include({ code: 'record-schema-rollout.invalid-form-set' });
  });
});
