import assert from 'node:assert/strict';
import type { EditorContextSchema } from '@researchdatabox/sails-ng-common';
import { of } from 'rxjs';
import * as sinon from 'sinon';
import { Services, FieldDescriptionError } from '../../src/services/FieldDescriptionsService';
import type { BrandingModel } from '../../src/model';
import type { FormRecordAccessContext } from '../../src/services/FormsService';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

// Real form construction and namespaced hook fixtures are also exercised by EmailSchemaAssist.test.ts.
describe('FieldDescriptionsService', () => {
  const brand = { id: 'a', name: 'brand-a' } as BrandingModel;
  const caller: FormRecordAccessContext = {
    brand,
    user: {
      id: 'author',
      username: 'author',
      type: 'local',
      name: 'Author',
      email: 'author@example.test',
      roles: [{ id: 'author-role', name: 'ReportAuthor' }],
    },
  };
  const document = {
    type: 'object',
    properties: {
      title: { type: 'string', title: 'Title' },
      'hook:project': { type: 'number' },
      dynamic: {},
    },
    required: ['title'],
  };
  let mock: ReturnType<typeof createMockSails>;
  let access: sinon.SinonStub;
  let describe: sinon.SinonStub;
  let getForm: sinon.SinonStub;
  let service: Services.FieldDescriptions;
  beforeEach(() => {
    access = sinon.stub().resolves(true);
    describe = sinon.stub().resolves({ kind: 'resolved', completeness: 'complete', document });
    getForm = sinon
      .stub()
      .resolves({ branding: 'a', configuration: { fields: [{ name: 'fallback', label: 'Fallback' }] } });
    mock = createMockSails({
      config: { recordSchema: { enabled: true } },
      services: {
        recordsservice: { hasCreateAccess: access },
        recordschemaservice: { describeStage: describe },
      },
    });
    setupServiceTestGlobals(mock);
    Object.assign(global, {
      RecordTypesService: {
        get: () => of({ id: 'type-a', name: 'rdmp', branding: 'a' }),
        getAll: () =>
          of([
            { id: 'type-a', name: 'rdmp', branding: 'a' },
            { name: 'secret', branding: 'b' },
          ]),
      },
      WorkflowStepsService: {
        getAllForRecordTypeIncludingHidden: () =>
          of([
            { name: 'draft', starting: true, config: { form: 'form-a' } },
            { name: 'restricted', starting: false, config: { form: 'secret-form' } },
          ]),
      },
      FormsService: { getForm, buildClientFormConfig: async (form: unknown) => form },
    });
    service = new Services.FieldDescriptions();
  });
  afterEach(() => {
    cleanupServiceTestGlobals();
    for (const name of ['RecordTypesService', 'WorkflowStepsService', 'FormsService'])
      Reflect.deleteProperty(global, name);
    sinon.restore();
  });
  const fields = () => service.describeFields(brand, 'rdmp', caller, 'rdmp', 'draft');

  it('filters foreign types and stages by caller access without reading forms or schemas', async () => {
    access.callsFake(async (_brand, _user, _roles, _type, stage) => stage !== 'restricted');
    const result = await service.schemaTargets(brand, caller);
    assert.deepEqual(
      result.recordTypes.map(t => [t.id, t.stages.map(s => s.id)]),
      [['rdmp', ['draft']]]
    );
    sinon.assert.notCalled(getForm);
    sinon.assert.notCalled(describe);
    assert.deepEqual(access.firstCall.args, [brand, caller.user, caller.user.roles, 'rdmp', 'draft']);
  });
  for (const completeness of ['complete', 'partial'])
    it(`returns ${completeness} schema precision and namespaced fields without schema identity`, async () => {
      describe.resolves({ kind: completeness === 'complete' ? 'resolved' : 'partial', completeness, document });
      const result = await fields();
      assert.equal(result.precision, 'record-schema');
      assert.equal(result.completeness, completeness);
      assert.equal(result.fields.find(f => f.path === '[hook:project]')?.type, 'number');
      assert.equal(result.fields.find(f => f.path === 'dynamic')?.type, 'unknown');
      assert.equal(result.fields[0].source, 'record-schema');
      assert.equal(Object.hasOwn(result, 'document'), false);
      assert.equal(Object.hasOwn(result, 'schema'), false);
      assert.deepEqual(describe.firstCall.args[0], {
        brand: 'a',
        branding: 'brand-a',
        portal: 'rdmp',
        recordType: 'rdmp',
        targetStep: 'draft',
        caller,
      });
    });
  it('marks bounded field descriptions partial when the schema tree is deeper than the assistance limit', async () => {
    let nested: EditorContextSchema = { properties: { leaf: { type: 'string' } } };
    for (let depth = 0; depth < 25; depth++) nested = { properties: { nested } };
    describe.resolves({ kind: 'resolved', completeness: 'complete', document: nested });
    const result = await fields();
    assert.equal(result.precision, 'record-schema');
    assert.equal(result.completeness, 'partial');
    assert.equal(
      result.fields.some(field => field.path.endsWith('leaf')),
      false
    );
  });

  it('authorizes disabled-schema form fallback and never invents leaf types', async () => {
    mock.config.recordSchema.enabled = false;
    const result = await fields();
    assert.equal(result.precision, 'form-config');
    assert.equal(result.completeness, 'partial');
    assert.equal(result.fields[0].path, 'fallback');
    assert.equal(result.fields[0].type, 'unknown');
    sinon.assert.calledOnce(access);
    sinon.assert.notCalled(describe);
    access.resolves(false);
    getForm.resetHistory();
    await assert.rejects(fields(), { code: 'FORBIDDEN' });
    sinon.assert.notCalled(getForm);
  });
  it('resolves SCU-style form label keys with the current brand before field search', async () => {
    mock.config.recordSchema.enabled = false;
    getForm.resolves({ branding: 'a', configuration: { fields: [
      { name: 'title', label: '@dmpt-project-title' },
      { name: 'scu_retention', label: 'Literal label' },
      { name: 'missing', label: '@missing-label' },
    ] } });
    const translate = sinon.stub().callsFake((key: string) => key === '@dmpt-project-title' ? 'Project name:' : key);
    const previous = Reflect.get(globalThis, 'TranslationService');
    Reflect.set(globalThis, 'TranslationService', { t: translate });
    try {
      const result = await fields();
      assert.equal(result.fields.find(field => field.path === 'title')?.title, 'Project name:');
      assert.equal(result.fields.find(field => field.path === 'scu_retention')?.title, 'Literal label');
      assert.equal(result.fields.find(field => field.path === 'missing')?.title, '@missing-label');
      assert.deepEqual(translate.firstCall.args, ['@dmpt-project-title', { nsSeparator: false, keySeparator: false }, 'en', 'brand-a']);
    } finally { Reflect.set(globalThis, 'TranslationService', previous); }
  });
  it('resolves literal UoN label keys containing colons and dots without treating them as namespaces', async () => {
    mock.config.recordSchema.enabled = false;
    getForm.resolves({ branding: 'a', configuration: { fields: [
      { name: 'foaf:fundedBy_foaf:Agent', label: '@dmpt-foaf:fundedBy_foaf:Agent' },
      { name: 'license_identifier', label: '@dataPublication-dc:license.dc:identifier' },
      { name: 'missing', label: '@hook:missing.label' },
    ] } });
    const i18next = require('i18next').createInstance();
    await i18next.init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: {
      '@dmpt-foaf:fundedBy_foaf:Agent': 'Funding source',
      '@dataPublication-dc:license.dc:identifier': 'The data will be licenced under',
    } } } });
    const previous = Reflect.get(globalThis, 'TranslationService');
    Reflect.set(globalThis, 'TranslationService', {
      t: (key: string, options: Record<string, unknown>) => i18next.t(key, options),
    });
    try {
      const result = await fields();
      assert.equal(result.fields.find(field => field.path === '[foaf:fundedBy_foaf:Agent]')?.title, 'Funding source');
      assert.equal(result.fields.find(field => field.path === 'license_identifier')?.title, 'The data will be licenced under');
      assert.equal(result.fields.find(field => field.path === 'missing')?.title, '@hook:missing.label');
    } finally { Reflect.set(globalThis, 'TranslationService', previous); }
  });
  for (const outcome of ['forbidden', 'unavailable', 'throws'])
    it(`does not fall back after ${outcome}`, async () => {
      if (outcome === 'throws') describe.rejects(new Error('private config'));
      else describe.resolves({ kind: 'unavailable', code: outcome });
      if (outcome === 'forbidden') await assert.rejects(fields(), { code: 'FORBIDDEN' });
      else assert.equal((await fields()).precision, 'none');
      sinon.assert.notCalled(getForm);
    });
  it('fails closed before configuration reads for a foreign/anonymous caller or failed authorization dependency', async () => {
    await assert.rejects(service.describeFields(brand, 'rdmp', { ...caller, brand: { ...brand, id: 'b' } }, 'rdmp'), {
      code: 'FORBIDDEN',
    });
    await assert.rejects(service.schemaTargets(brand, { ...caller, user: { ...caller.user, username: '' } }), {
      code: 'FORBIDDEN',
    });
    access.rejects(new Error('private authorization failure'));
    await assert.rejects(fields(), FieldDescriptionError);
    sinon.assert.notCalled(describe);
    sinon.assert.notCalled(getForm);
  });
  it('does not reuse descriptions across portal, caller, stage or changed schema', async () => {
    await fields();
    describe.resolves({ kind: 'partial', completeness: 'partial', document: { properties: { changed: {} } } });
    const other = { ...caller, user: { ...caller.user, id: 'other', username: 'other', roles: [] } };
    const result = await service.describeFields(brand, 'other-portal', other, 'rdmp', 'restricted');
    assert.equal(result.fields[0].path, 'changed');
    assert.equal(describe.lastCall.args[0].caller, other);
    assert.equal(describe.lastCall.args[0].portal, 'other-portal');
    assert.equal(describe.lastCall.args[0].targetStep, 'restricted');
  });
});
