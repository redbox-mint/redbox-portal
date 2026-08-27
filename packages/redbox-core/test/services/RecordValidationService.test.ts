import {
  ValidatorsSupport,
  formValidatorsSharedDefinitions,
  type FormConfigFrame,
  type FormValidatorSummaryErrors,
} from '@researchdatabox/sails-ng-common';
import { performance } from 'node:perf_hooks';
import type {
  RecordValidationRequest,
  RecordValidationResult,
  ResolvedRecordValidationResult,
} from '../../src/services/RecordValidationService';

const {
  clearCapturedOpenTelemetryMeasurements,
  getCapturedOpenTelemetryMeasurements,
} = require('../setup') as typeof import('../setup');
const { ServiceExports } = require('../../src/services') as typeof import('../../src/services');
const {
  RECORD_VALIDATION_DIAGNOSTIC_CODES,
  resolveValidationMode,
  Services,
} = require('../../src/services/RecordValidationService') as
  typeof import('../../src/services/RecordValidationService');
const { createRecordValidationFixture, validationForm } = require('../fixtures/record-validation.fixtures') as
  typeof import('../fixtures/record-validation.fixtures');
const { createMockSails } = require('./testHelper') as typeof import('./testHelper');
const { Services: DomSanitizerServices } = require('../../src/services/DomSanitizerService') as
  typeof import('../../src/services/DomSanitizerService');

let expect: Chai.ExpectStatic;

function configure(mode: 'shadow' | 'enforce' = 'shadow', operations?: Record<string, unknown>): void {
  (global as unknown as { sails: { config: Record<string, unknown> } }).sails.config.recordValidation = {
    mode,
    timeoutMs: 5_000,
    allowedRequestParameters: ['locale', 'nested'],
    ...(operations ? { operations } : {}),
  };
}

function requireResolved(result: RecordValidationResult): ResolvedRecordValidationResult {
  expect(result.status, JSON.stringify(result.diagnostics)).to.equal('resolved');
  if (result.status !== 'resolved') throw new Error('Expected record validation resolution to succeed.');
  return result;
}

function codes(result: { diagnostics: readonly { code: string }[] }): string[] {
  return result.diagnostics.map(item => item.code);
}

function suggestedSummary(groups: unknown): Record<string, unknown> {
  return {
    name: 'suggestions',
    component: {
      class: 'SuggestedValidationSummaryComponent',
      config: { enabledValidationGroups: groups },
    },
  };
}

function validatorSummary(overrides: Partial<FormValidatorSummaryErrors> = {}): FormValidatorSummaryErrors {
  return {
    id: 'contributors',
    message: '@field-contributors',
    errors: [
      {
        class: 'required',
        message: '@validator-error-required',
        params: { minimum: 1, actual: { private: 'raw-value' } as never },
        targetField: { angularComponents: ['contributors', 0, 'name'] },
      },
    ],
    lineagePaths: {
      formConfig: ['componentDefinitions', 2, 'component', 'config', 'elementTemplate'],
      dataModel: ['contributors', 0, 'name'],
      angularComponents: ['contributors', 0, 'name'],
      angularComponentsJsonPointer: '/contributors/0/name',
      layout: ['contributors-layout', 0, 'name-layout'],
      layoutJsonPointer: '/contributors-layout/0/name-layout',
    },
    ...overrides,
  };
}

function validatorExecution(summaries: readonly FormValidatorSummaryErrors[] = []) {
  return { summaries, transformations: [] };
}

function richHtmlTransformation(
  sourceValue: string,
  value: string,
  dataModelPath: readonly (string | number)[] = ['description']
) {
  return {
    kind: 'rich-html-sanitized' as const,
    dataModelPath,
    sourceValue,
    value,
    advisorySummary: validatorSummary({
      id: String(dataModelPath[dataModelPath.length - 1] ?? 'richText'),
      errors: [{ class: 'htmlSanitized', message: '@validator-warning-html-sanitized', params: {} }],
    }),
  };
}

