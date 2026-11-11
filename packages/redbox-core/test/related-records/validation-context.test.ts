import assert from 'node:assert/strict';
import { cloneDeep } from 'lodash';
import { formValidatorsSharedDefinitions } from '@researchdatabox/sails-ng-common';
import type { RelatedMetadataRequest } from '@researchdatabox/sails-ng-common';
import { Services } from '../../src/services/RecordValidationService';
import { Services as RecordServices } from '../../src/services/RecordsService';
import { normalizeDisplayWrites } from '../../src/related-records/normalize-display-writes';
import { buildResolvedRecordValidationResult } from '../fixtures/record-validation.fixtures';
import type { RecordValidationRequest, RecordValidationResult } from '../../src/services/RecordValidationService';
import { resolveRelatedMetadata } from '../../src/related-records/resolver';
import type { RecordModel } from '../../src/model';
import type { RelatedRecordReadContext } from '../../src/related-records/types';
import type { RecordRelation } from '../../src/config/recordtype.config';
import { createRecordValidationFixture, validationForm } from '../fixtures/record-validation.fixtures';
import { createRelatedRecordsFixtures } from '../fixtures/related-records.fixtures';
import { createMockSails } from '../services/testHelper';

const relationId = 'primary-activity';
const selection = (required = false): RelatedMetadataRequest => ({ relations: [{ relationId, required }] });
function resolved(result: RecordValidationResult) {
  assert.equal(result.status, 'resolved', JSON.stringify(result.diagnostics));
  if (result.status !== 'resolved') throw new Error('Expected resolved validation');
  return result;
}

