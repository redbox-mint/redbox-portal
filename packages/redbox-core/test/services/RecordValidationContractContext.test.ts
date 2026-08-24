import { expect } from 'chai';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

import type {
  RecordValidationResult,
  ResolvedRecordValidationResult,
} from '../../src/services/RecordValidationService';
import { Services } from '../../src/services/RecordValidationService';
import { createRecordValidationFixture, validationForm } from '../fixtures/record-validation.fixtures';
import { createMockSails } from './testHelper';

function requireResolved(result: RecordValidationResult): ResolvedRecordValidationResult {
  expect(result.status, JSON.stringify(result.diagnostics)).to.equal('resolved');
  if (result.status !== 'resolved') throw new Error('Expected record validation resolution to succeed.');
  return result;
}

const candidateDependentBranch = {
  name: 'candidate-dependent-questions',
  component: {
    class: 'QuestionTreeComponent',
  },
} satisfies NonNullable<FormConfigFrame['componentDefinitions']>[number];

describe('RecordValidationService contract-context parity', function () {
  let priorSails: unknown;

  beforeEach(function () {
    priorSails = (global as Record<string, unknown>).sails;
    const sailsFixture = createMockSails();
    sailsFixture.config.recordValidation = {
      mode: 'enforce',
      timeoutMs: 5_000,
    };
    sailsFixture.config.recordSchema = {
      unknownProperties: 'allow',
    };
    (global as Record<string, unknown>).sails = sailsFixture;
  });

  afterEach(function () {
    if (priorSails === undefined) {
      delete (global as Record<string, unknown>).sails;
    } else {
      (global as Record<string, unknown>).sails = priorSails;
    }
  });

  it('selects the same create form, stage, operation, and mode as validation', async function () {
    const form = validationForm({ componentDefinitions: [candidateDependentBranch] });
    const fixture = createRecordValidationFixture({
      form,
      recordType: {
        id: 'record-type-1',
        name: 'dataset',
        recordValidation: { mode: 'enforce' },
        recordSchema: { unknownProperties: 'declared' },
      },
    });
    const service = new Services.RecordValidation(fixture.dependencies);
    const constructForm = fixture.dependencies.constructForm;
    fixture.dependencies.constructForm = async (sourceForm, metadata, reusableFormDefinitions) => {
      const constructedForm = await constructForm(sourceForm, metadata, reusableFormDefinitions);
      return { ...constructedForm, componentDefinitions: [] };
    };
    const validation = requireResolved(
      await service.resolve({
        ...fixture.request,
        writeKind: 'create',
        validationOperation: 'submit',
        evaluateFormValidators: false,
      })
    );
    const contract = await service.resolveContractContext({
      kind: 'create',
      brand: 'brand-1',
      portal: 'portal-1',
      recordType: 'dataset',
      operation: 'submit',
      actor: { authenticated: true, roles: ['Researcher'] },
    });

    expect(contract.publicContext).to.include({
      kind: 'create',
      form: validation.formName,
      workflowStep: validation.resolved.workflowStep,
      operation: validation.effectiveOperation,
      enforcement: validation.mode,
      unknownProperties: 'declared',
    });
    expect(validation.resolved.constructedForm.componentDefinitions).to.deep.equal([]);
    expect(contract.resolution.sourceForm.componentDefinitions).to.deep.equal([candidateDependentBranch]);
    expect(contract.resolution.sourceFormFingerprint).to.match(/^[a-f0-9]{64}$/);
    expect(contract.resolution).not.to.have.property('oid');
    expect(contract.publicContext).not.to.have.any.keys('actor', 'sourceForm', 'contextVariables');
  });

  it('selects the same candidate-owned update form, stage, operation, and mode as validation', async function () {
    const form = validationForm({
      name: 'alternate-7.1-edit',
      type: 'alternate',
      componentDefinitions: [candidateDependentBranch],
    });
    const fixture = createRecordValidationFixture({
      form,
      candidate: {
        metadata: { title: 'Candidate-specific title', activate: true },
        metaMetadata: {
          brandId: 'brand-2',
          type: 'alternate',
          form: 'alternate-7.1-edit',
        },
        workflow: { stage: 'review', stageLabel: 'Review' },
      },
      recordType: {
        id: 'alternate-type',
        name: 'alternate',
        recordValidation: { mode: 'enforce' },
      },
      workflowSteps: {
        review: {
          name: 'review',
          config: { form: 'alternate-7.1-edit', workflow: { stage: 'review' } },
        },
      },
    });
    const service = new Services.RecordValidation(fixture.dependencies);
    const validation = requireResolved(
      await service.resolve({
        ...fixture.request,
        validationOperation: 'submit',
        evaluateFormValidators: false,
      })
    );
    const contract = await service.resolveContractContext({
      kind: 'update',
      brand: 'brand-2',
      portal: 'portal-2',
      oid: 'oid-1',
      operation: 'submit',
      actor: { authenticated: true, roles: ['Researcher'] },
    });

    expect(contract.publicContext).to.include({
      kind: 'update',
      recordType: validation.resolved.recordType,
      form: validation.formName,
      workflowStep: validation.resolved.workflowStep,
      operation: validation.effectiveOperation,
      enforcement: validation.mode,
    });
    expect(contract.resolution.oid).to.equal('oid-1');
    expect(contract.resolution.existingRecord).to.deep.include({
      metadata: fixture.request.candidate.metadata,
      metaMetadata: fixture.request.candidate.metaMetadata,
    });
    expect(contract.resolution.sourceForm.componentDefinitions).to.deep.equal([candidateDependentBranch]);
    expect(fixture.calls.records).to.deep.equal(['oid-1']);
    expect(contract.publicContext).not.to.have.any.keys('oid', 'existingRecord', 'actor', 'sourceForm');
  });
});