describe('RecordValidationService', function () {
  let priorSails: unknown;
  let priorDomSanitizerService: unknown;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  beforeEach(function () {
    clearCapturedOpenTelemetryMeasurements();
    priorSails = (global as Record<string, unknown>).sails;
    priorDomSanitizerService = (global as Record<string, unknown>).DomSanitizerService;
    (global as Record<string, unknown>).sails = createMockSails();
    (global as Record<string, unknown>).DomSanitizerService = new DomSanitizerServices.DomSanitizer();
    (global as unknown as { sails: { config: Record<string, unknown> } }).sails.config.dompurify = {
      profiles: {
        html: { USE_PROFILES: { html: true } },
        svg: { USE_PROFILES: { svg: true } },
      },
      defaultProfile: 'html',
    };
    configure();
  });

  afterEach(function () {
    if (priorSails === undefined) {
      delete (global as Record<string, unknown>).sails;
    } else {
      (global as Record<string, unknown>).sails = priorSails;
    }
    if (priorDomSanitizerService === undefined) {
      delete (global as Record<string, unknown>).DomSanitizerService;
    } else {
      (global as Record<string, unknown>).DomSanitizerService = priorDomSanitizerService;
    }
  });

  it('is registered through the core service export convention', function () {
    expect(ServiceExports).to.have.property('RecordValidationService');
    expect(ServiceExports.RecordValidationService).to.have.property('resolve').that.is.a('function');
    expect(ServiceExports.RecordValidationService).to.have.property('resolveContractContext').that.is.a('function');
    expect(ServiceExports.RecordValidationService).to.have.property('discoverOperations').that.is.a('function');
    expect(ServiceExports.RecordValidationService).to.have.property('registerMetricsHooks').that.is.a('function');
  });

  it('uses an isolated Sails fixture without mutating a suite-global config stub', function () {
    expect((global as Record<string, unknown>).sails).not.to.equal(priorSails);
    if (priorSails && typeof priorSails === 'object' && 'config' in priorSails) {
      const priorConfig = (priorSails as { config?: Record<string, unknown> }).config;
      expect(priorConfig?.recordValidation).not.to.equal(
        (global as unknown as { sails: { config: Record<string, unknown> } }).sails.config.recordValidation
      );
    }
  });

  it('resolves rollout precedence in one pure helper', function () {
    expect(
      resolveValidationMode(
        { mode: 'enforce', operations: { submit: { mode: 'shadow' } } },
        { mode: 'enforce', operations: { submit: { mode: 'shadow' } } },
        'submit'
      )
    ).to.deep.equal({ mode: 'shadow', malformedModeCount: 0 });

    expect(resolveValidationMode({ mode: 'invalid' } as never, { mode: 'also-invalid' } as never)).to.deep.equal({
      mode: 'shadow',
      malformedModeCount: 2,
    });
  });

  it('preserves safe malformed-mode diagnostics while using the shared resolver', async function () {
    (global as any).sails.config.recordValidation = {
      mode: 'invalid-global',
      timeoutMs: 5_000,
      operations: { submit: { mode: 'enforce' } },
    };
    const fixture = createRecordValidationFixture({
      recordType: {
        id: 'record-type-1',
        name: 'dataset',
        recordValidation: {
          mode: 'invalid-record-type',
          operations: { submit: { mode: 'shadow' } },
        },
      } as never,
    });
    const result = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'submit',
    });

    expect(result.mode).to.equal('shadow');
    expect(
      codes(result).filter(code => code === RECORD_VALIDATION_DIAGNOSTIC_CODES.rolloutModeMalformed)
    ).to.have.length(2);
  });

  it('resolves the exact starting workflow form for create', async function () {
    const fixture = createRecordValidationFixture();
    const service = new Services.RecordValidation(fixture.dependencies, fixture.metrics);
    const result = await service.resolve({ ...fixture.request, writeKind: 'create' });

    expect(result.status).to.equal('resolved');
    expect(result).to.have.property('blockingErrors').that.deep.equals([]);
    expect(result).to.have.property('advisoryErrors').that.deep.equals([]);
    expect(result.formName).to.equal('dataset-2.4-draft');
    expect(fixture.calls.startingSteps).to.equal(1);
    expect(fixture.calls.forms).to.deep.equal([{ formName: 'dataset-2.4-draft', brand: 'brand-1' }]);
  });

  it('treats a null record-type schema attribute as an unset override', async function () {
    (global as unknown as { sails: { config: Record<string, unknown> } }).sails.config.recordSchema = {
      unknownProperties: 'allow',
    };
    const fixture = createRecordValidationFixture({
      recordType: { id: 'record-type-1', name: 'dataset', recordSchema: null },
    });
    const context = await new Services.RecordValidation(fixture.dependencies).resolveContractContext({
      kind: 'create',
      brand: 'brand-1',
      portal: 'portal',
      recordType: 'dataset',
      targetStep: 'draft',
      actor: { authenticated: true, roles: ['Researcher'] },
    });

    expect(context.publicContext.unknownProperties).to.equal('allow');
  });

  it('resolves a requested create target independently of the operation', async function () {
    const targetForm = validationForm({ name: 'dataset-2.4-review' });
    const fixture = createRecordValidationFixture({ form: targetForm });
    const service = new Services.RecordValidation(fixture.dependencies);
    const result = await service.resolve({ ...fixture.request, writeKind: 'create', targetStep: 'review' });

    expect(result.status).to.equal('resolved');
    expect(result.formName).to.equal('dataset-2.4-review');
    expect(result.effectiveOperation).to.equal(undefined);
    expect(fixture.calls.workflowSteps).to.deep.equal(['review']);
    expect(fixture.calls.startingSteps).to.equal(0);
  });

  it('uses the candidate form, brand, and type for updates including candidate changes', async function () {
    const changedForm = validationForm({ name: 'alternate-7.1-edit', type: 'alternate' });
    const fixture = createRecordValidationFixture({
      form: changedForm,
      candidate: {
        metaMetadata: { brandId: 'brand-2', type: 'alternate', form: 'alternate-7.1-edit' },
      },
      recordType: { id: 'alternate-type', name: 'alternate' },
    });
    const result = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);

    expect(result.status).to.equal('resolved');
    expect(fixture.calls.recordTypes).to.deep.equal([{ brand: 'brand-2', recordType: 'alternate' }]);
    expect(fixture.calls.forms).to.deep.equal([{ formName: 'alternate-7.1-edit', brand: 'brand-2' }]);
  });

  it('uses the exact target-step form for transitions instead of the candidate form', async function () {
    const targetForm = validationForm({ name: 'dataset-2.4-published' });
    const fixture = createRecordValidationFixture({ form: targetForm });
    const result = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      writeKind: 'transition',
      targetStep: 'published',
    });

    expect(result.status).to.equal('resolved');
    expect(result.formName).to.equal('dataset-2.4-published');
    expect(fixture.calls.forms).to.deep.equal([{ formName: 'dataset-2.4-published', brand: 'brand-1' }]);
  });

  it('diagnoses missing, blank, malformed, or changed workflow-candidate form references', async function () {
    configure('enforce');
    for (const candidateForm of [undefined, '', '../malformed-form', 'hook-selected-form']) {
      const targetForm = validationForm({ name: 'dataset-2.4-published' });
      const fixture = createRecordValidationFixture({
        form: targetForm,
        candidate: {
          metaMetadata: {
            brandId: 'brand-1',
            type: 'dataset',
            ...(candidateForm === undefined ? {} : { form: candidateForm }),
          },
        },
      });
      const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve({
        ...fixture.request,
        writeKind: 'transition',
        targetStep: 'published',
      }));
      expect(result.shouldBlock).to.equal(true);
      expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceDivergence);
      expect(result.formName).to.equal('dataset-2.4-published');
    }
  });

  it('preserves version-in-name identity and never requests a fallback form', async function () {
    const fixture = createRecordValidationFixture();
    fixture.dependencies.loadForm = async (formName, brand) => {
      fixture.calls.forms.push({ formName, brand });
      return null;
    };
    const result = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);

    expect(result.status).to.equal('unresolved');
    expect(fixture.calls.forms).to.deep.equal([{ formName: 'dataset-2.4-draft', brand: 'brand-1' }]);
    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.formNotFound);
  });

  it('blocks missing, malformed, and unresolved form references only in enforce mode', async function () {
    configure('enforce');
    const missing = createRecordValidationFixture({
      candidate: { metaMetadata: { brandId: 'brand-1', type: 'dataset' } },
    });
    const missingResult = await new Services.RecordValidation(missing.dependencies).resolve(missing.request);
    expect(missingResult.shouldBlock).to.equal(true);
    expect(codes(missingResult)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceMissing);

    configure('shadow');
    const malformed = createRecordValidationFixture({
      candidate: { metaMetadata: { brandId: 'brand-1', type: 'dataset', form: '../secret' } },
    });
    const malformedResult = await new Services.RecordValidation(malformed.dependencies).resolve(malformed.request);
    expect(malformedResult.shouldBlock).to.equal(false);
    expect(codes(malformedResult)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceMalformed);

    configure('enforce');
    const enforceMalformed = createRecordValidationFixture({
      candidate: { metaMetadata: { brandId: 'brand-1', type: 'dataset', form: '../secret' } },
    });
    const enforceMalformedResult = await new Services.RecordValidation(enforceMalformed.dependencies).resolve(
      enforceMalformed.request
    );
    expect(enforceMalformedResult.status).to.equal('unresolved');
    expect(enforceMalformedResult.shouldBlock).to.equal(true);
    expect(codes(enforceMalformedResult)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceMalformed);
  });

  it('diagnoses missing or malformed candidate brand/type before doing any lookup', async function () {
    const missing = createRecordValidationFixture({
      candidate: { metaMetadata: { form: 'dataset-2.4-draft' } },
    });
    const missingResult = await new Services.RecordValidation(missing.dependencies).resolve(missing.request);
    expect(codes(missingResult)).to.include.members([
      RECORD_VALIDATION_DIAGNOSTIC_CODES.brandReferenceMissing,
      RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeReferenceMissing,
    ]);
    expect(missing.calls.recordTypes).to.deep.equal([]);

    const malformed = createRecordValidationFixture({
      candidate: {
        metaMetadata: { brandId: '../brand', type: 'bad type', form: 'dataset-2.4-draft' },
      },
    });
    const malformedResult = await new Services.RecordValidation(malformed.dependencies).resolve(malformed.request);
    expect(codes(malformedResult)).to.include.members([
      RECORD_VALIDATION_DIAGNOSTIC_CODES.brandReferenceMalformed,
      RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeReferenceMalformed,
    ]);
  });

  it('uses configured record-type enforce mode when runtime record-type resolution fails', async function () {
    (global as any).sails.config.recordtype = {
      dataset: { recordValidation: { mode: 'enforce' } },
    };
    const fixture = createRecordValidationFixture({ recordType: null });
    const result = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);
    expect(result).to.deep.include({ status: 'unresolved', mode: 'enforce', shouldBlock: true });
    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeNotFound);
  });

  it('keeps malformed stored current-step references mode-aware so shadow records remain repairable', async function () {
    const shadowFixture = createRecordValidationFixture();
    const shadow = requireResolved(await new Services.RecordValidation(shadowFixture.dependencies).resolve({
      ...shadowFixture.request,
      currentStep: '../legacy-bad-step',
    }));
    expect(codes(shadow)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed);
    expect(shadow.shouldBlock).to.equal(false);

    configure('enforce');
    const enforceFixture = createRecordValidationFixture();
    const enforce = requireResolved(await new Services.RecordValidation(enforceFixture.dependencies).resolve({
      ...enforceFixture.request,
      currentStep: '../legacy-bad-step',
    }));
    expect(enforce.shouldBlock).to.equal(false);
    expect(
      enforce.diagnostics.find(item => item.code === RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed)
    ).to.have.property('severity', 'warning');

    const namedOperation = requireResolved(await new Services.RecordValidation(enforceFixture.dependencies).resolve({
      ...enforceFixture.request,
      currentStep: '../legacy-bad-step',
      validationOperation: 'submit',
    }));
    expect(namedOperation.shouldBlock).to.equal(true);
    expect(
      namedOperation.diagnostics.find(item => item.code === RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed)
    ).to.have.property('severity', 'error');
  });

  it('diagnoses missing target workflows and missing/malformed step form references', async function () {
    const absent = createRecordValidationFixture({ workflowSteps: { absent: null } });
    const absentResult = await new Services.RecordValidation(absent.dependencies).resolve({
      ...absent.request,
      writeKind: 'transition',
      targetStep: 'absent',
    });
    expect(codes(absentResult)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound);

    const missingForm = createRecordValidationFixture({
      workflowSteps: { review: { name: 'review', config: {} } },
    });
    const missingFormResult = await new Services.RecordValidation(missingForm.dependencies).resolve({
      ...missingForm.request,
      writeKind: 'transition',
      targetStep: 'review',
    });
    expect(codes(missingFormResult)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepFormMissing);

    const malformedForm = createRecordValidationFixture({
      workflowSteps: { review: { name: 'review', config: { form: '../fallback' } } },
    });
    const malformedFormResult = await new Services.RecordValidation(malformedForm.dependencies).resolve({
      ...malformedForm.request,
      writeKind: 'transition',
      targetStep: 'review',
    });
    expect(codes(malformedFormResult)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceMalformed);
    expect(malformedForm.calls.forms).to.deep.equal([]);
  });

  it('continues update form resolution when an irrelevant current-stage policy cannot resolve', async function () {
    configure('enforce');
    const fixture = createRecordValidationFixture({ workflowSteps: { draft: null } });
    const result = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);
    expect(result.status).to.equal('resolved');
    expect(result.shouldBlock).to.equal(false);
    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound);
    expect(
      result.diagnostics.find(item => item.code === RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound)
    ).to.have.property('severity', 'warning');
    expect(fixture.calls.forms).to.deep.equal([{ formName: 'dataset-2.4-draft', brand: 'brand-1' }]);

    const operationFixture = createRecordValidationFixture({ workflowSteps: { draft: null } });
    const operationResult = await new Services.RecordValidation(operationFixture.dependencies).resolve({
      ...operationFixture.request,
      validationOperation: 'submit',
    });
    expect(operationResult.status).to.equal('resolved');
    expect(operationResult.shouldBlock).to.equal(true);
    expect(requireResolved(operationResult).effectiveGroups).to.deep.equal(['submit']);
    expect(operationFixture.calls.validatorGroups).to.deep.equal([['submit']]);
  });

  it('keeps named-operation policy authoritative when the final stage is absent or malformed', async function () {
    for (const stage of [undefined, '../malformed-stage'] as const) {
      configure('shadow');
      const shadowFixture = createRecordValidationFixture({
        candidate: { workflow: stage === undefined ? {} : { stage } },
      });
      const shadow = requireResolved(await new Services.RecordValidation(shadowFixture.dependencies).resolve({
        ...shadowFixture.request,
        validationOperation: 'submit',
      }));
      expect(shadow.shouldBlock).to.equal(false);
      expect(shadow.effectiveGroups).to.deep.equal(['submit']);
      expect(shadowFixture.calls.validatorGroups).to.deep.equal([['submit']]);
      expect(codes(shadow)).to.include(
        stage === undefined
          ? RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMissing
          : RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed
      );

      configure('enforce');
      const enforceFixture = createRecordValidationFixture({
        candidate: { workflow: stage === undefined ? {} : { stage } },
      });
      const enforce = requireResolved(await new Services.RecordValidation(enforceFixture.dependencies).resolve({
        ...enforceFixture.request,
        validationOperation: 'submit',
      }));
      expect(enforce.shouldBlock).to.equal(true);
      expect(enforce.effectiveGroups).to.deep.equal(['submit']);
    }
  });

  it('classifies missing and unconstructable exact form configuration safely', async function () {
    configure('enforce');
    const fixture = createRecordValidationFixture();
    fixture.dependencies.loadForm = async () =>
      ({ id: 'form-1', name: 'dataset-2.4-draft', branding: 'brand-1' }) as never;
    const missingConfig = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);
    expect(missingConfig.shouldBlock).to.equal(true);
    expect(codes(missingConfig)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.formConfigurationMissing);

    configure('shadow');
    const broken = createRecordValidationFixture();
    broken.dependencies.constructForm = async () => {
      throw new Error('secret compiler exception');
    };
    const brokenResult = await new Services.RecordValidation(broken.dependencies).resolve(broken.request);
    expect(brokenResult.shouldBlock).to.equal(false);
    expect(codes(brokenResult)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.formConfigurationMalformed);
    expect(JSON.stringify(brokenResult)).not.to.contain('secret compiler exception');
  });

  it('converts dependency failures into one safe mode-aware unresolved result', async function () {
    const shadow = createRecordValidationFixture();
    shadow.dependencies.loadForm = async () => {
      throw new Error('mongo timeout: connection refused to 10.0.0.5');
    };
    const shadowResult = await new Services.RecordValidation(shadow.dependencies, shadow.metrics).resolve(
      shadow.request
    );
    expect(shadowResult).to.deep.include({ status: 'unresolved', shouldBlock: false });
    expect(codes(shadowResult)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.resolutionFailed);
    expect(shadow.metricEvents).to.have.length(1);
    expect(JSON.stringify(shadowResult)).not.to.match(/mongo|10\.0\.0\.5|connection refused/);
    const resolutionLog = (global as any).sails.log.warn.args
      .map((args: unknown[]) => String(args[0] ?? ''))
      .find((message: string) => message.includes('Record validation resolution could not be completed'));
    expect(resolutionLog).to.include('errorType=Error');
    expect(resolutionLog).not.to.match(/mongo|10\.0\.0\.5|connection refused/);

    configure('enforce');
    const enforce = createRecordValidationFixture();
    enforce.dependencies.loadForm = shadow.dependencies.loadForm;
    const enforceResult = await new Services.RecordValidation(enforce.dependencies, enforce.metrics).resolve(
      enforce.request
    );
    expect(enforceResult).to.deep.include({ status: 'unresolved', shouldBlock: true });
    expect(enforce.metricEvents).to.have.length(1);
  });

  it('projects non-cloneable metadata to a JSON-like expression context', async function () {
    const metadata = { title: 'Final title', hookValue: () => 'not-cloneable' };
    const fixture = createRecordValidationFixture({ candidate: { metadata } });
    const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request));
    expect(result.shouldBlock).to.equal(false);
    expect(result.resolved.expressionContext?.formData).to.deep.equal({ title: 'Final title' });
    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionContextUnsupported);
  });

  it('passes configured reusable form definitions to the production form constructor', async function () {
    const form = validationForm({
      componentDefinitions: [
        {
          name: 'shared-validation',
          component: { class: 'ReusableComponent', config: { componentDefinitions: [] } },
          overrides: { reusableFormName: 'shared-validation-fields' },
        } as never,
      ],
    });
    const fixture = createRecordValidationFixture({ form });
    const { constructForm: _fixtureConstructor, ...productionConstructorDependencies } = fixture.dependencies;
    (global as unknown as { sails: { config: Record<string, unknown> } }).sails.config.reusableFormDefinitions = {
      'shared-validation-fields': [
        {
          name: 'expanded-validator-field',
          component: { class: 'SimpleInputComponent' },
          expressions: [
            {
              name: 'expanded-group-expression',
              config: {
                target: 'form.enabledValidationGroups',
                conditionKind: 'jsonata',
                condition: 'formData.activate',
                template: '{"groups":{"include":["conditional"]}}',
              },
            },
          ],
        },
      ],
    };

    const result = await new Services.RecordValidation(productionConstructorDependencies).resolve(fixture.request);
    const resolved = requireResolved(result);
    expect(JSON.stringify(resolved.resolved.constructedForm)).to.contain('expanded-validator-field');
    expect(resolved.resolved.conditionalGroups).to.deep.equal(['base', 'conditional']);
    expect(resolved.effectiveGroups).to.deep.equal([]);
  });

  it('rejects malformed operation syntax without echoing the supplied value', async function () {
    const fixture = createRecordValidationFixture();
    const result = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'bad operation secret',
    });

    expect(result.shouldBlock).to.equal(true);
    expect(result.status).to.equal('unresolved');
    expect(codes(result)).to.deep.equal([RECORD_VALIDATION_DIAGNOSTIC_CODES.operationMalformed]);
    expect(JSON.stringify(result.diagnostics)).not.to.contain('bad operation secret');
  });

  it('trims safe case-sensitive operation names and rejects unknown names even in shadow', async function () {
    const fixture = createRecordValidationFixture();
    const known = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: ' submit ',
      targetStep: 'review',
    });
    expect(known.effectiveOperation).to.equal('submit');
    expect(known.shouldBlock).to.equal(false);

    const unknown = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'Submit',
    });
    expect(unknown.shouldBlock).to.equal(true);
    expect(codes(unknown)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationUnknown);

    const prototypeName = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'constructor',
    });
    expect(prototypeName.shouldBlock).to.equal(true);
    expect(codes(prototypeName)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationUnknown);
  });

  it('applies replacement, intersection, and operation mode precedence without a stage mode layer', async function () {
    configure('enforce', { submit: { mode: 'enforce' } });
    const form = validationForm();
    const fixture = createRecordValidationFixture({
      form,
      recordType: {
        id: 'record-type-1',
        name: 'dataset',
        recordValidation: {
          mode: 'shadow',
          operations: {
            submit: {
              mode: 'shadow',
              enabledValidationGroups: ['conditional'],
              roles: ['Librarian', 'Admin'],
              allowedTargetSteps: ['published', 'archived'],
            },
          },
        },
      },
      workflowSteps: {
        published: {
          name: 'published',
          config: {
            form: 'dataset-2.4-draft',
            recordValidation: {
              operations: {
                submit: {
                  mode: 'enforce', // malformed runtime input is ignored; the type disallows it
                  enabledValidationGroups: ['stage'],
                  roles: ['Librarian'],
                  allowedTargetSteps: ['published'],
                },
              },
            },
          },
        },
      },
    });
    const result = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      writeKind: 'transition',
      validationOperation: 'submit',
      targetStep: 'published',
      actor: { authenticated: true, roles: ['Librarian'] },
    });

    expect(result.mode).to.equal('shadow');
    const resolved = requireResolved(result);
    expect(resolved.effectiveGroups).to.deep.equal(['stage']);
    expect(resolved.resolved.operationPolicy?.roles).to.deep.equal(['Librarian']);
    expect(resolved.resolved.operationPolicy?.allowedTargetSteps).to.deep.equal(['published']);
  });

  it('lets an explicit record-type mode override the less-specific global operation mode', async function () {
    configure('shadow', { submit: { mode: 'shadow' } });
    const fixture = createRecordValidationFixture({
      recordType: { id: 'record-type-1', name: 'dataset', recordValidation: { mode: 'enforce' } },
    });
    const result = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'submit',
    });
    expect(result.mode).to.equal('enforce');
  });

  it('returns stable role and target authorization diagnostics', async function () {
    const fixture = createRecordValidationFixture();
    const noMovement = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'submit',
    });
    expect(noMovement.status).to.equal('resolved');
    expect(noMovement.shouldBlock).to.equal(false);

    const roleFailure = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'submit',
      targetStep: 'review',
      actor: { authenticated: true, roles: ['Guest'] },
    });
    expect(roleFailure.shouldBlock).to.equal(true);
    expect(codes(roleFailure)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationRoleUnauthorized);

    const targetFailure = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'submit',
      targetStep: 'archived',
    });
    expect(targetFailure.shouldBlock).to.equal(true);
    expect(codes(targetFailure)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationTargetUnauthorized);
  });

  it('resolves and authorizes supplied operations without evaluating form validators when requested', async function () {
    for (const mode of ['shadow', 'enforce'] as const) {
      configure(mode);
      const authorizedFixture = createRecordValidationFixture();
      const authorized = await new Services.RecordValidation(authorizedFixture.dependencies).resolve({
        ...authorizedFixture.request,
        validationOperation: 'submit',
        evaluateFormValidators: false,
      });

      expect(authorized).to.deep.include({ status: 'resolved', shouldBlock: false, mode });
      expect(authorizedFixture.calls.validatorGroups).to.deep.equal([]);

      const unknownFixture = createRecordValidationFixture();
      const unknown = await new Services.RecordValidation(unknownFixture.dependencies).resolve({
        ...unknownFixture.request,
        validationOperation: 'missing-operation',
        evaluateFormValidators: false,
      });
      expect(unknown.shouldBlock).to.equal(true);
      expect(codes(unknown)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationUnknown);
      expect(unknownFixture.calls.validatorGroups).to.deep.equal([]);

      const unauthorizedFixture = createRecordValidationFixture();
      const unauthorized = await new Services.RecordValidation(unauthorizedFixture.dependencies).resolve({
        ...unauthorizedFixture.request,
        validationOperation: 'submit',
        evaluateFormValidators: false,
        actor: { authenticated: true, roles: ['Guest'] },
      });
      expect(unauthorized.shouldBlock).to.equal(true);
      expect(codes(unauthorized)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationRoleUnauthorized);
      expect(unauthorizedFixture.calls.validatorGroups).to.deep.equal([]);
    }
  });

  it('does not project expression context when form validators are disabled', async function () {
    configure('enforce');
    const metadata: Record<string, unknown> = { title: 'unchanged' };
    metadata.cycle = metadata;
    const fixture = createRecordValidationFixture({ candidate: { metadata } });

    const result = requireResolved(
      await new Services.RecordValidation(fixture.dependencies).resolve({
        ...fixture.request,
        validationOperation: 'submit',
        evaluateFormValidators: false,
      })
    );

    expect(result.shouldBlock).to.equal(false);
    expect(result.resolved).not.to.have.property('expressionContext');
    expect(codes(result)).not.to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionContextUnsupported);
    expect(fixture.calls.validatorGroups).to.deep.equal([]);
  });

  it('discovers deterministic, authorization-filtered operation metadata without policy leaks', async function () {
    const form = validationForm({
      validationOperations: {
        publish: {
          enabledValidationGroups: ['submit'],
          label: ' Publish ',
          description: 'Publish this record',
          roles: ['Librarian'],
          allowedTargetSteps: ['published', 'private-stage'],
        },
        draft: {
          enabledValidationGroups: ['base'],
          label: 'Save draft',
          roles: ['Researcher', 'Librarian'],
        },
        hidden: {
          enabledValidationGroups: ['all'],
          roles: ['Admin'],
        },
        'bad operation': {
          enabledValidationGroups: ['all'],
        },
      },
    });
    Object.assign(form.validationOperations!.publish, { exceptionText: 'database password' });
    const fixture = createRecordValidationFixture({
      form,
      workflowSteps: {
        archived: { name: 'archived', config: { form: 'dataset-2.4-archived' } },
      },
    });
    fixture.dependencies.loadForm = async (formName, brand) => {
      fixture.calls.forms.push({ formName, brand });
      return {
        id: `form-${formName}`,
        name: formName,
        branding: brand,
        configuration: { ...form, name: formName },
      } as never;
    };
    const service = new Services.RecordValidation(fixture.dependencies);
    const operations = await service.discoverOperations({
      candidate: fixture.request.candidate,
      writeKind: 'update',
      actor: { authenticated: true, roles: ['Librarian'] },
      canEdit: true,
      authorizedTargetSteps: ['archived', 'published'],
    });

    expect(operations).to.deep.equal([
      { name: 'draft', label: 'Save draft', allowedTargetSteps: ['archived', 'published'] },
      {
        name: 'publish',
        label: 'Publish',
        description: 'Publish this record',
        allowedTargetSteps: ['published'],
      },
    ]);
    const transported = JSON.stringify(operations);
    for (const forbidden of [
      'roles',
      'enabledValidationGroups',
      'exceptionText',
      'database password',
      'validators',
    ]) {
      expect(transported).not.to.include(forbidden);
    }
    expect(fixture.calls.validatorGroups).to.deep.equal([]);
  });

  it('falls back once for a hidden current workflow step omitted from the bulk list', async function () {
    const fixture = createRecordValidationFixture();
    const loadWorkflowSteps = fixture.dependencies.loadWorkflowSteps;
    fixture.dependencies.loadWorkflowSteps = async recordType =>
      (await loadWorkflowSteps(recordType)).filter(step => step.name !== 'draft');

    const operations = await new Services.RecordValidation(fixture.dependencies).discoverOperations({
      candidate: fixture.request.candidate,
      writeKind: 'update',
      actor: { authenticated: true, roles: ['Researcher'] },
      canEdit: true,
      authorizedTargetSteps: [],
    });

    expect(operations).to.deep.equal([{ name: 'submit' }]);
    expect(fixture.calls.workflowStepLists).to.equal(1);
    expect(fixture.calls.workflowSteps).to.deep.equal(['draft']);
  });

  it('advertises targets only when their effective forms define the operation', async function () {
    const baseForm = validationForm({
      validationOperations: {
        save: { enabledValidationGroups: ['base'] },
      },
    });
    const reviewForm = validationForm({
      name: 'dataset-2.4-review',
      validationOperations: {
        submit: { enabledValidationGroups: ['submit'] },
      },
    });
    const publishedForm = validationForm({
      name: 'dataset-2.4-published',
      validationOperations: {
        publish: { enabledValidationGroups: ['submit'] },
      },
    });
    const fixture = createRecordValidationFixture({ form: baseForm });
    const forms = new Map([
      [String(baseForm.name), baseForm],
      [String(reviewForm.name), reviewForm],
      [String(publishedForm.name), publishedForm],
    ]);
    fixture.dependencies.loadForm = async (formName, brand) => {
      fixture.calls.forms.push({ formName, brand });
      const configuration = forms.get(formName);
      return configuration ? {
        id: `form-${formName}`,
        name: formName,
        branding: brand,
        configuration,
      } as never : null;
    };

    const operations = await new Services.RecordValidation(fixture.dependencies).discoverOperations({
      candidate: fixture.request.candidate,
      writeKind: 'update',
      actor: { authenticated: true, roles: ['Researcher'] },
      canEdit: true,
      authorizedTargetSteps: ['review', 'published'],
    });

    expect(operations).to.deep.equal([
      { name: 'publish', allowedTargetSteps: ['published'] },
      { name: 'save' },
      { name: 'submit', allowedTargetSteps: ['review'] },
    ]);
  });

  it('uses explicit deterministic presentation precedence for operations shared by forms', async function () {
    const baseForm = validationForm({
      validationOperations: {
        shared: { enabledValidationGroups: ['base'], label: 'Current form label' },
      },
    });
    const reviewForm = validationForm({
      name: 'dataset-2.4-review',
      validationOperations: {
        shared: { enabledValidationGroups: ['submit'], label: 'Review label' },
        targetOnly: { enabledValidationGroups: ['submit'], label: 'Review target label' },
      },
    });
    const publishedForm = validationForm({
      name: 'dataset-2.4-published',
      validationOperations: {
        shared: { enabledValidationGroups: ['submit'], label: 'Published label' },
        targetOnly: { enabledValidationGroups: ['submit'], label: 'Published target label' },
      },
    });
    const fixture = createRecordValidationFixture({ form: baseForm });
    const forms = new Map([
      [String(baseForm.name), baseForm],
      [String(reviewForm.name), reviewForm],
      [String(publishedForm.name), publishedForm],
    ]);
    fixture.dependencies.loadForm = async (formName, brand) => {
      fixture.calls.forms.push({ formName, brand });
      const configuration = forms.get(formName);
      return configuration ? {
        id: `form-${formName}`,
        name: formName,
        branding: brand,
        configuration,
      } as never : null;
    };

    const operations = await new Services.RecordValidation(fixture.dependencies).discoverOperations({
      candidate: fixture.request.candidate,
      writeKind: 'update',
      actor: { authenticated: true, roles: ['Researcher'] },
      canEdit: true,
      authorizedTargetSteps: ['review', 'published'],
    });

    expect(operations).to.deep.equal([
      {
        name: 'shared',
        label: 'Current form label',
        allowedTargetSteps: ['published', 'review'],
      },
      {
        name: 'targetOnly',
        label: 'Published target label',
        allowedTargetSteps: ['published', 'review'],
      },
    ]);
  });

  it('logs one sanitized diagnostic per failed constructed form during discovery', async function () {
    const fixture = createRecordValidationFixture({
      workflowSteps: {
        review: { name: 'review', config: { form: 'dataset-2.4-draft' } },
        published: { name: 'published', config: { form: 'dataset-2.4-draft' } },
      },
    });
    fixture.dependencies.constructForm = async () => {
      throw new Error('secret compiler exception for oid-1');
    };

    const operations = await new Services.RecordValidation(fixture.dependencies).discoverOperations({
      candidate: fixture.request.candidate,
      writeKind: 'update',
      actor: { authenticated: true, roles: ['Researcher'] },
      canEdit: true,
      authorizedTargetSteps: ['review', 'published'],
    });

    const warn = (global as any).sails.log.warn as sinon.SinonStub;
    expect(operations).to.deep.equal([]);
    expect(warn.callCount).to.equal(1);
    expect(String(warn.firstCall.args[0])).to.include('errorType=Error');
    expect(String(warn.firstCall.args[0])).not.to.include('secret compiler exception');
    expect(String(warn.firstCall.args[0])).not.to.include('oid-1');
  });

  it('bounds workflow queries and constructs each distinct discovered form once', async function () {
    const form = validationForm({
      validationOperations: {
        submit: { enabledValidationGroups: ['submit'], roles: ['Researcher'] },
      },
    });
    const fixture = createRecordValidationFixture({
      form,
      workflowSteps: {
        review: { name: 'review', config: { form: 'dataset-shared-target' } },
        published: { name: 'published', config: { form: 'dataset-shared-target' } },
      },
    });
    const constructions: string[] = [];
    fixture.dependencies.loadForm = async (formName, brand) => {
      fixture.calls.forms.push({ formName, brand });
      return {
        id: `form-${formName}`,
        name: formName,
        branding: brand,
        configuration: { ...form, name: formName },
      } as never;
    };
    fixture.dependencies.constructForm = async rawForm => {
      constructions.push(String(rawForm.name));
      return rawForm as never;
    };

    const operations = await new Services.RecordValidation(fixture.dependencies).discoverOperations({
      candidate: fixture.request.candidate,
      writeKind: 'update',
      actor: { authenticated: true, roles: ['Researcher'] },
      canEdit: true,
      authorizedTargetSteps: ['review', 'published'],
    });

    expect(operations).to.deep.equal([{
      name: 'submit',
      allowedTargetSteps: ['published', 'review'],
    }]);
    expect(fixture.calls.workflowStepLists).to.equal(1);
    expect(fixture.calls.workflowSteps).to.deep.equal([]);
    expect(fixture.calls.forms).to.deep.equal([
      { formName: 'dataset-2.4-draft', brand: 'brand-1' },
      { formName: 'dataset-shared-target', brand: 'brand-1' },
    ]);
    expect(constructions).to.deep.equal(['dataset-2.4-draft', 'dataset-shared-target']);
  });

  it('uses explicit discovery intent without applying a fabricated discovery operation', async function () {
    const form = validationForm({
      validationOperations: {
        discovery: { enabledValidationGroups: ['all'], roles: ['Admin'] },
        submit: { enabledValidationGroups: ['submit'], roles: ['Researcher'] },
      },
    });
    const fixture = createRecordValidationFixture({ form });

    const operations = await new Services.RecordValidation(fixture.dependencies).discoverOperations({
      candidate: fixture.request.candidate,
      writeKind: 'update',
      actor: { authenticated: true, roles: ['Researcher'] },
      canEdit: true,
      authorizedTargetSteps: [],
    });

    expect(operations).to.deep.equal([{ name: 'submit' }]);
  });

  it('discovers the effective form, record-type, and current-stage operation policy', async function () {
    const form = validationForm({
      validationOperations: {
        submit: {
          enabledValidationGroups: ['submit'],
          label: 'Form submit',
          roles: ['Researcher', 'Librarian'],
          allowedTargetSteps: ['review', 'published'],
        },
      },
    });
    const fixture = createRecordValidationFixture({
      form,
      recordType: {
        id: 'record-type-1',
        name: 'dataset',
        recordValidation: {
          operations: {
            submit: {
              label: 'Record type submit',
              description: 'Record type description',
              roles: ['Librarian'],
              allowedTargetSteps: ['published'],
            },
          },
        },
      },
      workflowSteps: {
        draft: {
          name: 'draft',
          config: {
            form: 'dataset-2.4-draft',
            recordValidation: {
              operations: {
                submit: {
                  label: 'Stage submit',
                  allowedTargetSteps: ['published'],
                },
              },
            },
          },
        },
      },
    });
    const service = new Services.RecordValidation(fixture.dependencies);
    fixture.dependencies.loadForm = async (formName, brand) => {
      fixture.calls.forms.push({ formName, brand });
      return {
        id: `form-${formName}`,
        name: formName,
        branding: brand,
        configuration: { ...form, name: formName },
      } as never;
    };
    const request = {
      candidate: fixture.request.candidate,
      writeKind: 'update' as const,
      actor: { authenticated: true, roles: ['Librarian'] },
      canEdit: true,
      authorizedTargetSteps: ['review', 'published'],
    };

    expect(await service.discoverOperations(request)).to.deep.equal([{
      name: 'submit',
      label: 'Stage submit',
      description: 'Record type description',
      allowedTargetSteps: ['published'],
    }]);
    expect(await service.discoverOperations({
      ...request,
      actor: { authenticated: true, roles: ['Researcher'] },
    })).to.deep.equal([]);
  });

  it('fails operation discovery safely when edit, actor, target, or policy authorization is absent', async function () {
    const fixture = createRecordValidationFixture();
    const service = new Services.RecordValidation(fixture.dependencies);
    const base = {
      candidate: fixture.request.candidate,
      writeKind: 'transition' as const,
      targetStep: 'published',
      actor: { authenticated: true, roles: ['Researcher'] },
      canEdit: true,
      authorizedTargetSteps: ['published'],
    };

    expect(await service.discoverOperations({ ...base, canEdit: false })).to.deep.equal([]);
    expect(await service.discoverOperations({
      ...base,
      actor: { authenticated: false, roles: ['Researcher'] },
    })).to.deep.equal([]);
    expect(await service.discoverOperations({ ...base, authorizedTargetSteps: ['review'] })).to.deep.equal([]);
    expect(await service.discoverOperations({
      ...base,
      actor: { authenticated: true, roles: ['Guest'] },
    })).to.deep.equal([]);

    const missingStage = createRecordValidationFixture({
      startingStep: null,
      workflowSteps: { draft: null },
    });
    expect(await new Services.RecordValidation(missingStage.dependencies).discoverOperations({
      candidate: missingStage.request.candidate,
      writeKind: 'update',
      actor: { authenticated: true, roles: ['Researcher'] },
      canEdit: true,
      authorizedTargetSteps: [],
    })).to.deep.equal([]);
  });

  it('diagnoses malformed policy arrays and fails closed only when enforced', async function () {
    const form = validationForm({
      validationOperations: {
        submit: { enabledValidationGroups: ['submit'], roles: ['Researcher'] },
      },
    });
    const malformedOverride = {
      id: 'record-type-1',
      name: 'dataset',
      recordValidation: { operations: { submit: { roles: ['Researcher', 42] } } },
    };
    const shadow = createRecordValidationFixture({ form, recordType: malformedOverride });
    const shadowResult = await new Services.RecordValidation(shadow.dependencies).resolve({
      ...shadow.request,
      validationOperation: 'submit',
    });
    expect(shadowResult.shouldBlock).to.equal(false);
    expect(codes(shadowResult)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationPolicyMalformed);

    configure('enforce');
    const enforce = createRecordValidationFixture({ form, recordType: malformedOverride });
    const enforceResult = await new Services.RecordValidation(enforce.dependencies).resolve({
      ...enforce.request,
      validationOperation: 'submit',
    });
    expect(enforceResult.shouldBlock).to.equal(true);
  });

  it('runs the strict all-validators sentinel when operation is omitted', async function () {
    const fixture = createRecordValidationFixture();
    const result = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);
    expect(requireResolved(result).effectiveGroups).to.deep.equal([]);
    expect(fixture.calls.validatorGroups).to.deep.equal([[]]);
  });

  it('never treats client group arrays in record metadata as validation authority', async function () {
    const fixture = createRecordValidationFixture({
      candidate: {
        metadata: {
          title: 'Final title',
          enabledValidationGroups: ['none'],
          validationGroups: ['client-selected-group'],
        },
      },
    });
    const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'submit',
    }));

    expect(result.effectiveGroups).to.deep.equal(['submit']);
    expect(fixture.calls.validatorGroups).to.deep.equal([['submit']]);
  });

  it('never traverses submitted object branches as expressions, summaries, or nested form groups', async function () {
    const injectedCandidateConfiguration = {
      expressions: [{
        name: 'candidate-selects-none',
        config: { target: 'form.enabledValidationGroups', template: '{"initial":"none"}' },
      }],
      component: {
        class: 'SuggestedValidationSummaryComponent',
        config: { enabledValidationGroups: ['conditional'] },
      },
      tabs: [{ expressions: [{
        name: 'nested-candidate-selects-none',
        config: { target: 'form.enabledValidationGroups', template: '{"initial":"none"}' },
      }] }],
    };
    const form = validationForm({ componentDefinitions: [{
      name: 'payload',
      component: { class: 'SimpleInputComponent' },
      model: { class: 'SimpleInputModel', config: {} },
    } as never] });
    const fixture = createRecordValidationFixture({ form, candidate: { metadata: { payload: injectedCandidateConfiguration } } });
    fixture.dependencies.constructForm = async rawForm => {
      fixture.calls.constructions += 1;
      const constructed = structuredClone(rawForm) as unknown as {
        componentDefinitions: Array<{ model?: { config?: Record<string, unknown> } }>;
      };
      constructed.componentDefinitions[0].model!.config!.value = injectedCandidateConfiguration;
      return constructed as never;
    };

    const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request));
    expect(result.resolved.conditionalGroups).to.deep.equal(['base']);
    expect(result.effectiveGroups).to.deep.equal([]);
    expect(result.advisoryGroups).to.deep.equal([]);
    expect(fixture.calls.validatorGroups).to.deep.equal([[]]);
  });

  it('preserves an empty operation group array as the shared all-validators sentinel', async function () {
    const form = validationForm({ validationOperations: { submit: { enabledValidationGroups: [] } } });
    const fixture = createRecordValidationFixture({ form });
    const result = requireResolved(
      await new Services.RecordValidation(fixture.dependencies).resolve({
        ...fixture.request,
        validationOperation: 'submit',
      })
    );
    expect(result.effectiveGroups).to.deep.equal([]);
  });

  it('builds a final-state, allowlisted, explicit, normalized, privacy-preserving context', async function () {
    const fixture = createRecordValidationFixture({
      candidate: { metadata: { title: 'Merged final title', nested: { valid: true } } },
    });
    const adversarialRequest = {
      ...fixture.request,
      validationOperation: 'submit',
      targetStep: 'review',
      currentStep: 'draft',
      actor: {
        authenticated: true,
        roles: [' Researcher ', 'Admin', 'Researcher'],
        username: 'private-user',
        id: 'private-id',
        token: 'private-token',
      },
      requestParameters: JSON.parse(
        '{"locale":"en-AU","token":"request-token","nested":{"safe":true},"__proto__":{"polluted":true}}'
      ),
      allowedRequestParameterNames: ['locale', 'nested', 'token', '__proto__'],
      runtimeContext: { clock: '2026-08-22T00:00:00Z' },
      rawRequest: { authorization: 'Bearer secret' },
      session: { secret: 'session-secret' },
      user: { password: 'password-secret' },
    } as unknown as RecordValidationRequest;
    const result = await new Services.RecordValidation(fixture.dependencies).resolve(adversarialRequest);
    const context = requireResolved(result).resolved.expressionContext!;

    expect(context.formData).to.deep.equal({ title: 'Merged final title', nested: { valid: true } });
    expect(context.formData).not.to.equal(fixture.request.candidate.metadata);
    expect(context.requestParams).to.deep.equal({ locale: 'en-AU', nested: { safe: true } });
    expect(context.runtimeContext).to.deep.equal({ clock: '2026-08-22T00:00:00Z' });
    expect(context.actor).to.deep.equal({ authenticated: true, roles: ['Admin', 'Researcher'] });
    expect(context.workflow).to.deep.equal({ currentStep: 'draft', targetStep: 'review' });
    expect(JSON.stringify(context)).not.to.match(
      /private-|request-token|Bearer|session-secret|password-secret|username|rawRequest/
    );
  });

  it('treats projection cycles as failures without invoking getters', async function () {
    let getterRuns = 0;
    const metadata: Record<string, unknown> = { title: 'safe' };
    Object.defineProperty(metadata, 'getterSecret', {
      enumerable: true,
      get: () => {
        getterRuns += 1;
        return 'must-not-run';
      },
    });
    metadata.functionSecret = () => 'must-not-run';
    metadata.cycle = metadata;
    const fixture = createRecordValidationFixture({ candidate: { metadata } });
    const shadow = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);
    expect(getterRuns).to.equal(0);
    expect(shadow.status).to.equal('unresolved');
    expect(codes(shadow)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionContextUnsupported);
    expect(shadow.shouldBlock).to.equal(false);

    configure('enforce');
    const enforceFixture = createRecordValidationFixture({ candidate: { metadata } });
    const enforce = await new Services.RecordValidation(enforceFixture.dependencies).resolve(enforceFixture.request);
    expect(enforce.status).to.equal('unresolved');
    expect(enforce.shouldBlock).to.equal(true);
    expect(getterRuns).to.equal(0);
  });

  it('projects undefined, dates, and class instances with JSON-compatible warning semantics', async function () {
    configure('enforce');
    class MetadataDetails {
      public constructor(
        public readonly label: string,
        public readonly omitted: unknown = undefined
      ) {}
    }
    const metadata = {
      title: 'safe',
      omitted: undefined,
      created: new Date('2026-08-23T01:02:03.000Z'),
      details: new MetadataDetails('class value'),
    };
    const fixture = createRecordValidationFixture({ candidate: { metadata } });

    const result = requireResolved(
      await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request)
    );

    expect(result.shouldBlock).to.equal(false);
    expect(result.resolved.expressionContext?.formData).to.deep.equal({
      title: 'safe',
      created: '2026-08-23T01:02:03.000Z',
      details: { label: 'class value' },
    });
    const contextDiagnostics = result.diagnostics.filter(diagnostic =>
      diagnostic.code === RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionContextUnsupported
    );
    expect(contextDiagnostics).to.have.length(1);
    expect(contextDiagnostics[0].severity).to.equal('warning');
  });

  it('uses the server allowlist when caller-side request-parameter narrowing is omitted', async function () {
    const fixture = createRecordValidationFixture();
    const result = requireResolved(
      await new Services.RecordValidation(fixture.dependencies).resolve({
        ...fixture.request,
        requestParameters: { locale: 'en-AU' },
      })
    );
    expect(result.resolved.expressionContext?.requestParams).to.deep.equal({ locale: 'en-AU' });
    expect(codes(result)).not.to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.requestParameterDropped);
  });

  it('diagnoses dropped request parameters without exposing their names or values', async function () {
    const fixture = createRecordValidationFixture();
    const result = requireResolved(
      await new Services.RecordValidation(fixture.dependencies).resolve({
        ...fixture.request,
        requestParameters: { forbiddenSecretName: 'forbidden-secret-value' },
      })
    );
    expect(result.resolved.expressionContext?.requestParams).to.deep.equal({});
    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.requestParameterDropped);
    expect(JSON.stringify(result.diagnostics)).not.to.match(/forbiddenSecretName|forbidden-secret-value/);
  });

  it('discovers and folds conditional expressions in deterministic declaration/traversal order', async function () {
    const expression = (name: string, template: string) => ({
      name,
      config: {
        target: 'form.enabledValidationGroups',
        conditionKind: 'jsonata',
        condition: 'formData.activate',
        template,
      },
    });
    const form = validationForm({
      componentDefinitions: [
        {
          name: 'first',
          expressions: [expression('include', '{"initial":"current","groups":{"include":["conditional"]}}')],
        } as never,
        {
          name: 'second',
          expressions: [expression('exclude', '{"initial":"current","groups":{"exclude":["base"]}}')],
        } as never,
      ],
    });
    const fixture = createRecordValidationFixture({ form });
    const result = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'submit',
      targetStep: 'review',
    });

    const resolved = requireResolved(result);
    expect(resolved.resolved.conditionalGroups).to.deep.equal(['conditional']);
    expect(resolved.effectiveGroups).to.deep.equal(['submit']);

    const withoutOperation = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);
    const conditionallyResolved = requireResolved(withoutOperation);
    expect(conditionallyResolved.resolved.conditionalGroups).to.deep.equal(['conditional']);
    expect(conditionallyResolved.effectiveGroups).to.deep.equal([]);
  });

  it('rejects browser-routed and browser-context conditions without changing groups', async function () {
    const form = validationForm({
      componentDefinitions: [
        {
          name: 'field',
          expressions: [
            {
              name: 'final-state',
              config: {
                target: 'form.enabledValidationGroups',
                conditionKind: 'jsonpointer',
                condition: '/activate',
                template: '{"groups":{"include":["conditional"]}}',
              },
            },
            {
              name: 'history',
              config: {
                target: 'form.enabledValidationGroups',
                conditionKind: 'jsonpointer',
                condition: '/activate::field.value.changed',
                template: '{"groups":{"exclude":["base"]}}',
              },
            },
            {
              name: 'event-context',
              config: {
                target: 'form.enabledValidationGroups',
                conditionKind: 'jsonata',
                condition: 'event.value != null',
                template: '{"groups":{"include":["conditional"]}}',
              },
            },
            {
              name: 'query-context',
              config: {
                target: 'form.enabledValidationGroups',
                conditionKind: 'jsonata_query',
                condition: 'querySource.enabled',
                template: '{"groups":{"include":["conditional"]}}',
              },
            },
            {
              name: 'operation-only',
              config: {
                target: 'form.enabledValidationGroups',
                operation: 'clientOnlyGroupOperation',
              },
            },
          ],
        } as never,
      ],
    });
    const fixture = createRecordValidationFixture({ form });
    const result = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'submit',
      targetStep: 'review',
    });
    expect(requireResolved(result).resolved.conditionalGroups).to.deep.equal(['base']);
    expect(
      codes(result).filter(code => code === RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported)
    ).to.have.length(5);
    const historyDiagnostic = result.diagnostics.find(item => item.message.includes('browser event history'));
    expect(historyDiagnostic).not.to.equal(undefined);
    expect(result.diagnostics.find(item => item.expressionName === 'event-context')).to.deep.include({
      field: 'field',
      pointer: '/componentDefinitions/0',
    });
  });

  it('detects browser-only roots inside JSONata path-property siblings and computed steps', async function () {
    configure('enforce');
    for (const condition of [
      '$count(formData.items{event: value}) > 0',
      '$count(formData.items{value: event}) > 0',
      '$count(formData.items^(event)) > 0',
    ]) {
      const form = validationForm({ componentDefinitions: [{
        name: 'nested-browser-context',
        expressions: [{
          name: 'nested-browser-context-expression',
          config: {
            target: 'form.enabledValidationGroups',
            conditionKind: 'jsonata',
            condition,
            template: '{"groups":{"include":["conditional"]}}',
          },
        }],
      } as never] });
      const fixture = createRecordValidationFixture({
        form,
        candidate: { metadata: { items: [{ value: 1 }] } },
      });

      const result = requireResolved(
        await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request)
      );

      expect(result.shouldBlock, condition).to.equal(true);
      expect(codes(result), condition).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported);
      expect(codes(result), condition).not.to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionEvaluationFailed);
    }
  });

  it('allows value identifiers in predicates and bound JSONata lambdas', async function () {
    const form = validationForm({ componentDefinitions: [{
      name: 'legitimate-value-identifiers',
      expressions: [{
        name: 'predicate-and-lambda',
        config: {
          target: 'form.enabledValidationGroups',
          conditionKind: 'jsonata',
          condition: '$count(formData.items[value > 0]) > 0',
          template: '($mapped := $map(formData.items, function($value){$value}); {"groups":{"include":["conditional"]}})',
        },
      }],
    } as never] });
    const fixture = createRecordValidationFixture({ form, candidate: { metadata: { items: [{ value: 1 }] } } });
    const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request));
    expect(result.resolved.conditionalGroups).to.deep.equal(['base', 'conditional']);
    expect(codes(result)).not.to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported);
  });

  it('evaluates JSONata containing quoted double-colons without treating the literal as browser history', async function () {
    const form = validationForm({
      componentDefinitions: [
        {
          name: 'quoted-literal',
          expressions: [
            {
              name: 'quoted-literal-expression',
              config: {
                target: 'form.enabledValidationGroups',
                conditionKind: 'jsonata',
                condition: 'formData.title = "a::b"',
                template: '{"groups":{"include":["conditional"]},"note":"x::y"}',
              },
            },
          ],
        } as never,
      ],
    });
    const fixture = createRecordValidationFixture({
      form,
      candidate: { metadata: { title: 'a::b' } },
    });
    const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request));
    expect(result.resolved.conditionalGroups).to.deep.equal(['base', 'conditional']);
    expect(result.effectiveGroups).to.deep.equal([]);
    expect(codes(result)).not.to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported);
  });

  it('skips validation-group expressions disabled on form ready', async function () {
    const form = validationForm({
      componentDefinitions: [
        {
          name: 'interaction-only',
          expressions: [
            {
              name: 'interaction-only-expression',
              config: {
                target: 'form.enabledValidationGroups',
                conditionKind: 'jsonata',
                condition: 'true',
                runOnFormReady: false,
                template: '{"groups":{"include":["conditional"]}}',
              },
            },
          ],
        } as never,
      ],
    });
    const fixture = createRecordValidationFixture({ form });
    const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request));
    expect(result.resolved.conditionalGroups).to.deep.equal(['base']);
    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported);
  });

  it('propagates the legacy empty-initial deprecation from an expression fold', async function () {
    const form = validationForm({
      componentDefinitions: [
        {
          name: 'legacy-empty',
          expressions: [
            {
              name: 'legacy-empty-expression',
              config: {
                target: 'form.enabledValidationGroups',
                template: '{"initial":"empty","groups":{"include":["conditional"]}}',
              },
            },
          ],
        } as never,
      ],
    });
    const fixture = createRecordValidationFixture({ form });
    const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request));
    expect(result.resolved.conditionalGroups).to.deep.equal(['conditional']);
    expect(result.effectiveGroups).to.deep.equal([]);
    expect(codes(result)).to.include('validation-group-initial-empty-deprecated');
  });

  it('fails closed for malformed blocking expressions in enforce and remains non-blocking in shadow', async function () {
    const form = validationForm({
      componentDefinitions: [
        {
          name: 'broken',
          expressions: [
            {
              name: 'broken-expression',
              config: {
                target: 'form.enabledValidationGroups',
                conditionKind: 'jsonata',
                condition: '(',
                template: '{"groups":{"include":["conditional"]}}',
              },
            },
          ],
        } as never,
      ],
    });
    const shadow = createRecordValidationFixture({ form });
    const shadowResult = await new Services.RecordValidation(shadow.dependencies).resolve({
      ...shadow.request,
      validationOperation: 'submit',
      targetStep: 'review',
    });
    expect(shadowResult.shouldBlock).to.equal(false);
    expect(codes(shadowResult)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionEvaluationFailed);

    configure('enforce');
    const enforce = createRecordValidationFixture({ form });
    const enforceResult = await new Services.RecordValidation(enforce.dependencies).resolve({
      ...enforce.request,
      validationOperation: 'submit',
      targetStep: 'review',
    });
    expect(enforceResult.shouldBlock).to.equal(true);
  });

  it('diagnoses malformed expression results and unknown effective groups safely', async function () {
    configure('enforce');
    const form = validationForm({
      validationOperations: { submit: { enabledValidationGroups: ['not-declared'] } },
      componentDefinitions: [
        {
          name: 'bad-result',
          expressions: [
            {
              name: 'bad-result-expression',
              config: { target: 'form.enabledValidationGroups', template: '"not-a-change"' },
            },
          ],
        } as never,
      ],
    });
    const fixture = createRecordValidationFixture({ form });
    const result = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'submit',
    });
    expect(result.shouldBlock).to.equal(true);
    expect(result.status).to.equal('unresolved');
    expect(codes(result)).to.include.members([
      RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionResultMalformed,
      RECORD_VALIDATION_DIAGNOSTIC_CODES.validationGroupUnknown,
    ]);
  });

  it('returns unknown operation groups as non-executable unresolved state in shadow', async function () {
    const form = validationForm({
      validationOperations: { submit: { enabledValidationGroups: ['not-declared'] } },
    });
    const fixture = createRecordValidationFixture({ form });
    const result = await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'submit',
    });
    expect(result).to.deep.include({ status: 'unresolved', shouldBlock: false });
    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.validationGroupUnknown);
  });

  it('only returns resolved groups accepted by ValidatorsSupport', async function () {
    const fixture = createRecordValidationFixture();
    const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request));
    expect(() =>
      new ValidatorsSupport().checkValidationGroups(result.resolved.constructedForm.validationGroups ?? {}, [
        ...result.effectiveGroups,
      ])
    ).not.to.throw();
  });

  it('emits duration, mode/outcome, error, timeout, and configuration telemetry per resolution', async function () {
    const fixture = createRecordValidationFixture();
    const result = await new Services.RecordValidation(fixture.dependencies, fixture.metrics).resolve({
      ...fixture.request,
      validationOperation: 'submit',
      requestParameters: { secret: 'never-observed' },
    });
    expect(result.status).to.equal('resolved');
    expect(fixture.metricEvents).to.have.length(1);
    expect(fixture.metricEvents[0]).to.deep.include({
      requestId: 'request-1',
      recordType: 'dataset',
      formName: 'dataset-2.4-draft',
      operation: 'submit',
      writeKind: 'update',
      phase: 'pre-save',
      mode: 'shadow',
      status: 'resolved',
      outcome: 'valid',
      shouldBlock: false,
      wouldBlock: false,
      blockingErrorCount: 0,
      advisoryErrorCount: 0,
      timeoutKind: 'none',
      configurationDiagnosticCount: 0,
    });
    expect(fixture.metricEvents[0].durationMs).to.be.a('number').and.at.least(0);
    expect(JSON.stringify(fixture.metricEvents)).not.to.contain('never-observed');

    const log = (global as any).sails.log.info.lastCall.args[1];
    expect(log).to.deep.include({
      event: 'record_validation_completed',
      request_id: 'request-1',
      record_type: 'dataset',
      form: 'dataset-2.4-draft',
      validation_operation: 'submit',
      write_kind: 'update',
      phase: 'pre-save',
      mode: 'shadow',
      outcome: 'valid',
    });
    expect(JSON.stringify(log)).not.to.contain('never-observed');

    const failing = createRecordValidationFixture();
    failing.dependencies.loadForm = async () => null;
    await new Services.RecordValidation(failing.dependencies, failing.metrics).resolve(failing.request);
    expect(failing.metricEvents[0]).to.deep.include({
      recordType: 'dataset',
      formName: 'dataset-2.4-draft',
      status: 'unresolved',
      outcome: 'configuration-error',
      wouldBlock: true,
    });
    expect(failing.metricEvents[0].configurationDiagnosticCount).to.equal(1);
  });

  it('bounds actual OpenTelemetry attributes across hostile unresolved references and diagnostic identities', async function () {
    const hostileValues: string[] = [];
    for (let index = 0; index < 16; index += 1) {
      const recordType = `hostile-record-type-${index}`;
      const formName = `hostile-form-${index}`;
      const operation = `hostileOperation${index}`;
      hostileValues.push(recordType, formName, operation);
      const fixture = createRecordValidationFixture({
        candidate: { metaMetadata: { brandId: 'brand-1', type: recordType, form: formName } },
      });
      await new Services.RecordValidation(fixture.dependencies).resolve({
        ...fixture.request,
        validationOperation: operation,
      });
    }

    const unresolvedRuns = getCapturedOpenTelemetryMeasurements().filter(measurement =>
      measurement.name === 'redbox.record_validation.runs' &&
      measurement.attributes['record_validation.status'] === 'unresolved'
    );
    expect(unresolvedRuns).to.have.length(16);
    for (const measurement of unresolvedRuns) {
      expect(measurement.attributes).to.include({
        'record_validation.record_type': 'unresolved',
        'record_validation.form': 'unresolved',
        'record_validation.operation': 'unresolved',
      });
    }

    for (let index = 0; index < 16; index += 1) {
      const validatorClass = `HostileValidator${index}`;
      const validatorCode = `hostile-validator-code-${index}`;
      const field = `hostileField${index}`;
      const pointerSegment = `hostile-pointer-${index}`;
      hostileValues.push(validatorClass, validatorCode, field, pointerSegment);
      const fixture = createRecordValidationFixture();
      fixture.dependencies.executeValidators = async () => validatorExecution([
        validatorSummary({
          id: field,
          errors: [{
            class: validatorClass,
            message: `@${validatorCode}`,
            params: {},
            targetField: { angularComponents: [pointerSegment, index] },
          }],
          lineagePaths: {
            formConfig: ['componentDefinitions', index],
            dataModel: [pointerSegment, index],
            angularComponents: [pointerSegment, index],
            angularComponentsJsonPointer: `/${pointerSegment}/${index}`,
            layout: [`${pointerSegment}-layout`, index],
            layoutJsonPointer: `/${pointerSegment}-layout/${index}`,
          },
        }),
      ]);
      await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);
    }

    const measurements = getCapturedOpenTelemetryMeasurements();
    const prohibitedAttributeNames = [
      'record_validation.expression_name',
      'record_validation.validator_class',
      'record_validation.validator_code',
      'record_validation.field',
      'record_validation.pointer',
      'record_validation.lineage',
    ];
    for (const measurement of measurements) {
      expect(Object.keys(measurement.attributes)).not.to.include.members(prohibitedAttributeNames);
    }
    const validatorDiagnostics = measurements.filter(measurement =>
      measurement.name === 'redbox.record_validation.diagnostics' &&
      measurement.attributes['record_validation.code'] === 'record-validation-validator-failure'
    );
    expect(validatorDiagnostics).to.have.length(16);
    expect(new Set(validatorDiagnostics.map(measurement => JSON.stringify(measurement.attributes))).size).to.equal(1);
    const serializedMeasurements = JSON.stringify(measurements);
    for (const hostileValue of hostileValues) expect(serializedMeasurements).not.to.include(hostileValue);
  });

  it('keeps diagnostics, logs, metrics, and shadow reports free of raw values and request parameters', async function () {
    const fixture = createRecordValidationFixture({
      candidate: { metadata: { title: 'raw-secret-title', nested: { token: 'raw-secret-token' } } },
    });
    const service = new Services.RecordValidation(fixture.dependencies, fixture.metrics);
    await service.resolve({
      ...fixture.request,
      requestParameters: { secret: 'raw-secret-parameter' },
      runtimeContext: { credential: 'raw-secret-runtime' },
      actor: { authenticated: true, roles: ['Researcher', 'raw-secret-role'] },
    });

    const observable = JSON.stringify({
      metric: fixture.metricEvents,
      logs: (global as any).sails.log.info.args,
      report: service.getShadowReport(),
    });
    expect(observable).not.to.match(/raw-secret-title|raw-secret-token|raw-secret-parameter|raw-secret-runtime|raw-secret-role/);
    expect(service.getShadowReport()).to.deep.include({ totalRuns: 1, overflowRuns: 0, maxSeries: 1_000 });
    expect(service.getShadowReport().rows[0]).to.deep.include({
      recordType: 'dataset',
      operation: 'strict-all',
      writeKind: 'update',
      phase: 'pre-save',
      formName: 'dataset-2.4-draft',
      code: RECORD_VALIDATION_DIAGNOSTIC_CODES.requestParameterDropped,
      runs: 1,
    });
  });

  it('buckets unknown client operation names before metrics, logs, or shadow aggregation', async function () {
    const fixture = createRecordValidationFixture();
    const service = new Services.RecordValidation(fixture.dependencies, fixture.metrics);

    const result = await service.resolve({
      ...fixture.request,
      validationOperation: 'UnknownExternalOperation',
    });

    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationUnknown);
    expect(fixture.metricEvents[0].operation).to.equal('unknown');
    const observable = JSON.stringify({
      metric: fixture.metricEvents,
      logs: (global as any).sails.log.info.args,
      report: service.getShadowReport(),
    });
    expect(observable).not.to.include('UnknownExternalOperation');
  });

  it('builds a bounded shadow report by record type, operation, form, and diagnostic code', async function () {
    (global as any).sails.config.recordValidation.shadowReportMaxSeries = 1;
    const fixture = createRecordValidationFixture();
    const loadForm = fixture.dependencies.loadForm;
    let formUnavailable = false;
    fixture.dependencies.loadForm = async (formName, brand) =>
      formUnavailable ? null : await loadForm(formName, brand);
    const service = new Services.RecordValidation(fixture.dependencies);
    await service.resolve({ ...fixture.request, validationOperation: 'submit' });
    formUnavailable = true;
    service.clearCaches();
    await service.resolve({ ...fixture.request, validationOperation: 'submit' });

    const report = service.getShadowReport();
    expect(report).to.deep.include({ totalRuns: 2, overflowRuns: 1, maxSeries: 1 });
    expect(report.rows).to.have.length(1);
    expect(report.rows[0]).to.deep.include({
      recordType: 'dataset',
      operation: 'submit',
      writeKind: 'update',
      phase: 'pre-save',
      formName: 'dataset-2.4-draft',
      code: 'none',
      runs: 1,
      wouldReject: 0,
    });
    expect(report.rows[0].averageDurationMs).to.be.a('number').and.at.least(0);
  });

  it('delivers metrics registered through the exported service surface', async function () {
    const fixture = createRecordValidationFixture();
    const exported = new Services.RecordValidation(fixture.dependencies).exports() as {
      resolve(request: RecordValidationRequest): Promise<RecordValidationResult>;
      registerMetricsHooks(hooks: typeof fixture.metrics): () => void;
    };
    const unregister = exported.registerMetricsHooks(fixture.metrics);
    await exported.resolve(fixture.request);
    expect(fixture.metricEvents).to.have.length(1);
    expect(fixture.metricEvents[0].status).to.equal('resolved');
    unregister();
    await exported.resolve(fixture.request);
    expect(fixture.metricEvents).to.have.length(1);
  });

  it('keeps independently registered metrics hooks additive', async function () {
    const fixture = createRecordValidationFixture();
    const secondaryEvents: unknown[] = [];
    const service = new Services.RecordValidation(fixture.dependencies, fixture.metrics);
    const unregister = service.registerMetricsHooks({
      resolutionCompleted: metric => {
        secondaryEvents.push(metric);
      },
    });
    await service.resolve(fixture.request);
    expect(fixture.metricEvents).to.have.length(1);
    expect(secondaryEvents).to.have.length(1);
    unregister();
  });

  it('does not let an optional metrics hook change resolver behavior', async function () {
    const fixture = createRecordValidationFixture();
    const result = await new Services.RecordValidation(fixture.dependencies, {
      resolutionCompleted: () => {
        throw new Error('metrics unavailable');
      },
    }).resolve(fixture.request);
    expect(result.status).to.equal('resolved');
    expect(result.shouldBlock).to.equal(false);
  });

  it('isolates rejected async metrics hooks and freezes their safe payload', async function () {
    const fixture = createRecordValidationFixture();
    let observedFrozen = false;
    const result = await new Services.RecordValidation(fixture.dependencies, {
      resolutionCompleted: async metric => {
        observedFrozen = Object.isFrozen(metric) && Object.isFrozen(metric.diagnosticCodes);
        (metric as unknown as { mode: string }).mode = 'enforce';
      },
    }).resolve(fixture.request);
    await Promise.resolve();
    expect(result.shouldBlock).to.equal(false);
    expect(observedFrozen).to.equal(true);
    expect((global as any).sails.log.warn.calledWith('Record validation metrics hook failed.')).to.equal(true);
  });

  it('fully isolates an async metrics rejection when the warning logger also throws', async function () {
    const fixture = createRecordValidationFixture();
    (global as any).sails.log.warn.throws(new Error('logger unavailable'));
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', listener);
    try {
      const result = await new Services.RecordValidation(fixture.dependencies, {
        resolutionCompleted: async () => {
          throw new Error('observer unavailable');
        },
      }).resolve(fixture.request);
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));

      expect(result).to.deep.include({ status: 'resolved', shouldBlock: false });
      expect(unhandled).to.deep.equal([]);
      expect((global as any).sails.log.warn.calledWith('Record validation metrics hook failed.')).to.equal(true);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });

  it('does not let observability failures change resolver behavior', async function () {
    const fixture = createRecordValidationFixture();
    (global as any).sails.log.info.throws(new Error('private logger failure'));

    const result = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);

    expect(result.status).to.equal('resolved');
    expect(result.shouldBlock).to.equal(false);
    expect((global as any).sails.log.warn.calledWith('Record validation observability failed.')).to.equal(true);
  });

  it('discovers advisory groups and executes blocking and advisory visitors separately', async function () {
    const form = validationForm({
      validationGroups: {
        ...validationForm().validationGroups,
        advisory: { description: 'advisory', initialMembership: 'none' },
      },
      componentDefinitions: [suggestedSummary(['advisory']) as never],
      validationOperations: { submit: { enabledValidationGroups: ['base'] } },
    });
    const fixture = createRecordValidationFixture({ form });
    fixture.dependencies.executeValidators = async (_form, groups) => {
      fixture.calls.validatorGroups.push([...groups]);
      return validatorExecution(groups.includes('advisory') ? [validatorSummary()] : []);
    };
    const result = requireResolved(
      await new Services.RecordValidation(fixture.dependencies, fixture.metrics).resolve({
        ...fixture.request,
        validationOperation: 'submit',
      })
    );

    expect(result.advisoryGroups).to.deep.equal(['advisory']);
    expect(fixture.calls.validatorGroups).to.deep.equal([['base'], ['advisory']]);
    expect(result.blockingErrors).to.deep.equal([]);
    expect(result.advisoryErrors).to.have.length(1);
    expect(result.shouldBlock).to.equal(false);
    expect(result).not.to.have.any.keys('problems', 'outcome');
    expect(fixture.metricEvents[0]).to.deep.include({
      outcome: 'valid',
      blockingErrorCount: 0,
      advisoryErrorCount: 1,
      wouldBlock: false,
    });
  });

  it('uses the existing constructor and ValidatorFormConfigVisitor for both production passes', async function () {
    (global as unknown as { sails: { config: Record<string, unknown> } }).sails.config.validators = {
      definitions: formValidatorsSharedDefinitions,
    };
    const form = validationForm({
      validationGroups: {
        all: { description: 'all', initialMembership: 'all' },
        none: { description: 'none', initialMembership: 'none' },
        base: { description: 'base', initialMembership: 'none' },
        advisory: { description: 'advisory', initialMembership: 'none' },
      },
      componentDefinitions: [
        {
          name: 'blockingTitle',
          component: { class: 'SimpleInputComponent' },
          model: {
            class: 'SimpleInputModel',
            config: { validators: [{ class: 'required', groups: { include: ['base'] } }] },
          },
        } as never,
        {
          name: 'advisoryDescription',
          component: { class: 'SimpleInputComponent' },
          model: {
            class: 'SimpleInputModel',
            config: { validators: [{ class: 'required', groups: { include: ['advisory'] } }] },
          },
        } as never,
        suggestedSummary(['advisory']) as never,
      ],
      validationOperations: { submit: { enabledValidationGroups: ['base'] } },
    });
    const fixture = createRecordValidationFixture({ form, candidate: { metadata: {} } });
    const { constructForm: _construct, executeValidators: _execute, ...productionDependencies } = fixture.dependencies;
    const result = requireResolved(
      await new Services.RecordValidation(productionDependencies).resolve({
        ...fixture.request,
        validationOperation: 'submit',
      })
    );

    expect(result.blockingErrors.map(issue => issue.field)).to.deep.equal(['blockingTitle']);
    expect(result.advisoryErrors.map(issue => issue.field)).to.deep.equal(['advisoryDescription']);
    expect(result.blockingErrors[0].pointer).to.equal('/blockingTitle');
    expect(result.advisoryErrors[0].pointer).to.equal('/advisoryDescription');
  });

  it('returns an immutable sanitized candidate and treats htmlSanitized as nonblocking in every rollout mode', async function () {
    const dirtyHtml = '<p>Safe</p><script>alert(1)</script><img src="x" onerror="alert(2)">';
    const form = validationForm({
      componentDefinitions: [{
        name: 'description',
        component: { class: 'RichTextEditorComponent' },
        model: { class: 'RichTextEditorModel' },
      } as never],
    });

    for (const mode of ['shadow', 'enforce'] as const) {
      configure(mode);
      (global as any).sails.config.record = { form: { htmlSanitizationMode: 'sanitize' } };
      (global as any).sails.config.validators = { definitions: formValidatorsSharedDefinitions };
      const metadata = { description: dirtyHtml, untouched: { retained: true } };
      const fixture = createRecordValidationFixture({ form, candidate: { metadata } });
      const { constructForm: _construct, executeValidators: _execute, ...productionDependencies } =
        fixture.dependencies;

      const result = requireResolved(
        await new Services.RecordValidation(productionDependencies, fixture.metrics).resolve(fixture.request)
      );

      expect(result.shouldBlock, mode).to.equal(false);
      expect(result.blockingErrors, mode).to.deep.equal([]);
      expect(result.advisoryErrors.map(issue => issue.class), mode).to.deep.equal(['htmlSanitized']);
      expect(result.transformedCandidate.metadata.description, mode).to.equal('<p>Safe</p><img src="x">');
      expect(result.transformedCandidate.metadata.untouched, mode).to.deep.equal({ retained: true });
      expect(fixture.request.candidate.metadata, mode).to.deep.equal(metadata);
      expect(fixture.metricEvents[0], mode).to.deep.include({
        blockingErrorCount: 0,
        advisoryErrorCount: 1,
        shouldBlock: false,
      });
    }
  });

  it('sanitizes repeatable rich text before required validation and returns indexed transformations', async function () {
    configure('enforce');
    (global as any).sails.config.record = { form: { htmlSanitizationMode: 'sanitize' } };
    (global as any).sails.config.validators = { definitions: formValidatorsSharedDefinitions };
    const form = validationForm({
      componentDefinitions: [{
        name: 'contributors',
        component: {
          class: 'RepeatableComponent',
          config: {
            elementTemplate: {
              name: '',
              component: {
                class: 'GroupComponent',
                config: {
                  componentDefinitions: [{
                    name: 'biography',
                    component: { class: 'RichTextEditorComponent' },
                    model: {
                      class: 'RichTextEditorModel',
                      config: { validators: [{ class: 'required' }] },
                    },
                  }],
                },
              },
            },
          },
        },
        model: { class: 'RepeatableModel' },
      } as never],
    });
    const metadata = { contributors: [{ biography: '<script>alert(1)</script>' }] };
    const fixture = createRecordValidationFixture({ form, candidate: { metadata } });
    const { constructForm: _construct, executeValidators: _execute, ...productionDependencies } =
      fixture.dependencies;

    const result = requireResolved(
      await new Services.RecordValidation(productionDependencies).resolve(fixture.request)
    );

    expect(result.shouldBlock).to.equal(true);
    expect(result.blockingErrors.map(issue => issue.class)).to.deep.equal(['required']);
    expect(result.blockingErrors[0].pointer).to.equal('/contributors/0/biography');
    expect(result.advisoryErrors.map(issue => issue.class)).to.deep.equal(['htmlSanitized']);
    expect((result.transformedCandidate.metadata.contributors as Array<{ biography: string }>)[0].biography)
      .to.equal('');
    expect(fixture.request.candidate.metadata).to.deep.equal(metadata);
  });

  it('keeps an ordinary validator classed htmlSanitized blocking', async function () {
    configure('enforce');
    const fixture = createRecordValidationFixture();
    fixture.dependencies.executeValidators = async () => validatorExecution([
      validatorSummary({
        errors: [{ class: 'htmlSanitized', message: '@validator-warning-html-sanitized', params: {} }],
      }),
    ]);

    const result = requireResolved(
      await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request)
    );

    expect(result.shouldBlock).to.equal(true);
    expect(result.blockingErrors.map(issue => issue.class)).to.deep.equal(['htmlSanitized']);
    expect(result.advisoryErrors).to.deep.equal([]);
  });

  it('returns a detached candidate when the transformation list is empty', async function () {
    const fixture = createRecordValidationFixture({
      candidate: { metadata: { title: 'unchanged', nested: { retained: true } } },
    });
    fixture.dependencies.collectTransformations = async () => [];

    const result = requireResolved(
      await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request)
    );

    expect(result.transformedCandidate).not.to.equal(fixture.request.candidate);
    expect(result.transformedCandidate.metadata).not.to.equal(fixture.request.candidate.metadata);
    expect(result.transformedCandidate.metadata).to.deep.equal(fixture.request.candidate.metadata);
  });

  it('applies transformations returned by both blocking and advisory validator passes', async function () {
    const dirtyDescription = '<p>Description</p><script>alert(1)</script>';
    const dirtyNotes = '<p>Notes</p><img src="x" onerror="alert(2)">';
    const form = validationForm({
      validationGroups: {
        ...validationForm().validationGroups,
        advisory: { description: 'advisory', initialMembership: 'none' },
      },
      componentDefinitions: [suggestedSummary(['advisory']) as never],
    });
    const fixture = createRecordValidationFixture({
      form,
      candidate: { metadata: { description: dirtyDescription, notes: dirtyNotes } },
    });
    fixture.dependencies.collectTransformations = async () => [];
    fixture.dependencies.executeValidators = async (_form, groups) => ({
      summaries: [],
      transformations: groups.includes('advisory')
        ? [richHtmlTransformation(dirtyNotes, '<p>Notes</p><img src="x">', ['notes'])]
        : [richHtmlTransformation(dirtyDescription, '<p>Description</p>')],
    });

    const result = requireResolved(
      await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request)
    );

    expect(result.shouldBlock).to.equal(false);
    expect(result.transformedCandidate.metadata).to.deep.equal({
      description: '<p>Description</p>',
      notes: '<p>Notes</p><img src="x">',
    });
    expect(result.advisoryErrors.map(issue => issue.class)).to.deep.equal(['htmlSanitized', 'htmlSanitized']);
    expect(fixture.request.candidate.metadata).to.deep.equal({
      description: dirtyDescription,
      notes: dirtyNotes,
    });
  });

  it('fails closed when a validator supplies an unsafe rich-html replacement for the matching source', async function () {
    const dirtyHtml = '<p>Safe</p><img src="x" onerror="alert(1)">';
    const form = validationForm({
      validationGroups: {
        ...validationForm().validationGroups,
        advisory: { description: 'advisory', initialMembership: 'none' },
      },
      componentDefinitions: [suggestedSummary(['advisory']) as never],
    });

    for (const mode of ['shadow', 'enforce'] as const) {
      for (const pass of ['blocking', 'advisory'] as const) {
        configure(mode);
        const fixture = createRecordValidationFixture({
          form,
          candidate: { metadata: { description: dirtyHtml } },
        });
        fixture.dependencies.collectTransformations = async () => [];
        fixture.dependencies.executeValidators = async (_form, groups) => ({
          summaries: [],
          transformations: pass === 'blocking' || groups.includes('advisory')
            ? [richHtmlTransformation(dirtyHtml, dirtyHtml)]
            : [],
        });

        const result = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);

        expect(result, `${mode}/${pass}`).to.deep.include({ status: 'unresolved', shouldBlock: true });
        expect(result.transformedCandidate?.metadata.description, `${mode}/${pass}`).to.equal(dirtyHtml);
        expect(codes(result), `${mode}/${pass}`)
          .to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.transformationInapplicable);
      }
    }
  });

  it('retains validator-pass sanitation when a synchronous overrun becomes a shadow timeout', async function () {
    configure('shadow');
    (global as any).sails.config.recordValidation.timeoutMs = 5;
    const dirtyHtml = '<p>Safe</p><script>alert(1)</script>';
    const fixture = createRecordValidationFixture({ candidate: { metadata: { description: dirtyHtml } } });
    fixture.dependencies.collectTransformations = async () => [];
    fixture.dependencies.executeValidators = async () => {
      const stopAt = performance.now() + 20;
      while (performance.now() < stopAt) {
        // Force the shared deadline check to classify the completed pass as timed out.
      }
      return {
        summaries: [],
        transformations: [richHtmlTransformation(dirtyHtml, '<p>Safe</p>')],
      };
    };

    const result = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);

    expect(result).to.deep.include({ status: 'unresolved', shouldBlock: false });
    expect(result.transformedCandidate?.metadata.description).to.equal('<p>Safe</p>');
    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingTimeout);
  });

  it('fails closed when a validator pass returns a stale transformation for an already-sanitized path', async function () {
    const dirtyHtml = '<p>Safe</p><script>alert(1)</script>';
    for (const mode of ['shadow', 'enforce'] as const) {
      configure(mode);
      const fixture = createRecordValidationFixture({ candidate: { metadata: { description: dirtyHtml } } });
      fixture.dependencies.collectTransformations = async () => [
        richHtmlTransformation(dirtyHtml, '<p>Safe</p>'),
      ];
      fixture.dependencies.executeValidators = async () => ({
        summaries: [],
        transformations: [richHtmlTransformation(dirtyHtml, '<p>Stale replacement</p>')],
      });

      const result = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);

      expect(result, mode).to.deep.include({ status: 'unresolved', shouldBlock: true });
      expect(result.transformedCandidate?.metadata.description, mode).to.equal('<p>Safe</p>');
      expect(codes(result), mode).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.transformationInapplicable);
    }
  });

  it('fails closed on stale or malformed transformation results in every rollout mode', async function () {
    for (const mode of ['shadow', 'enforce'] as const) {
      configure(mode);
      const originalMetadata = { title: 'unchanged', structured: { unsafe: '<script>alert(1)</script>' } };
      const fixture = createRecordValidationFixture({ candidate: { metadata: originalMetadata } });
      fixture.dependencies.collectTransformations = async () => [
        {
          kind: 'rich-html-sanitized',
          dataModelPath: ['removedField'],
          sourceValue: 'removed unsafe value',
          value: 'safe',
          advisorySummary: validatorSummary({
            errors: [{ class: 'htmlSanitized', message: '@validator-warning-html-sanitized', params: {} }],
          }),
        },
        richHtmlTransformation('<script>alert(1)</script>', '', ['structured']),
        { kind: 'future-transformation' } as never,
      ];

      const result = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);

      expect(result, mode).to.deep.include({ status: 'unresolved', shouldBlock: true });
      expect(result.transformedCandidate?.metadata, mode).to.deep.equal(originalMetadata);
      expect(codes(result).filter(code =>
        code === RECORD_VALIDATION_DIAGNOSTIC_CODES.transformationInapplicable
      ), mode).to.have.length(3);
      expect(result.diagnostics.filter(diagnostic =>
        diagnostic.code === RECORD_VALIDATION_DIAGNOSTIC_CODES.transformationInapplicable
      ).every(diagnostic => diagnostic.severity === 'error'), mode).to.equal(true);
      expect(codes(result), mode).not.to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingExecutionFailed);
    }
  });

  it('keeps htmlUnsafe blocking and leaves the candidate unchanged in reject mode', async function () {
    configure('enforce');
    (global as any).sails.config.record = { form: { htmlSanitizationMode: 'reject' } };
    (global as any).sails.config.validators = { definitions: formValidatorsSharedDefinitions };
    const dirtyHtml = '<p>Unsafe</p><script>alert(1)</script>';
    const form = validationForm({
      componentDefinitions: [{
        name: 'description',
        component: { class: 'RichTextEditorComponent' },
        model: { class: 'RichTextEditorModel' },
      } as never],
    });
    const fixture = createRecordValidationFixture({ form, candidate: { metadata: { description: dirtyHtml } } });
    const { constructForm: _construct, executeValidators: _execute, ...productionDependencies } = fixture.dependencies;

    const result = requireResolved(
      await new Services.RecordValidation(productionDependencies, fixture.metrics).resolve(fixture.request)
    );

    expect(result.shouldBlock).to.equal(true);
    expect(result.blockingErrors.map(issue => issue.class)).to.deep.equal(['htmlUnsafe']);
    expect(result.advisoryErrors).to.deep.equal([]);
    expect(result.transformedCandidate.metadata.description).to.equal(dirtyHtml);
    expect(fixture.request.candidate.metadata.description).to.equal(dirtyHtml);
  });

  it('keeps advisory-only validators out of omitted and empty-operation strict-all blocking passes', async function () {
    (global as any).sails.config.validators = { definitions: formValidatorsSharedDefinitions };
    const form = validationForm({
      validationGroups: {
        all: { description: 'all', initialMembership: 'none' },
        none: { description: 'none', initialMembership: 'none' },
        base: { description: 'base', initialMembership: 'none' },
        advisory: { description: 'advisory', initialMembership: 'none' },
      },
      validationOperations: { submit: { enabledValidationGroups: [] } },
      componentDefinitions: [
        {
          name: 'blockingTitle',
          component: { class: 'SimpleInputComponent' },
          model: {
            class: 'SimpleInputModel',
            config: { validators: [{ class: 'required', groups: { include: ['base'] } }] },
          },
        } as never,
        {
          name: 'advisoryDescription',
          component: { class: 'SimpleInputComponent' },
          model: {
            class: 'SimpleInputModel',
            config: { validators: [{ class: 'required', groups: { include: ['advisory'] } }] },
          },
        } as never,
        suggestedSummary(['advisory']) as never,
      ],
    });
    const fixture = createRecordValidationFixture({ form, candidate: { metadata: {} } });
    const { constructForm: _construct, executeValidators: _execute, ...productionDependencies } = fixture.dependencies;
    const service = new Services.RecordValidation(productionDependencies);

    for (const validationOperation of [undefined, 'submit']) {
      const result = requireResolved(await service.resolve({ ...fixture.request, validationOperation }));
      expect(result.effectiveGroups).to.deep.equal([]);
      expect(result.blockingErrors.map(issue => issue.field)).to.deep.equal(['blockingTitle']);
      expect(result.advisoryErrors.map(issue => issue.field)).to.deep.equal(['advisoryDescription']);
      expect(codes(result)).not.to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.validationGroupOverlap);
    }
  });

  it('rejects initial-all advisory configuration without suppressing strict-all blocking validators', async function () {
    configure('enforce');
    (global as any).sails.config.validators = { definitions: formValidatorsSharedDefinitions };
    const form = validationForm({
      validationGroups: {
        all: { description: 'all', initialMembership: 'all' },
        none: { description: 'none', initialMembership: 'none' },
        base: { description: 'base', initialMembership: 'none' },
        advisory: { description: 'malformed advisory', initialMembership: 'all' },
      },
      componentDefinitions: [
        {
          name: 'title',
          component: { class: 'SimpleInputComponent' },
          model: { class: 'SimpleInputModel', config: { validators: [{ class: 'required' }] } },
        } as never,
        suggestedSummary(['advisory']) as never,
      ],
    });
    const fixture = createRecordValidationFixture({ form, candidate: { metadata: { title: '' } } });
    fixture.dependencies.executeValidators = async (_form, groups, _mapping, _factory, excludedGroups) => {
      expect(groups).to.deep.equal([]);
      expect(excludedGroups).to.deep.equal([]);
      return validatorExecution([validatorSummary({
        id: 'title',
        errors: [{ class: 'required', message: '@validator-error-required', params: {} }],
      })]);
    };

    const result = requireResolved(
      await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request)
    );

    expect(result.blockingErrors.map(issue => issue.class)).to.deep.equal(['required']);
    expect(result.advisoryGroups).to.deep.equal([]);
    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryConfigurationMalformed);
    expect(result.shouldBlock).to.equal(true);
  });

  it('maps summaries to bounded safe issues while preserving nested lineage and targets', async function () {
    configure('enforce');
    const fixture = createRecordValidationFixture();
    fixture.dependencies.executeValidators = async () => validatorExecution([
      validatorSummary({
        errors: [
          {
            class: 'required',
            message: 'unsafe raw validator output: secret-record-value',
            params: { safe: 'yes', nested: { secret: 'raw-value' } as never },
            targetField: { angularComponents: ['contributors', 0, 'name'] },
          },
        ],
      }),
    ]);
    const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request));

    expect(result.shouldBlock).to.equal(true);
    expect(result.blockingErrors).to.deep.equal([
      {
        message: '@validator-error-record-validation',
        field: 'contributors',
        pointer: '/contributors/0/name',
        class: 'required',
        targetField: { angularComponents: ['contributors', 0, 'name'] },
        lineagePaths: validatorSummary().lineagePaths,
      },
    ]);
    expect(JSON.stringify(result)).not.to.match(/secret-record-value|raw-value/);
  });

  it('aggregates bounded validator failure identity without submitted values', async function () {
    const fixture = createRecordValidationFixture({
      candidate: { metadata: { contributors: [{ name: 'private submitted value' }] } },
    });
    fixture.dependencies.executeValidators = async () => validatorExecution([validatorSummary()]);
    const service = new Services.RecordValidation(fixture.dependencies, fixture.metrics);

    await service.resolve(fixture.request);

    expect(fixture.metricEvents[0].diagnosticIdentities).to.deep.include({
      code: 'record-validation-validator-failure',
      scope: 'blocking-validator',
      validatorClass: 'required',
      validatorCode: 'validator-error-required',
      field: 'contributors',
      pointer: '/contributors/*/name',
      lineage: 'formConfig=/componentDefinitions/*/component/config/elementTemplate|dataModel=/contributors/*/name|angularComponents=/contributors/*/name|layout=/contributors-layout/*/name-layout',
    });
    const validatorRow = service.getShadowReport().rows.find(row =>
      row.code === 'record-validation-validator-failure' && row.scope === 'blocking-validator'
    );
    expect(validatorRow).to.deep.include({
      recordType: 'dataset',
      operation: 'strict-all',
      writeKind: 'update',
      phase: 'pre-save',
      formName: 'dataset-2.4-draft',
      code: 'record-validation-validator-failure',
      scope: 'blocking-validator',
      validatorClass: 'required',
      validatorCode: 'validator-error-required',
      field: 'contributors',
      pointer: '/contributors/*/name',
      lineage: 'formConfig=/componentDefinitions/*/component/config/elementTemplate|dataModel=/contributors/*/name|angularComponents=/contributors/*/name|layout=/contributors-layout/*/name-layout',
      runs: 1,
      wouldReject: 1,
      blockingErrors: 1,
      advisoryErrors: 0,
      timeouts: 0,
      configurationDiagnostics: 0,
    });
    expect(JSON.stringify({ metric: fixture.metricEvents, report: service.getShadowReport() }))
      .not.to.include('private submitted value');
  });

  it('diagnoses overlap safely and fails closed only in enforce mode', async function () {
    const form = validationForm({
      validationGroups: {
        ...validationForm().validationGroups,
        base: { description: 'base', initialMembership: 'none' },
      },
      componentDefinitions: [suggestedSummary(['base']) as never],
      validationOperations: { submit: { enabledValidationGroups: ['base'] } },
    });
    const shadow = createRecordValidationFixture({ form });
    const shadowResult = requireResolved(
      await new Services.RecordValidation(shadow.dependencies).resolve({
        ...shadow.request,
        validationOperation: 'submit',
      })
    );
    expect(codes(shadowResult)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.validationGroupOverlap);
    expect(shadowResult.shouldBlock).to.equal(false);

    configure('enforce');
    const enforce = createRecordValidationFixture({ form });
    const enforceResult = requireResolved(
      await new Services.RecordValidation(enforce.dependencies).resolve({
        ...enforce.request,
        validationOperation: 'submit',
      })
    );
    expect(enforceResult.shouldBlock).to.equal(true);
  });

  it('fails closed on malformed and unknown advisory configuration only in enforce mode', async function () {
    const form = validationForm({
      componentDefinitions: [
        suggestedSummary('private-malformed-value') as never,
        suggestedSummary(['missing']) as never,
      ],
    });
    for (const mode of ['shadow', 'enforce'] as const) {
      configure(mode);
      const fixture = createRecordValidationFixture({ form });
      const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request));

      expect(result.shouldBlock, mode).to.equal(mode === 'enforce');
      expect(result.advisoryGroups, mode).to.deep.equal([]);
      expect(codes(result), mode).to.include.members([
        RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryConfigurationMalformed,
        RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryGroupUnknown,
      ]);
      expect(result.diagnostics.filter(diagnostic =>
        diagnostic.code === RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryConfigurationMalformed ||
        diagnostic.code === RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryGroupUnknown
      ).every(diagnostic => diagnostic.severity === 'error'), mode).to.equal(true);
      expect(JSON.stringify(result.diagnostics), mode).not.to.contain('private-malformed-value');
    }
  });

  it('keeps advisory exceptions diagnostic-only and never returns advisory issues as blockers', async function () {
    configure('enforce');
    const form = validationForm({
      validationGroups: {
        ...validationForm().validationGroups,
        advisory: { description: 'advisory', initialMembership: 'none' },
      },
      componentDefinitions: [suggestedSummary(['advisory']) as never],
      validationOperations: { submit: { enabledValidationGroups: ['base'] } },
    });
    const fixture = createRecordValidationFixture({ form });
    fixture.dependencies.executeValidators = async (_form, groups) => {
      if (groups.includes('advisory')) throw new Error('private downstream request and record value');
      return validatorExecution();
    };
    const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve({
      ...fixture.request,
      validationOperation: 'submit',
    }));
    expect(result.shouldBlock).to.equal(false);
    expect(result.advisoryErrors).to.deep.equal([]);
    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryExecutionFailed);
    expect(result.diagnostics.find(diagnostic =>
      diagnostic.code === RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryExecutionFailed
    )?.severity).to.equal('warning');
    expect(JSON.stringify(result)).not.to.match(/private downstream|record value/);
  });

  it('classifies malformed advisory-only JSONata as a nonblocking advisory execution warning', async function () {
    configure('enforce');
    (global as any).sails.config.validators = { definitions: formValidatorsSharedDefinitions };
    const form = validationForm({
      validationGroups: {
        all: { description: 'all', initialMembership: 'none' },
        none: { description: 'none', initialMembership: 'none' },
        base: { description: 'base', initialMembership: 'none' },
        advisory: { description: 'advisory', initialMembership: 'none' },
      },
      componentDefinitions: [
        {
          name: 'advisoryExpression',
          component: { class: 'SimpleInputComponent' },
          model: {
            class: 'SimpleInputModel',
            config: {
              validators: [{
                class: 'jsonata-expression',
                groups: { include: ['advisory'] },
                config: { expression: ')' },
              }],
            },
          },
        } as never,
        suggestedSummary(['advisory']) as never,
      ],
      validationOperations: { submit: { enabledValidationGroups: ['base'] } },
    });
    const fixture = createRecordValidationFixture({
      form,
      candidate: { metadata: { advisoryExpression: 'private value' } },
    });
    const { constructForm: _construct, executeValidators: _execute, ...productionDependencies } =
      fixture.dependencies;

    const result = requireResolved(
      await new Services.RecordValidation(productionDependencies, fixture.metrics).resolve({
        ...fixture.request,
        validationOperation: 'submit',
      })
    );

    expect(result.shouldBlock).to.equal(false);
    expect(result.blockingErrors).to.deep.equal([]);
    expect(result.advisoryErrors).to.deep.equal([]);
    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryExecutionFailed);
    expect(codes(result)).not.to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingExecutionFailed);
    expect(result.diagnostics.find(diagnostic =>
      diagnostic.code === RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryExecutionFailed
    )?.severity).to.equal('warning');
    expect(fixture.metricEvents[0]).to.deep.include({
      outcome: 'valid',
      timeoutKind: 'none',
      wouldBlock: false,
    });
    expect(JSON.stringify(result.diagnostics)).not.to.include('private value');
  });

  it('applies one configured timeout to blocking execution and classifies it by mode', async function () {
    configure('enforce');
    (
      global as unknown as { sails: { config: { recordValidation: { timeoutMs: number } } } }
    ).sails.config.recordValidation.timeoutMs = 10;
    const fixture = createRecordValidationFixture();
    fixture.dependencies.executeValidators = async () => await new Promise(() => undefined);
    const enforce = await new Services.RecordValidation(fixture.dependencies, fixture.metrics).resolve(fixture.request);
    expect(enforce).to.deep.include({ status: 'unresolved', shouldBlock: true });
    expect(codes(enforce)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingTimeout);
    expect(fixture.metricEvents[0]).to.deep.include({
      outcome: 'timed-out',
      timeoutKind: 'blocking',
      wouldBlock: true,
      configurationDiagnosticCount: 0,
    });

    configure('shadow');
    (
      global as unknown as { sails: { config: { recordValidation: { timeoutMs: number } } } }
    ).sails.config.recordValidation.timeoutMs = 10;
    const shadowFixture = createRecordValidationFixture();
    shadowFixture.dependencies.executeValidators = fixture.dependencies.executeValidators;
    const shadow = await new Services.RecordValidation(shadowFixture.dependencies, shadowFixture.metrics).resolve(
      shadowFixture.request
    );
    expect(shadow).to.deep.include({ status: 'unresolved', shouldBlock: false });
    expect(shadowFixture.metricEvents[0]).to.deep.include({
      outcome: 'timed-out',
      timeoutKind: 'blocking',
      wouldBlock: true,
    });
  });

  it('classifies synchronous event-loop overruns against the shared wall-clock deadline', async function () {
    configure('enforce');
    (global as any).sails.config.recordValidation.timeoutMs = 5;
    const fixture = createRecordValidationFixture();
    fixture.dependencies.executeValidators = async () => {
      const stopAt = performance.now() + 20;
      while (performance.now() < stopAt) {
        // Deliberately occupy the event loop so a timer callback cannot win.
      }
      return validatorExecution();
    };

    const result = await new Services.RecordValidation(fixture.dependencies, fixture.metrics).resolve(fixture.request);

    expect(result).to.deep.include({ status: 'unresolved', shouldBlock: true });
    expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingTimeout);
    expect(fixture.metricEvents[0]).to.deep.include({ outcome: 'timed-out', timeoutKind: 'blocking' });
  });

  it('keeps advisory timeout diagnostic-only and absorbs a late rejection', async function () {
    configure('enforce');
    (
      global as unknown as { sails: { config: { recordValidation: { timeoutMs: number } } } }
    ).sails.config.recordValidation.timeoutMs = 10;
    const form = validationForm({
      validationGroups: {
        ...validationForm().validationGroups,
        advisory: { description: 'advisory', initialMembership: 'none' },
      },
      componentDefinitions: [suggestedSummary(['advisory']) as never],
      validationOperations: { submit: { enabledValidationGroups: ['base'] } },
    });
    const fixture = createRecordValidationFixture({ form });
    fixture.dependencies.executeValidators = async (_form, groups) => {
      if (!groups.includes('advisory')) return validatorExecution();
      return await new Promise<ReturnType<typeof validatorExecution>>((_resolve, reject) =>
        setTimeout(() => reject(new Error('late private advisory failure')), 25)
      );
    };
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', listener);
    try {
      const result = requireResolved(
        await new Services.RecordValidation(fixture.dependencies, fixture.metrics).resolve({
          ...fixture.request,
          validationOperation: 'submit',
        })
      );
      expect(result.shouldBlock).to.equal(false);
      expect(codes(result)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryTimeout);
      expect(result.diagnostics.find(diagnostic =>
        diagnostic.code === RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryTimeout
      )?.severity).to.equal('warning');
      expect(fixture.metricEvents[0]).to.deep.include({
        outcome: 'valid',
        timeoutKind: 'advisory',
        wouldBlock: false,
      });
      await new Promise(resolve => setTimeout(resolve, 35));
      expect(unhandled).to.deep.equal([]);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });

  it('caches effective construction while invalidating changed same-name form configuration', async function () {
    const expression = {
      name: 'conditional',
      config: {
        target: 'form.enabledValidationGroups',
        conditionKind: 'jsonata',
        condition: 'formData.activate',
        template: '{"initial":"current"}',
      },
    };
    const form = validationForm({ componentDefinitions: [{ name: 'field', expressions: [expression] } as never] });
    const fixture = createRecordValidationFixture({ form });
    const service = new Services.RecordValidation(fixture.dependencies);
    const first = requireResolved(await service.resolve(fixture.request));
    const second = requireResolved(
      await service.resolve({
        ...fixture.request,
        candidate: { ...fixture.request.candidate, metadata: { title: 'different request data', activate: true } },
      })
    );
    expect(first.resolved.conditionalGroups).to.deep.equal(['base']);
    expect(second.resolved.conditionalGroups).to.deep.equal(['base']);
    expect(service.getCacheStats()).to.deep.equal({ formDefinitions: 1, compiledExpressions: 2, validatorMappings: 1 });
    expect(fixture.calls.forms).to.have.length(2);
    expect(fixture.calls.constructions).to.equal(1);

    expression.config.template = '{"groups":{"include":["conditional"]}}';
    const changed = requireResolved(await service.resolve(fixture.request));
    expect(changed.resolved.conditionalGroups).to.deep.equal(['base', 'conditional']);
    expect(fixture.calls.forms).to.have.length(3);
    expect(fixture.calls.constructions).to.equal(2);
    service.clearCaches();
    expect(service.getCacheStats()).to.deep.equal({ formDefinitions: 0, compiledExpressions: 0, validatorMappings: 0 });
  });

  it('does not let an older concurrent form load replace a newer exact form snapshot', async function () {
    const oldForm = validationForm({ componentDefinitions: [{ name: 'old-version' } as never] });
    const newForm = validationForm({ componentDefinitions: [{ name: 'new-version' } as never] });
    const fixture = createRecordValidationFixture({ form: newForm });
    let releaseOld: (() => void) | undefined;
    const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
    let loadCount = 0;
    fixture.dependencies.loadForm = async (formName, brand) => {
      fixture.calls.forms.push({ formName, brand });
      loadCount += 1;
      const selected = loadCount === 1 ? oldForm : newForm;
      if (loadCount === 1) await oldGate;
      return {
        id: `form-${formName}`,
        name: formName,
        branding: brand,
        configuration: selected,
      } as never;
    };
    const service = new Services.RecordValidation(fixture.dependencies);

    const older = service.resolve(fixture.request);
    await Promise.resolve();
    const newer = await service.resolve(fixture.request);
    releaseOld?.();
    const oldResult = requireResolved(await older);
    const newest = requireResolved(await service.resolve(fixture.request));

    expect(requireResolved(newer).resolved.constructedForm.componentDefinitions?.[0].name).to.equal('new-version');
    expect(oldResult.resolved.constructedForm.componentDefinitions?.[0].name).to.equal('old-version');
    expect(newest.resolved.constructedForm.componentDefinitions?.[0].name).to.equal('new-version');
    expect(fixture.calls.constructions).to.equal(2);
  });

  it('invalidates constructed forms when reusable definitions change and reconstructs candidate-sensitive forms', async function () {
    (global as any).sails.config.reusableFormDefinitions = { shared: { name: 'first' } };
    const reusableFixture = createRecordValidationFixture();
    const reusableService = new Services.RecordValidation(reusableFixture.dependencies);
    await reusableService.resolve(reusableFixture.request);
    await reusableService.resolve(reusableFixture.request);
    expect(reusableFixture.calls.constructions).to.equal(1);

    (global as any).sails.config.reusableFormDefinitions = { shared: { name: 'second' } };
    await reusableService.resolve(reusableFixture.request);
    expect(reusableFixture.calls.constructions).to.equal(2);

    const questionTreeFixture = createRecordValidationFixture({
      form: validationForm({
        componentDefinitions: [
          { name: 'candidate-sensitive', component: { class: 'QuestionTreeComponent' } } as never,
        ],
      }),
    });
    const questionTreeService = new Services.RecordValidation(questionTreeFixture.dependencies);
    await questionTreeService.resolve(questionTreeFixture.request);
    await questionTreeService.resolve({
      ...questionTreeFixture.request,
      candidate: {
        ...questionTreeFixture.request.candidate,
        metadata: { question: 'different candidate content' },
      },
    });
    expect(questionTreeFixture.calls.constructions).to.equal(2);
  });

  it('detects candidate-sensitive QuestionTree components after reusable expansion', async function () {
    const rawForm = validationForm({
      componentDefinitions: [{ name: 'shared-questions', component: { class: 'ReusableComponent' } } as never],
    });
    const fixture = createRecordValidationFixture({ form: rawForm });
    const constructionCandidates: Array<Record<string, unknown>> = [];
    fixture.dependencies.constructForm = async (form, metadata) => {
      fixture.calls.constructions += 1;
      constructionCandidates.push(structuredClone(metadata));
      return {
        ...form,
        componentDefinitions: [
          { name: 'expanded-questions', component: { class: 'QuestionTreeComponent' } },
        ],
      } as never;
    };
    const service = new Services.RecordValidation(fixture.dependencies);

    await service.resolve(fixture.request);
    await service.resolve({
      ...fixture.request,
      candidate: {
        ...fixture.request.candidate,
        metadata: { question: 'second candidate' },
      },
    });

    expect(fixture.calls.constructions).to.equal(3);
    expect(constructionCandidates[0]).to.deep.equal({});
    expect(constructionCandidates[1]).to.deep.equal(fixture.request.candidate.metadata);
    expect(constructionCandidates[2]).to.deep.equal({ question: 'second candidate' });
  });

  it('invalidates validator mappings when definitions change and keeps every cache bounded', async function () {
    (global as unknown as { sails: { config: Record<string, unknown> } }).sails.config.validators = {
      definitions: formValidatorsSharedDefinitions,
    };
    const expression = {
      name: 'conditional',
      config: {
        target: 'form.enabledValidationGroups',
        conditionKind: 'jsonata',
        condition: 'formData.activate',
        template: '{"initial":"current"}',
      },
    };
    const form = validationForm({ componentDefinitions: [
      { name: 'field', expressions: [expression] } as never,
      { name: 'candidate-sensitive', component: { class: 'QuestionTreeComponent' } } as never,
    ] });
    const fixture = createRecordValidationFixture({ form });
    const service = new Services.RecordValidation(fixture.dependencies);
    expect((await service.resolve(fixture.request)).status).to.equal('resolved');

    const firstDefinition = formValidatorsSharedDefinitions[0];
    (global as unknown as { sails: { config: Record<string, unknown> } }).sails.config.validators = {
      definitions: [firstDefinition, firstDefinition],
    };
    const invalidated = await service.resolve(fixture.request);
    expect(invalidated.status).to.equal('unresolved');
    expect(codes(invalidated)).to.include(RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingExecutionFailed);

    (global as unknown as { sails: { config: Record<string, unknown> } }).sails.config.validators = {
      definitions: formValidatorsSharedDefinitions,
    };
    for (let index = 0; index < 140; index += 1) {
      expression.config.template = `{"initial":"current","groups":{"include":${index % 2 ? '["conditional"]' : '[]'}},"nonce":${index}}`;
      await service.resolve(fixture.request);
    }
    const stats = service.getCacheStats();
    expect(stats.formDefinitions).to.be.at.most(128);
    expect(stats.compiledExpressions).to.be.at.most(128);
    expect(stats.validatorMappings).to.be.at.most(128);
  });

  it('never caches validation results or request/user data', async function () {
    let runs = 0;
    const fixture = createRecordValidationFixture();
    fixture.dependencies.executeValidators = async () => {
      runs += 1;
      return validatorExecution(runs === 1 ? [validatorSummary()] : []);
    };
    const service = new Services.RecordValidation(fixture.dependencies);
    const first = requireResolved(await service.resolve(fixture.request));
    const second = requireResolved(
      await service.resolve({
        ...fixture.request,
        actor: { authenticated: true, roles: ['DifferentRole'] },
        candidate: { ...fixture.request.candidate, metadata: { title: 'private second value' } },
      })
    );
    expect(runs).to.equal(2);
    expect(first.blockingErrors).to.have.length(1);
    expect(second.blockingErrors).to.deep.equal([]);
    expect(JSON.stringify(service.getCacheStats())).not.to.match(/private|DifferentRole/);
  });
});