describe('validation operation related context', () => {
  let priorSails: unknown;
  beforeEach(() => {
    priorSails = (global as any).sails;
    (global as any).sails = createMockSails();
    (global as any).sails.config.recordValidation = { mode: 'enforce', timeoutMs: 5000 };
    (global as any).sails.config.validators = { definitions: formValidatorsSharedDefinitions };
  });
  afterEach(() => { (global as any).sails = priorSails; });

  function fixture(required = false) {
    const data = createRelatedRecordsFixtures();
    const form = validationForm({ validationOperations: {
      submit: { enabledValidationGroups: ['submit'], relatedMetadata: selection(required) },
    } });
    const validation = createRecordValidationFixture({ form, candidate: { metadata: cloneDeep(data.root.metadata) } });
    const context: RelatedRecordReadContext = {
      brand: { id: 'brand-1' } as never, user: data.users.reader as never, audience: 'api',
    };
    const reads: string[] = [];
    let resolutions = 0;
    validation.dependencies.resolveRelatedMetadata = async (candidate, actualContext, request) => {
      resolutions++;
      assert.equal(actualContext, context);
      return resolveRelatedMetadata(candidate as unknown as RecordModel, actualContext, request, {
        storage: { getMeta: async oid => {
          reads.push(oid);
          const record = data.activeRecords.find(item => item.redboxOid === oid);
          return record ? { ...cloneDeep(record), metaMetadata: { ...record.metaMetadata,
            brandId: record === data.crossTenant ? 'other' : 'brand-1' } } as unknown as RecordModel : null as never;
        } },
        relations: async () => [{ ...data.relations[0], resolution: { metadataFields: ['/title'] } }] as RecordRelation[],
        authorizeRoot: async () => true,
        canRead: source => source.authorization.view.includes(actualContext.user.username),
        sourceMetadata: async source => source.metadata,
      });
    };
    const request: RecordValidationRequest = { ...validation.request, validationOperation: 'submit', relatedReadContext: context };
    return { ...validation, data, context, reads, request, resolutions: () => resolutions };
  }

  it('follows unsaved references and current sources, preserving metadata and existing record context', async () => {
    const f = fixture();
    const candidate = { ...f.request.candidate, metadata: { ...f.request.candidate.metadata, primaryActivity: f.data.ids.activityB } };
    const observed: unknown[] = [];
    f.dependencies.executeValidators = async (_form, groups, _mapping, evaluator) => {
      assert.deepEqual(groups, ['submit']);
      const input = { record: candidate.metadata, value: 'local control' };
      observed.push(await evaluator('{"title": $relatedMetadata.`primary-activity`.records[0].metadata.title, "local": record.title, "value": value, "bound": $relatedMetadata.`primary-activity`.status}')(input));
      assert.deepEqual(input, { record: candidate.metadata, value: 'local control' });
      assert.equal(await evaluator('$count($keys($))')(candidate.metadata), Object.keys(candidate.metadata).length);
      return { summaries: [], transformations: [] };
    };
    const service = new Services.RecordValidation(f.dependencies);
    const first = resolved(await service.resolve({ ...f.request, candidate }));
    assert.equal(first.shouldBlock, false);
    assert.deepEqual(first.transformedCandidate.metadata, candidate.metadata);
    assert.ok(!('relatedMetadata' in first.transformedCandidate));
    const view = first.resolved.expressionContext!.relatedMetadata!;
    assert.ok(Object.isFrozen(view[relationId].records[0].metadata));
    assert.throws(() => { (view[relationId].records[0].metadata as any).title = 'mutated'; }, TypeError);
    f.data.activityB.metadata.title = 'Current title';
    resolved(await service.resolve({ ...f.request, candidate }));
    assert.deepEqual(JSON.parse(JSON.stringify(observed)), [
      { title: 'Activity B', local: 'Local plan title', value: 'local control', bound: 'resolved' },
      { title: 'Current title', local: 'Local plan title', value: 'local control', bound: 'resolved' },
    ]);
    assert.deepEqual(f.reads, [f.data.ids.activityB, f.data.ids.activityB]);
    assert.equal(f.data.root.metadata.primaryActivity, f.data.ids.activityA);
  });

  for (const state of ['missing', 'denied', 'deleted', 'crossTenant', 'empty'] as const) {
    it(`blocks required ${state} before validators even in shadow mode`, async () => {
      (global as any).sails.config.recordValidation.mode = 'shadow';
      const f = fixture(true);
      const candidate = { ...f.request.candidate, metadata: { primaryActivity: state === 'empty' ? '' : f.data.ids[state] } };
      const result = await new Services.RecordValidation(f.dependencies).resolve({ ...f.request, candidate });
      assert.equal(result.shouldBlock, true);
      assert.deepEqual(f.calls.validatorGroups, []);
      assert.ok(!JSON.stringify(result.diagnostics).includes('Private source'));
    });
  }

  it('exposes optional unavailable status and executes selected legacy rules', async () => {
    const f = fixture();
    let calls = 0;
    f.dependencies.executeValidators = async (_form, groups, _mapping, evaluator) => {
      calls++;
      assert.deepEqual(groups, ['submit']);
      assert.equal(await evaluator('$relatedMetadata.`primary-activity`.status = "unavailable"')('scalar control'), true);
      return { summaries: [{ id: 'local', message: '@local', errors: [{ class: 'required', message: '@validator-error-required' }] }], transformations: [] };
    };
    const result = resolved(await new Services.RecordValidation(f.dependencies).resolve({
      ...f.request, candidate: { ...f.request.candidate, metadata: { primaryActivity: f.data.ids.denied } },
    }));
    assert.equal(calls, 1);
    assert.equal(result.shouldBlock, true);
    assert.equal(result.blockingErrors[0].class, 'required');
  });

  it('never manufactures read authority from authenticated Admin or service role names', async () => {
    const f = fixture();
    const result = await new Services.RecordValidation(f.dependencies).resolve({
      ...f.request, relatedReadContext: undefined, actor: { authenticated: true, roles: ['Admin', 'service'] },
    });
    assert.equal(result.shouldBlock, true);
    assert.equal(f.resolutions(), 0);
    assert.deepEqual(f.reads, []);
  });

  it('adds no resolution for legacy operations, strict-all, exempt writes or unauthorized operations', async () => {
    const f = fixture();
    const service = new Services.RecordValidation(f.dependencies);
    resolved(await service.resolve({ ...f.request, validationOperation: undefined }));
    resolved(await service.resolve({ ...f.request, evaluateFormValidators: false }));
    const legacy = createRecordValidationFixture();
    legacy.dependencies.resolveRelatedMetadata = f.dependencies.resolveRelatedMetadata;
    resolved(await new Services.RecordValidation(legacy.dependencies).resolve({ ...legacy.request, validationOperation: 'submit' }));
    f.dependencies.loadForm = async () => ({ name: 'dataset-2.4-draft', branding: 'brand-1', configuration: validationForm({ validationOperations: {
      submit: { enabledValidationGroups: ['submit'], roles: ['Librarian'], relatedMetadata: selection() },
    } }) }) as never;
    assert.equal((await new Services.RecordValidation(f.dependencies).resolve(f.request)).shouldBlock, true);
    assert.equal(f.resolutions(), 0);
    assert.deepEqual(f.reads, []);
  });

  it('inherits and overrides requests through record-type and workflow operation layers', async () => {
    const f = fixture(true);
    f.dependencies.loadRecordType = async () => ({ name: 'dataset', recordValidation: {
      operations: { submit: { relatedMetadata: selection(false) } },
    } });
    const request = { ...f.request, candidate: { ...f.request.candidate, metadata: { primaryActivity: '' } } };
    const result = resolved(await new Services.RecordValidation(f.dependencies).resolve(request));
    assert.equal(result.shouldBlock, false);
    assert.equal(result.resolved.expressionContext!.relatedMetadata![relationId].status, 'empty');
    const draftStep = { name: 'draft', config: { form: 'dataset-2.4-draft',
      recordValidation: { operations: { submit: { relatedMetadata: selection(true) } } },
    } };
    // The stored stage resolves from the step list, with the single-step lookup as fallback.
    f.dependencies.loadWorkflowSteps = async () => [draftStep] as never;
    f.dependencies.loadWorkflowStep = async () => draftStep as never;
    assert.equal((await new Services.RecordValidation(f.dependencies).resolve(request)).shouldBlock, true);
  });

  it('blocks incomplete opted-in validation in shadow mode', async () => {
    (global as any).sails.config.recordValidation.mode = 'shadow';
    const f = fixture();
    f.dependencies.executeValidators = async () => { throw new Error('legacy validator failed'); };
    assert.equal((await new Services.RecordValidation(f.dependencies).resolve(f.request)).shouldBlock, true);
  });

  it('runs production validators with optional related context and unknown dependencies intact', async () => {
    const f = fixture();
    const form = validationForm({ validationOperations: { submit: { enabledValidationGroups: [], relatedMetadata: selection() } },
      componentDefinitions: [{ name: 'title', component: { class: 'SimpleInputComponent' },
        model: { class: 'SimpleInputModel', config: { validators: [
          { class: 'jsonata-expression', config: { expression: '$ = "Local plan title" and $relatedMetadata.`primary-activity`.records[0].metadata.title = "Activity A"' } },
          { class: 'required' },
        ] } },
      } as never],
    });
    f.dependencies.loadForm = async () => ({ name: form.name, branding: 'brand-1', configuration: form }) as never;
    const { constructForm: _construct, executeValidators: _execute, ...production } = f.dependencies;
    const service = new Services.RecordValidation(production);
    assert.equal(resolved(await service.resolve(f.request)).shouldBlock, false);
    const failure = resolved(await service.resolve({ ...f.request, candidate: { ...f.request.candidate,
      metadata: { ...f.request.candidate.metadata, title: '' },
    } }));
    assert.equal(failure.shouldBlock, true);
    assert.ok(failure.blockingErrors.some(error => error.class === 'required'));
  });

  it('shares one frozen result between blocking and advisory validators, including array projections', async () => {
    const f = fixture();
    const form = validationForm({ validationOperations: { submit: { enabledValidationGroups: ['submit'], relatedMetadata: selection() } },
      validationGroups: { ...validationForm().validationGroups, advisory: { initialMembership: 'none' } },
      componentDefinitions: [{ name: 'suggestions', component: { class: 'SuggestedValidationSummaryComponent',
        config: { enabledValidationGroups: ['advisory'] } } } as never],
    });
    f.dependencies.loadForm = async () => ({ name: form.name, branding: 'brand-1', configuration: form }) as never;
    let calls = 0;
    f.dependencies.executeValidators = async (_form, groups, _map, evaluator) => {
      calls++;
      assert.deepEqual(groups, calls === 1 ? ['submit'] : ['advisory']);
      assert.equal(await evaluator('$count($relatedMetadata.`primary-activity`.records)')({}), 1);
      assert.equal(await evaluator('$relatedMetadata.`primary-activity`.records.metadata.title')({}), 'Activity A');
      return { summaries: [], transformations: [] };
    };
    assert.equal(resolved(await new Services.RecordValidation(f.dependencies).resolve(f.request)).shouldBlock, false);
    assert.equal(calls, 2);
    assert.equal(f.resolutions(), 1);
    assert.equal(f.reads.length, 1);
  });

  it('blocks a timed-out opted-in validation in shadow mode', async () => {
    (global as any).sails.config.recordValidation = { mode: 'shadow', timeoutMs: 5 };
    const f = fixture();
    f.dependencies.executeValidators = async () => {
      await new Promise(resolve => setTimeout(resolve, 15));
      return { summaries: [], transformations: [] };
    };
    const result = await new Services.RecordValidation(f.dependencies).resolve(f.request);
    assert.equal(result.shouldBlock, true);
    assert.ok(result.diagnostics.some(item => item.code === 'record-validation-timeout'));
  });

  it('passes the actual save principal and re-normalizes display targets after validator transformations', async () => {
    const service = new RecordServices.Records() as any;
    const f = fixture();
    const user = { username: 'actual-editor', roles: [{ name: 'Researcher' }], customAuthority: 'retained' };
    const brand = { id: 'brand-1', name: 'Actual brand' };
    const candidate = { ...f.request.candidate, metadata: { primaryActivity: 'source', display: 'stored', local: 'new' } };
    const contract = { displayTargets: [{ metadataPointer: '/display', relationId }],
      relations: [{ relationId, referenceTokens: ['primaryActivity'] }], sources: [] };
    let normalizations = 0;
    service.normalizeCandidateDisplay = async (value: any) => {
      normalizations++;
      try {
        normalizeDisplayWrites({ metadata: value.metadata, stored: candidate.metadata, input: cloneDeep(value.metadata), contract });
      } catch {
        return { code: 'related-display-field-not-writable' };
      }
    };
    service.normalizeAuthoritativeCandidateContext = () => true;
    service.hasPublicEditAuthorization = () => true;
    let changed = false;
    service.resolveRecordValidationService = () => ({ resolve: async (request: RecordValidationRequest) => {
      assert.equal(request.relatedReadContext!.user, user);
      assert.equal(request.relatedReadContext!.brand, brand);
      assert.equal(request.relatedReadContext!.audience, 'api');
      return buildResolvedRecordValidationResult(request, { transformedCandidate: { ...request.candidate,
        metadata: { ...request.candidate.metadata, ...(changed ? { display: 'source copy' } : {}) },
      } });
    } });
    const options = { candidate, original: cloneDeep(candidate), user, brand, writeKind: 'update',
      recordType: {}, context: { routeFamily: 'api', validationOperation: 'submit' } };
    const accepted = await service.validateCandidate(options);
    assert.equal(accepted.allowed, true);
    assert.equal(accepted.candidate.metadata.display, 'stored');
    changed = true;
    const blocked = await service.validateCandidate(options);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.problem.code, 'related-display-field-not-writable');
    assert.equal(normalizations, 4);
  });

});
