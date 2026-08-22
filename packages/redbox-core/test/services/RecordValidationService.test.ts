import { ValidatorsSupport, type FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { ServiceExports } from '../../src/services';
import {
  RECORD_VALIDATION_DIAGNOSTIC_CODES,
  Services,
  type RecordValidationRequest,
  type RecordValidationResult,
  type ResolvedRecordValidationResult,
} from '../../src/services/RecordValidationService';
import { createRecordValidationFixture, validationForm } from '../fixtures/record-validation.fixtures';
import { createMockSails } from './testHelper';

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
  expect(result.status).to.equal('resolved');
  if (result.status !== 'resolved') throw new Error('Expected record validation resolution to succeed.');
  return result;
}

function codes(result: { diagnostics: readonly { code: string }[] }): string[] {
  return result.diagnostics.map(item => item.code);
}

describe('RecordValidationService', function () {
  let priorSails: unknown;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  beforeEach(function () {
    priorSails = (global as Record<string, unknown>).sails;
    (global as Record<string, unknown>).sails = createMockSails();
    configure();
  });

  afterEach(function () {
    if (priorSails === undefined) {
      delete (global as Record<string, unknown>).sails;
    } else {
      (global as Record<string, unknown>).sails = priorSails;
    }
  });

  it('is registered through the core service export convention', function () {
    expect(ServiceExports).to.have.property('RecordValidationService');
    expect(ServiceExports.RecordValidationService).to.have.property('resolve').that.is.a('function');
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

  it('resolves the exact starting workflow form for create', async function () {
    const fixture = createRecordValidationFixture();
    const service = new Services.RecordValidation(fixture.dependencies, fixture.metrics);
    const result = await service.resolve({ ...fixture.request, writeKind: 'create' });

    expect(result.status).to.equal('resolved');
    expect(result).not.to.have.property('blockingErrors');
    expect(result).not.to.have.property('advisoryErrors');
    expect(result.formName).to.equal('dataset-2.4-draft');
    expect(fixture.calls.startingSteps).to.equal(1);
    expect(fixture.calls.forms).to.deep.equal([{ formName: 'dataset-2.4-draft', brand: 'brand-1' }]);
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
    expect(operationResult.status).to.equal('unresolved');
    expect(operationResult.shouldBlock).to.equal(true);
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

    configure('enforce');
    const enforce = createRecordValidationFixture();
    enforce.dependencies.loadForm = shadow.dependencies.loadForm;
    const enforceResult = await new Services.RecordValidation(enforce.dependencies, enforce.metrics).resolve(
      enforce.request
    );
    expect(enforceResult).to.deep.include({ status: 'unresolved', shouldBlock: true });
    expect(enforce.metricEvents).to.have.length(1);
  });

  it('uses non-cloneable metadata without letting clone isolation break resolution', async function () {
    const metadata = { title: 'Final title', hookValue: () => 'not-cloneable' };
    const fixture = createRecordValidationFixture({ candidate: { metadata } });
    const result = requireResolved(await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request));
    expect(result.shouldBlock).to.equal(false);
    expect(result.resolved.expressionContext.formData).to.equal(metadata);
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
    expect(resolved.effectiveGroups).to.deep.equal(['base', 'conditional']);
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

  it('uses the authoritative form group fold when operation is omitted', async function () {
    const fixture = createRecordValidationFixture();
    const result = await new Services.RecordValidation(fixture.dependencies).resolve(fixture.request);
    expect(requireResolved(result).effectiveGroups).to.deep.equal(['base']);
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
    const context = requireResolved(result).resolved.expressionContext;

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

  it('uses the server allowlist when caller-side request-parameter narrowing is omitted', async function () {
    const fixture = createRecordValidationFixture();
    const result = requireResolved(
      await new Services.RecordValidation(fixture.dependencies).resolve({
        ...fixture.request,
        requestParameters: { locale: 'en-AU' },
      })
    );
    expect(result.resolved.expressionContext.requestParams).to.deep.equal({ locale: 'en-AU' });
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
    expect(result.resolved.expressionContext.requestParams).to.deep.equal({});
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
    expect(conditionallyResolved.effectiveGroups).to.deep.equal(['conditional']);
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
    expect(result.effectiveGroups).to.deep.equal(['base', 'conditional']);
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
    expect(result.effectiveGroups).to.deep.equal(['conditional']);
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

  it('emits one safe logger/metrics foundation event per resolution', async function () {
    const fixture = createRecordValidationFixture();
    const result = await new Services.RecordValidation(fixture.dependencies, fixture.metrics).resolve({
      ...fixture.request,
      requestParameters: { secret: 'never-observed' },
    });
    expect(result.status).to.equal('resolved');
    expect(fixture.metricEvents).to.have.length(1);
    expect(fixture.metricEvents[0]).to.deep.include({
      requestId: 'request-1',
      recordType: 'dataset',
      formName: 'dataset-2.4-draft',
      mode: 'shadow',
      status: 'resolved',
    });
    expect(JSON.stringify(fixture.metricEvents)).not.to.contain('never-observed');

    const failing = createRecordValidationFixture();
    failing.dependencies.loadForm = async () => null;
    await new Services.RecordValidation(failing.dependencies, failing.metrics).resolve(failing.request);
    expect(failing.metricEvents[0]).to.deep.include({
      recordType: 'dataset',
      formName: 'dataset-2.4-draft',
      status: 'unresolved',
    });
  });

  it('delivers metrics registered through the exported service surface', async function () {
    const fixture = createRecordValidationFixture();
    const exported = new Services.RecordValidation(fixture.dependencies).exports() as {
      resolve(request: RecordValidationRequest): ReturnType<Services.RecordValidation['resolve']>;
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
      resolutionCompleted: metric => secondaryEvents.push(metric),
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
});
