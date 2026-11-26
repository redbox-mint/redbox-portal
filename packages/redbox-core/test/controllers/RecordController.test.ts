let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers } from '../../src/controllers/RecordController';
import { Controllers as AsynchControllers } from '../../src/controllers/AsynchController';
import { routes, RouteTargetObject } from '../../src/config/routes.config';
import type { FormConfigFrame, FormRowEdit, FormRowProofs } from '@researchdatabox/sails-ng-common';
import { Services as FormServices } from '../../src/services/FormsService';
import { Services as FormRecordConsistencyServices } from '../../src/services/FormRecordConsistencyService';
import { createMockSails } from '../services/testHelper';

before(async () => {
  expect = (await import('chai')).expect;
});

describe('RecordController update', () => {
  let controller: Controllers.Record;
  let updateMeta: sinon.SinonStub;
  const currentRecord = {
    redboxOid: 'oid-1',
    metaMetadata: { type: 'dataPublication', brandId: 'brand-1', form: 'publication-draft' },
    workflow: { stage: 'draft' },
    metadata: {
      title: 'Draft',
      description: 'Clear this text',
      datatype: 'dataset',
      citation_doi: '10.0000/example',
      adminStatus: 'approved',
      internalNotes: 'Internal',
      details: { summary: 'Before', internalCode: 'private', locked: 'server', conditional: 'before' },
      keywords: ['keep', 'remove'],
      emptied: ['remove'],
      files: [{ fileId: 'old', name: 'old.txt' }],
      contributors: [
        { name: 'First', internalCode: 'first-private' },
        { name: 'Removed', internalCode: 'removed-private' },
        { name: 'Last', source: 'last-private', notes: [{ text: 'Nested', internalCode: 'nested-private' }] },
      ],
      'dc:subject_anzsrc:for': [{ notation: 'https://example.test/123456' }, { notation: 'incomplete' }],
      option: { label: 'Old', value: 'old', historical: true, sourceType: 'vocabulary' },
    },
  };
  const nextStep = { name: 'review' };
  const testGlobals = globalThis as typeof globalThis & Record<string, unknown>;
  const originalGlobals = new Map<string, unknown>();

  const input = (name: string) => ({
    name,
    model: { class: 'SimpleInputModel' as const, config: {} },
    component: { class: 'SimpleInputComponent' as const },
  });
  const adminInput = (name: string) => ({
    ...input(name),
    constraints: { authorization: { allowRoles: ['Admin'] } },
  });
  const conditionalInput = {
    ...input('conditional'),
    model: { class: 'SimpleInputModel' as const, config: { disabled: true } },
    expressions: [{ name: 'toggle', config: { target: 'model.disabled' as const, template: 'false' } }],
  };
  const fundingField = 'foaf:fundedBy_foaf:Agent';
  const fundingSelection = {
    model: { class: 'TypeaheadInputModel' as const },
    component: {
      class: 'TypeaheadInputComponent' as const,
      config: {
        valueMode: 'optionObject' as const,
        optionObjectFields: {
          dc_title: 'dc_title', dc_identifier: 'dc_identifier', dc_description: 'dc_description', ID: 'ID',
        },
      },
    },
  };
  const repeatable = (name: string) => ({
    name,
    model: { class: 'RepeatableModel' as const, config: {} },
    component: { class: 'RepeatableComponent' as const, config: { elementTemplate: input('') } },
  });
  const formConfig: FormConfigFrame = {
    name: 'publication-draft',
    type: 'dataPublication',
    attachmentFields: ['files'],
    componentDefinitions: [
      input('title'),
      input('description'),
      adminInput('adminStatus'),
      { ...input('internalNotes'), constraints: { allowModes: ['view'] } },
      {
        name: 'details',
        model: { class: 'GroupModel', config: {} },
        component: {
          class: 'GroupComponent',
          config: { componentDefinitions: [
            input('summary'),
            adminInput('internalCode'),
            { ...input('locked'), model: { class: 'SimpleInputModel', config: { disabled: true } } },
            repeatable('members'),
            conditionalInput,
          ] },
        },
      },
      {
        name: 'newGroup',
        model: { class: 'GroupModel', config: {} },
        component: {
          class: 'GroupComponent',
          config: { componentDefinitions: [
            input('summary'),
            adminInput('internalCode'),
            {
              ...repeatable('readOnlyRows'),
              component: {
                class: 'RepeatableComponent',
                config: { elementTemplate: {
                  ...input(''),
                  model: { class: 'SimpleInputModel', config: { disabled: true } },
                } },
              },
            },
          ] },
        },
      },
      repeatable('keywords'),
      {
        ...repeatable('displayOnly'),
        component: {
          class: 'RepeatableComponent',
          config: { elementTemplate: {
            ...input(''),
            model: { class: 'SimpleInputModel', config: { disabled: true } },
            layout: { class: 'RepeatableElementLayout', config: { disabled: true } },
          } },
        },
      },
      {
        ...repeatable('displayOnlyGroups'),
        component: {
          class: 'RepeatableComponent',
          config: { elementTemplate: {
            name: '',
            model: { class: 'GroupModel', config: {} },
            component: { class: 'GroupComponent', config: { componentDefinitions: [
              { ...input('name'), model: { class: 'SimpleInputModel', config: { disabled: true } } },
            ] } },
          } },
        },
      },
      {
        ...repeatable('orderedReadOnly'),
        component: {
          class: 'RepeatableComponent',
          config: { allowZeroRows: true, canSort: true, elementTemplate: {
            name: '',
            model: { class: 'GroupModel', config: { disabled: true } },
            component: { class: 'GroupComponent', config: { componentDefinitions: [
              input('name'), adminInput('internalCode'),
            ] } },
          } },
        },
      },
      {
        ...repeatable('nameAndValue'),
        component: {
          class: 'RepeatableComponent',
          config: { elementTemplate: {
            name: '',
            model: { class: 'GroupModel' },
            component: { class: 'GroupComponent', config: { componentDefinitions: [input('name'), input('value')] } },
          } },
        },
      },
      repeatable('emptied'),
      {
        ...repeatable(fundingField),
        component: {
          class: 'RepeatableComponent',
          config: { elementTemplate: { name: '', ...fundingSelection } },
        },
      },
      {
        name: 'files',
        model: { class: 'FileUploadModel', config: {} },
        component: { class: 'FileUploadComponent', config: {} },
      },
      {
        name: 'contributors',
        model: { class: 'RepeatableModel', config: {} },
        component: {
          class: 'RepeatableComponent',
          config: {
            elementTemplate: {
              name: '',
              model: { class: 'GroupModel', config: {} },
              component: {
                class: 'GroupComponent',
                config: { componentDefinitions: [
                  input('name'),
                  input('orcid'),
                  input('email'),
                  input('optionalNote'),
                  adminInput('internalCode'),
                  conditionalInput,
                  { name: 'fundingBody', ...fundingSelection },
                  {
                    name: 'notes',
                    model: { class: 'RepeatableModel', config: {} },
                    component: {
                      class: 'RepeatableComponent',
                      config: {
                        elementTemplate: {
                          name: '',
                          model: { class: 'GroupModel', config: {} },
                          component: {
                            class: 'GroupComponent',
                            config: { componentDefinitions: [input('text'), conditionalInput, adminInput('internalCode'), repeatable('details')] },
                          },
                        },
                      },
                    },
                  },
                ] },
              },
            },
          },
        },
      },
      {
        name: 'option',
        model: { class: 'TypeaheadInputModel', config: {} },
        component: { class: 'TypeaheadInputComponent', config: { valueMode: 'optionObject' } },
      },
    ],
  };

  beforeEach(() => {
    const services = {
      sails: createMockSails({ services: { formpayloadprehydrateservice: { build: sinon.stub().resolves({}) } } }),
      _: require('lodash'),
      BrandingService: {
        getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
        getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      },
      RecordTypesService: { get: sinon.stub().returns(of({ name: 'dataPublication' })) },
      WorkflowStepsService: { get: sinon.stub().withArgs(sinon.match.object, 'review').returns(of(nextStep)) },
      FormsService: new FormServices.Forms(),
      FormRecordConsistencyService: new FormRecordConsistencyServices.FormRecordConsistency(),
      TranslationService: { t: (key: string) => key },
    };
    for (const [name, service] of Object.entries(services)) {
      originalGlobals.set(name, testGlobals[name]);
      testGlobals[name] = service;
    }
    sinon.stub(FormsService, 'getFormByName').returns(of({
      id: 'form-1', name: 'publication-draft', branding: 'brand-1', configuration: formConfig,
    }));

    controller = new Controllers.Record();
    updateMeta = sinon.stub().resolves({ isSuccessful: () => true });
    controller.recordsService = {
      getMeta: sinon.stub().resolves(currentRecord),
      hasEditAccess: sinon.stub().returns(true),
      updateMeta,
    } as unknown as typeof controller.recordsService;
  });

  afterEach(() => {
    sinon.restore();
    for (const [name, original] of originalGlobals) {
      if (original === undefined) {
        delete testGlobals[name];
      } else {
        testGlobals[name] = original;
      }
    }
    originalGlobals.clear();
  });

  function makeRequest(body: Record<string, unknown>, query: Record<string, string>): Sails.Req {
    return {
      body,
      query,
      param: (key: string, fallback?: string) => key === 'oid' ? currentRecord.redboxOid : query[key] ?? fallback,
      session: { branding: 'default' },
      user: { username: 'researcher', roles: [{ name: 'Researcher' }] },
    } as unknown as Sails.Req;
  }

  function makeResponse() {
    const json = sinon.stub();
    const status = sinon.stub();
    const res = { json, set: sinon.stub(), status } as unknown as Sails.Res;
    return { res, json, status };
  }

  async function loadFormForRowEdits() {
    const request = makeRequest({}, { name: 'auto', edit: 'true', rowEdits: 'true', apiVersion: '2.0' });
    const response = makeResponse();
    await controller.getForm(request, response.res);
    const payload = response.json.firstCall.args[0];
    if (!payload.data) throw new Error(JSON.stringify(payload));
    return {
      config: payload.data as FormConfigFrame, proofs: payload.meta.rowProofs as FormRowProofs,
      editableRowPaths: payload.meta.editableRowPaths as string[], session: request.session,
    };
  }

  type LoadedForm = Awaited<ReturnType<typeof loadFormForRowEdits>>;

  async function rowSaveRequest(
    metadata: Record<string, unknown>,
    positions: Record<string, (number | { retain: number } | null)[]>,
    loaded?: LoadedForm
  ) {
    const form = loaded ?? await loadFormForRowEdits();
    const rowEdits = Object.fromEntries(Object.entries(positions).map(([path, entries]) => {
      const sourcePath: (string | number)[] = [];
      const submittedPath: (string | number)[] = [];
      for (const part of JSON.parse(path) as (string | number)[]) {
        const parentPositions = positions[JSON.stringify(submittedPath)];
        const previous = typeof part === 'number' ? parentPositions?.[part] : undefined;
        sourcePath.push(typeof previous === 'number' ? previous : part);
        submittedPath.push(part);
      }
      const proofs = form.proofs[JSON.stringify(sourcePath)];
      return [path, entries.map((entry): FormRowEdit => {
        if (entry === null) return null;
        const source = typeof entry === 'number' ? entry : entry.retain;
        return { source, proof: proofs?.[source] ?? 'invalid', ...(typeof entry === 'object' ? { retain: true } : {}) };
      })];
    }));
    const request = makeRequest({ metadata, rowEdits }, { formSave: 'true', rowEdits: 'true', apiVersion: '2.0' });
    request.session = form.session;
    return request;
  }

  async function loadContributorRows() {
    const { config } = await loadFormForRowEdits();
    const contributors = config.componentDefinitions?.find(field => field.name === 'contributors');
    return contributors?.model?.config?.value as {
      name: string;
      fundingBody?: unknown;
      optionalNote?: string | null;
      notes?: { text: string; conditional?: string }[];
    }[];
  }

  it('loads an edit form with a hydrated publish-data-location header action', async () => {
    const location = { type: 'url', location: 'https://example.test/data' };
    const configuration: FormConfigFrame = {
      ...formConfig,
      componentDefinitions: [{
        name: 'dataLocations',
        model: { class: 'PublishDataLocationSelectorModel' },
        component: {
          class: 'PublishDataLocationSelectorComponent',
          config: { headerActions: [input('refreshLabel')] },
        },
      }],
    };
    (FormsService.getFormByName as sinon.SinonStub).returns(of({
      id: 'form-1', name: 'publication-draft', branding: 'brand-1', configuration,
    }));
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord,
      metadata: { dataLocations: [location], refreshLabel: 'Refresh' },
    });

    const { config } = await loadFormForRowEdits();
    const selector = config.componentDefinitions?.find(field => field.name === 'dataLocations');
    expect(selector?.model?.config?.value).to.deep.equal([location]);
  });

  it('preserves omitted metadata and applies editable changes on a form save with a transition', async () => {
    const { res, json } = makeResponse();
    const files = [{ fileId: 'new', name: 'new.txt' }];
    const req = makeRequest({
      title: 'Edited',
      description: '',
      adminStatus: 'overwritten',
      internalNotes: 'overwritten',
      details: { summary: null, internalCode: 'overwritten', locked: 'overwritten', conditional: 'enabled' },
      newGroup: { summary: 'Added', internalCode: 'forged' },
      keywords: ['keep'],
      emptied: [],
      files,
      option: { label: 'New', value: 'new' },
    }, { formSave: 'true', targetStep: 'review', apiVersion: '2.0' });

    await controller.update(req, res);

    sinon.assert.calledOnceWithExactly(FormsService.getFormByName as sinon.SinonStub, 'publication-draft', true, 'brand-1');
    sinon.assert.calledOnce(updateMeta);
    const [, , record, , preSave, postSave, step, metadata] = updateMeta.firstCall.args;
    expect(record).to.equal(currentRecord);
    expect(preSave).to.be.true;
    expect(postSave).to.be.true;
    expect(step).to.equal(nextStep);
    expect(metadata).to.deep.equal({
      ...currentRecord.metadata,
      title: 'Edited',
      description: '',
      details: { summary: null, internalCode: 'private', locked: 'server', conditional: 'enabled' },
      newGroup: { summary: 'Added' },
      keywords: ['keep'],
      emptied: [],
      files,
      option: { label: 'New', value: 'new' },
    });
    expect(json.firstCall.args[0].data).to.deep.equal({ redboxOid: 'oid-1' });
  });

  it('keeps replacement and explicit merge semantics for other callers', async () => {
    const { res } = makeResponse();
    const body = { title: 'Replacement', keywords: [] };

    await controller.update(makeRequest(body, {}), res);
    await controller.update(makeRequest(body, { merge: 'true' }), res);

    sinon.assert.notCalled(FormsService.getFormByName as sinon.SinonStub);
    expect(updateMeta.firstCall.args[7]).to.deep.equal(body);
    expect(updateMeta.secondCall.args[7]).to.deep.equal({ ...currentRecord.metadata, ...body });
  });

  it('preserves stored-only data when unchanged repeatable rows are reordered or removed', async () => {
    const req = makeRequest({
      contributors: [
        { name: 'Last', notes: [{ text: 'Nested' }] },
        { name: 'First', internalCode: 'forged' },
      ],
    }, { formSave: 'true' });

    await controller.update(req, makeResponse().res);

    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal([
      currentRecord.metadata.contributors[2], currentRecord.metadata.contributors[0],
    ]);
  });

  it('adds a repeatable row when the other rows with stored-only metadata are retained', async () => {
    const contributors = [
      { name: 'First' }, { name: 'Removed' }, { name: 'Last', notes: [{ text: 'Nested' }] }, { name: 'New' },
    ];
    await controller.update(makeRequest({ contributors }, { formSave: 'true' }), makeResponse().res);

    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal([
      ...currentRecord.metadata.contributors, { name: 'New' },
    ]);
  });

  it('edits and adds rows with no stored-only fields and accepts an explicit empty array', async () => {
    const existing = controller.recordsService.getMeta as sinon.SinonStub;
    existing.resolves({ ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [{ name: 'Before' }] } });
    const contributors = [{ name: 'Edited', internalCode: 'forged' }, { name: 'Added' }];
    await controller.update(makeRequest({ contributors }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal([{ name: 'Edited' }, { name: 'Added' }]);

    existing.resolves(currentRecord);
    await controller.update(makeRequest({ contributors: [] }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.secondCall.args[7].contributors).to.deep.equal([]);
  });

  it('preserves legacy lookup selections and applies replacements and explicit clears', async () => {
    const legacy = { label: 'Legacy funding body', value: 'legacy-id' };
    const selected = { dc_title: 'New funding body', dc_identifier: 'new-id' };
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    read.resolves({
      ...currentRecord,
      metadata: {
        ...currentRecord.metadata, [fundingField]: [legacy],
        contributors: [{ name: 'Before', fundingBody: legacy }],
      },
    });

    const [loaded] = await loadContributorRows();
    expect(loaded.fundingBody).to.deep.equal(legacy);
    await controller.update(makeRequest({
      title: 'Edited', [fundingField]: [{ ...legacy }], contributors: [{ ...loaded, name: 'After' }],
    }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.firstCall.args[7][fundingField]).to.deep.equal([legacy]);
    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal([{ name: 'After', fundingBody: legacy }]);

    await controller.update(makeRequest({
      [fundingField]: [selected], contributors: [{ ...loaded, fundingBody: selected }],
    }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.secondCall.args[7][fundingField]).to.deep.equal([selected]);
    expect(updateMeta.secondCall.args[7].contributors).to.deep.equal([{ name: 'Before', fundingBody: selected }]);

    await controller.update(makeRequest({
      [fundingField]: [null], contributors: [{ ...loaded, fundingBody: null }],
    }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.thirdCall.args[7][fundingField]).to.deep.equal([null]);
    const cleared = updateMeta.thirdCall.args[7];
    expect(cleared.contributors).to.deep.equal([{ name: 'Before', fundingBody: null }]);
    read.resolves({ ...currentRecord, metadata: cleared });
    const [reloaded] = await loadContributorRows();
    expect(reloaded.fundingBody).to.be.null;
  });

  it('preserves a disabled loaded row without sending its metadata, and removes it when omitted from the row edits', async () => {
    const contributors = [{ name: 'Disabled', internalCode: 'Private' }, { name: 'Editable' }];
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    read.resolves({ ...currentRecord, metadata: { ...currentRecord.metadata, contributors } });
    const loaded = await loadContributorRows();
    expect(loaded).to.deep.equal([{ name: 'Disabled' }, { name: 'Editable' }]);
    updateMeta.callsFake(async (...args) => {
      read.resolves({ ...currentRecord, metadata: args[7] });
      return { success: true, isSuccessful: () => true };
    });

    const response = makeResponse();
    const form = await loadFormForRowEdits();
    await controller.update(await rowSaveRequest(
      { title: 'Edited', contributors: [null, loaded[1]] }, { '["contributors"]': [{ retain: 0 }, 1] }, form
    ), response.res);
    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal(contributors);
    expect(response.json.firstCall.args[0].meta.savedRowProofs).to.deep.equal({ '["contributors"]': form.proofs['["contributors"]'] });
    expect(response.json.firstCall.args[0].data).to.deep.equal({ redboxOid: 'oid-1' });

    await controller.update(await rowSaveRequest(
      { contributors: [null] }, { '["contributors"]': [{ retain: 0 }] }, form
    ), makeResponse().res);
    expect(updateMeta.secondCall.args[7].contributors).to.deep.equal([contributors[0]]);
  });

  it('retains only the submitted disabled row when the last enabled row in a group is removed', async () => {
    const details = { ...currentRecord.metadata.details, members: ['Disabled', 'Remove'] };
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, details },
    });
    await controller.update(await rowSaveRequest(
      { title: 'Edited', details: { members: [null] } }, { '["details","members"]': [{ retain: 0 }] }
    ), makeResponse().res);
    expect(updateMeta.firstCall.args[7].details).to.deep.equal({ ...details, members: ['Disabled'] });
  });

  it('preserves a statically uneditable repeatable and issues no row positions for it', async () => {
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, displayOnly: ['Keep'] },
    });
    const form = await loadFormForRowEdits();
    expect(form.proofs).not.to.have.property('["displayOnly"]');
    const field = form.config.componentDefinitions?.find(component => component.name === 'displayOnly');
    expect(field?.model?.config?.value).to.deep.equal(['Keep']);
    await controller.update(await rowSaveRequest(
      { title: 'Edited', displayOnly: [] }, { '["displayOnly"]': [] }, form
    ), makeResponse().res);
    expect(updateMeta.firstCall.args[7].displayOnly).to.deep.equal(['Keep']);
  });

  it('persists remove and reorder actions for read-only rows using proofs', async () => {
    const path = '["orderedReadOnly"]';
    const orderedReadOnly = [{ name: 'First', internalCode: 'Keep first' }, { name: 'Second', internalCode: 'Keep second' }];
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    read.resolves({ ...currentRecord, metadata: { ...currentRecord.metadata, orderedReadOnly } });
    updateMeta.callsFake(async (...args) => {
      read.resolves({ ...currentRecord, metadata: args[7] });
      return { success: true, isSuccessful: () => true };
    });
    const form = await loadFormForRowEdits();
    expect(form.editableRowPaths).to.include(path);
    expect(form.proofs[path]).to.have.length(2);
    const response = makeResponse();
    await controller.update(await rowSaveRequest(
      { orderedReadOnly: [null, null] }, { [path]: [{ retain: 1 }, { retain: 0 }] }, form
    ), response.res);
    expect(updateMeta.lastCall.args[7].orderedReadOnly).to.deep.equal([orderedReadOnly[1], orderedReadOnly[0]]);

    const proofs = response.json.firstCall.args[0].meta.savedRowProofs;
    await controller.update(await rowSaveRequest(
      { orderedReadOnly: [null] }, { [path]: [{ retain: 0 }] }, { ...form, proofs }
    ), makeResponse().res);
    expect(updateMeta.lastCall.args[7].orderedReadOnly).to.deep.equal([orderedReadOnly[1]]);

    const reloaded = await loadFormForRowEdits();
    expect(reloaded.config.componentDefinitions?.find(field => field.name === 'orderedReadOnly')?.model?.config?.value)
      .to.deep.equal([{ name: 'Second' }]);
    const invalid = makeResponse();
    await controller.update(await rowSaveRequest(
      { orderedReadOnly: [{ name: 'Forged' }] }, { [path]: [0] }, reloaded
    ), invalid.res);
    sinon.assert.calledOnceWithExactly(invalid.status, 400);
    sinon.assert.calledTwice(updateMeta);
  });

  it('rejects a whole group clear that would remove read-only rows without row edits', async () => {
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, newGroup: { summary: 'Before', readOnlyRows: ['Keep'] } },
    });
    const form = await loadFormForRowEdits();
    expect(form.editableRowPaths).to.include('["newGroup","readOnlyRows"]');

    const response = makeResponse();
    await controller.update(makeRequest({ newGroup: null }, { formSave: 'true' }), response.res);
    sinon.assert.calledOnceWithExactly(response.status, 400);
    sinon.assert.notCalled(updateMeta);
  });

  it('describes editable list paths independently of loaded rows and excludes read-only row groups', async () => {
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: {
        ...currentRecord.metadata, contributors: [], displayOnlyGroups: [{ name: 'Keep' }],
      },
    });
    const form = await loadFormForRowEdits();
    expect(form.editableRowPaths).to.include.members([
      '["contributors"]', '["contributors",null,"notes"]', '["contributors",null,"notes",null,"details"]',
    ]);
    expect(form.editableRowPaths).not.to.include('["displayOnlyGroups"]');
    expect(form.proofs).not.to.have.property('["contributors",0,"notes"]');
    expect(form.proofs).not.to.have.property('["displayOnlyGroups"]');

    await controller.update(makeRequest({ title: 'Edited', displayOnlyGroups: [] }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.firstCall.args[7]).to.include({ title: 'Edited' });
    expect(updateMeta.firstCall.args[7].displayOnlyGroups).to.deep.equal([{ name: 'Keep' }]);
  });

  it('rejects stale row positions before writing and accepts the same proofs after an unrelated edit', async () => {
    const contributors = [
      { name: 'Alice', internalCode: 'private-A' }, { name: 'Bob', internalCode: 'private-B' },
    ];
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    const record = { ...currentRecord, metadata: { ...currentRecord.metadata, contributors } };
    read.resolves(record);
    const form = await loadFormForRowEdits();
    expect(JSON.stringify(form.proofs)).not.to.include('private-A');
    expect(JSON.stringify(form.proofs)).not.to.include('private-B');
    const request = await rowSaveRequest(
      { title: 'Edited', contributors: [{ name: 'Alice' }, { name: 'Bob' }] },
      { '["contributors"]': [0, 1] }, form
    );

    read.resolves({ ...record, metadata: { ...record.metadata, contributors: [contributors[1], contributors[0]] } });
    const stale = makeResponse();
    await controller.update(request, stale.res);
    sinon.assert.calledOnceWithExactly(stale.status, 400);
    sinon.assert.notCalled(updateMeta);

    read.resolves({ ...record, metadata: { ...record.metadata, description: 'An unrelated edit' } });
    await controller.update(request, makeResponse().res);
    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal(contributors);
    expect(updateMeta.firstCall.args[7].description).to.equal('An unrelated edit');
  });

  it('confirms empty placeholders at both levels across repeated saves', async () => {
    const contributor = { name: 'Alpha', notes: [], internalCode: 'Keep' };
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    read.resolves({ ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [contributor] } });
    updateMeta.callsFake(async (...args) => {
      read.resolves({ ...currentRecord, metadata: args[7] });
      return { success: true, isSuccessful: () => true };
    });
    let form = await loadFormForRowEdits();
    for (const title of ['First save', 'Second save']) {
      const response = makeResponse();
      await controller.update(await rowSaveRequest(
        { title, contributors: [{ name: 'Alpha', notes: [{ text: null, details: [null] }] }] },
        { '["contributors"]': [0], '["contributors",0,"notes"]': [null], '["contributors",0,"notes",0,"details"]': [null] },
        form
      ), response.res);
      expect(updateMeta.lastCall.args[7].contributors).to.deep.equal([contributor]);
      const proofs = response.json.firstCall.args[0].meta.savedRowProofs;
      expect(proofs['["contributors",0,"notes"]']).to.deep.equal([]);
      expect(proofs['["contributors",0,"notes",0,"details"]']).to.deep.equal([]);
      form = { ...form, proofs };
    }
  });

  it('confirms only the submitted lists whose positions survive save hooks', async () => {
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    updateMeta.callsFake(async (...args) => {
      const metadata = { ...args[7], keywords: ['Hook changed this'] };
      read.resolves({ ...currentRecord, metadata });
      return { success: true, isSuccessful: () => true };
    });
    const response = makeResponse();
    const form = await loadFormForRowEdits();
    await controller.update(await rowSaveRequest(
      { contributors: [{ name: 'First' }], keywords: ['keep', 'remove'], concealed: ['Private'] },
      { '["contributors"]': [0], '["keywords"]': [0, 1], '["concealed"]': [0] }, form
    ), response.res);

    expect(response.json.firstCall.args[0].meta.savedRowProofs).to.deep.equal({ '["contributors"]': [form.proofs['["contributors"]'][0]] });
  });

  it('rejects out-of-range and reused row positions before writing', async () => {
    for (const positions of [[{ retain: 99 }, 1], [{ retain: 1 }, 1]]) {
      const { res, status } = makeResponse();
      await controller.update(await rowSaveRequest(
        { contributors: [null, { name: 'Removed' }] }, { '["contributors"]': positions }
      ), res);
      sinon.assert.calledOnceWithExactly(status, 400);
    }
    sinon.assert.notCalled(updateMeta);
  });

  it('retains private lookup properties when the edit projection is unchanged for visibly identical rows', async () => {
    const visible = { dc_title: 'Funding', dc_identifier: 'funding-id' };
    const contributors = [1, 2].map(number => ({
      name: 'Alpha',
      internalCode: `Private ${number}`,
      fundingBody: { ...visible, externalTag: `Legacy ${number}` },
    }));
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors },
    });
    const loaded = await loadContributorRows();
    expect(loaded).to.deep.equal(Array.from({ length: 2 }, () => ({ name: 'Alpha', fundingBody: visible })));
    await controller.update(makeRequest({
      title: 'Edited', contributors: loaded,
    }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal(contributors);

    const fundingBody = { dc_title: 'Replacement', dc_identifier: 'different-id' };
    await controller.update(await rowSaveRequest(
      { contributors: [{ ...loaded[0], fundingBody }, loaded[1]] }, { '["contributors"]': [0, 1] }
    ), makeResponse().res);
    expect(updateMeta.secondCall.args[7].contributors).to.deep.equal([{ ...contributors[0], fundingBody }, contributors[1]]);
  });

  it('keeps the stored value field when the edit projection hydrates it as name', async () => {
    const contributors = [{ value: 'Older label', internalCode: 'Keep' }];
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors },
    });
    const loaded = await loadContributorRows();
    expect(loaded).to.deep.equal([{ name: 'Older label' }]);
    await controller.update(makeRequest({
      title: 'Edited', contributors: loaded,
    }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal(contributors);

    await controller.update(await rowSaveRequest(
      { title: 'Edited', contributors: loaded }, { '["contributors"]': [0] }
    ), makeResponse().res);
    expect(updateMeta.secondCall.args[7].contributors).to.deep.equal(contributors);
  });

  it('keeps a cleared legacy name empty after reloading the edit form', async () => {
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    updateMeta.callsFake(async (...args) => {
      read.resolves({ ...currentRecord, metadata: args[7] });
      return { success: true, isSuccessful: () => true };
    });
    for (const name of ['', null]) {
      read.resolves({
        ...currentRecord,
        metadata: { ...currentRecord.metadata, contributors: [{ value: 'Older label', internalCode: 'Keep' }] },
      });
      expect(await loadContributorRows()).to.deep.equal([{ name: 'Older label' }]);
      await controller.update(await rowSaveRequest({ contributors: [{ name }] }, { '["contributors"]': [0] }), makeResponse().res);
      expect(updateMeta.lastCall.args[7].contributors).to.deep.equal([{ name, value: 'Older label', internalCode: 'Keep' }]);
      expect(await loadContributorRows()).to.deep.equal([{ name }]);
    }
  });

  it('keeps an explicit clear after renaming and reloading a legacy name', async () => {
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    updateMeta.callsFake(async (...args) => {
      read.resolves({ ...currentRecord, metadata: args[7] });
      return { success: true, isSuccessful: () => true };
    });
    for (const name of ['', null]) {
      const contributor = { value: 'Original', internalCode: 'Keep' };
      read.resolves({ ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [contributor] } });
      expect(await loadContributorRows()).to.deep.equal([{ name: 'Original' }]);
      const form = await loadFormForRowEdits();
      const response = makeResponse();
      await controller.update(await rowSaveRequest(
        { contributors: [{ name: 'Renamed' }] }, { '["contributors"]': [0] }, form
      ), response.res);
      expect(updateMeta.lastCall.args[7].contributors).to.deep.equal([{ ...contributor, name: 'Renamed' }]);
      expect(await loadContributorRows()).to.deep.equal([{ name: 'Renamed' }]);

      const proofs = response.json.firstCall.args[0].meta.savedRowProofs;
      await controller.update(await rowSaveRequest(
        { contributors: [{ name }] }, { '["contributors"]': [0] }, { ...form, proofs }
      ), makeResponse().res);
      expect(updateMeta.lastCall.args[7].contributors).to.deep.equal([{ ...contributor, name }]);
      expect(await loadContributorRows()).to.deep.equal([{ name }]);
    }
  });

  it('distinguishes omission from clearing a name without deleting unrelated or editable values', async () => {
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    updateMeta.callsFake(async (...args) => {
      read.resolves({ ...currentRecord, metadata: args[7] });
      return { success: true, isSuccessful: () => true };
    });
    const contributor = { name: 'Current', value: 'Old', internalCode: 'Keep' };
    const namedValue = { value: 'Independent value' };
    read.resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [contributor], nameAndValue: [namedValue] },
    });

    await controller.update(await rowSaveRequest(
      { title: 'Edited', contributors: [{}], nameAndValue: [{}] },
      { '["contributors"]': [0], '["nameAndValue"]': [0] }
    ), makeResponse().res);
    expect(updateMeta.lastCall.args[7].contributors).to.deep.equal([contributor]);
    expect(updateMeta.lastCall.args[7].nameAndValue).to.deep.equal([namedValue]);

    for (const name of [null, '']) {
      await controller.update(await rowSaveRequest(
        { contributors: [{ name }], nameAndValue: [{ name }] }, { '["contributors"]': [0], '["nameAndValue"]': [0] }
      ), makeResponse().res);
      expect(updateMeta.lastCall.args[7].contributors).to.deep.equal([{ ...contributor, name }]);
      expect(updateMeta.lastCall.args[7].nameAndValue).to.deep.equal([{ ...namedValue, name }]);
      expect(await loadContributorRows()).to.deep.equal([{ name }]);
      const reloaded = await loadFormForRowEdits();
      expect(reloaded.config.componentDefinitions?.find(field => field.name === 'nameAndValue')?.model?.config?.value)
        .to.deep.equal([{ ...namedValue, name }]);
    }
  });

  it('updates the email on the retained ORCID contributor and keeps its stored-only fields', async () => {
    const contributor = { name: 'Creator', orcid: '0000-0002-1825-0097', email: 'old@example.test', internalCode: 'Keep' };
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [contributor] },
    });
    const [loaded] = await loadContributorRows();
    expect(loaded).not.to.have.property('internalCode');
    const email = 'corrected@example.test';
    await controller.update(await rowSaveRequest(
      { contributors: [{ ...loaded, email }] }, { '["contributors"]': [0] }
    ), makeResponse().res);
    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal([{ ...contributor, email }]);
  });

  it('keeps an omitted conditional child with a retained repeatable row and allows an explicit clear', async () => {
    const contributors = [{ name: 'Alpha', conditional: 'Stored' }, { name: 'Beta' }];
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors },
    });
    await controller.update(makeRequest({
      title: 'Edited', contributors: [{ name: 'Beta' }, { name: 'Alpha' }],
    }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal([contributors[1], contributors[0]]);

    const cleared = [{ name: 'Alpha', conditional: null }, { name: 'Beta' }];
    await controller.update(makeRequest({ contributors: cleared }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.secondCall.args[7].contributors).to.deep.equal(cleared);
  });

  it('preserves a retained inner row’s omitted child when the preceding inner row is removed', async () => {
    const notes = [{ text: 'Removed' }, { text: 'Retained', conditional: 'Stored' }];
    const contributors = [{ name: 'Alpha', notes }];
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors },
    });
    const [loaded] = await loadContributorRows();
    expect(loaded.notes).to.deep.equal(notes);
    const visibleNotes = loaded.notes!.slice(1).map(({ text }) => ({ text }));

    await controller.update(makeRequest({
      contributors: [{ ...loaded, notes: visibleNotes }],
    }, { formSave: 'true' }), makeResponse().res);

    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal([{ name: 'Alpha', notes: [notes[1]] }]);
  });

  it('rejects a structural edit when an exact nested match and another parent could both own the row', async () => {
    const contributors = [
      { name: 'Alpha', internalCode: 'First', notes: [{ text: 'Keep', internalCode: 'First note' }] },
      { name: 'Alpha', internalCode: 'Second', notes: [
        { text: 'Drop' }, { text: 'Keep', internalCode: 'Second note' },
      ] },
    ];
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors },
    });
    const loaded = await loadContributorRows();
    expect(loaded).to.deep.equal([
      { name: 'Alpha', notes: [{ text: 'Keep' }] },
      { name: 'Alpha', notes: [{ text: 'Drop' }, { text: 'Keep' }] },
    ]);
    const { res, status } = makeResponse();
    await controller.update(makeRequest({
      contributors: [{ ...loaded[1], notes: loaded[1].notes!.slice(1) }],
    }, { formSave: 'true' }), res);

    sinon.assert.calledOnceWithExactly(status, 400);
    sinon.assert.notCalled(updateMeta);

    await controller.update(await rowSaveRequest(
      { contributors: [{ ...loaded[1], notes: loaded[1].notes!.slice(1) }] },
      { '["contributors"]': [1], '["contributors",0,"notes"]': [1] }
    ), makeResponse().res);
    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal([{
      ...contributors[1], notes: [contributors[1].notes[1]],
    }]);
  });

  it('replaces a legacy selection without discarding the identified contributor’s private fields', async () => {
    const contributor = { name: 'Alpha', fundingBody: { label: 'Legacy', value: 'legacy-id' }, internalCode: 'Keep' };
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [contributor] },
    });
    const [loaded] = await loadContributorRows();
    expect(loaded).to.deep.equal({ name: 'Alpha', fundingBody: contributor.fundingBody });
    const fundingBody = { dc_title: 'Selected', dc_identifier: 'new-id' };
    await controller.update(makeRequest({
      contributors: [{ ...loaded, fundingBody }],
    }, { formSave: 'true' }), makeResponse().res);

    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal([{ ...contributor, fundingBody }]);
  });

  it('ignores empty and auto-initialized nested lists when there are no stored inner rows', async () => {
    const contributor = { name: 'Alpha', internalCode: 'Keep' };
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    read.resolves({ ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [contributor] } });
    const [loaded] = await loadContributorRows();
    expect(loaded).to.deep.equal({ name: 'Alpha' });
    for (const notes of [[], [{ text: null }]]) {
      await controller.update(makeRequest({
        title: 'Edited', contributors: [{ ...loaded, notes }],
      }, { formSave: 'true' }), makeResponse().res);
      expect(updateMeta.lastCall.args[7].contributors).to.deep.equal([contributor]);
    }

    const withNotes = { ...contributor, notes: [{ text: 'Remove this note' }] };
    read.resolves({ ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [withNotes] } });
    await controller.update(makeRequest({
      contributors: [{ ...loaded, notes: [] }],
    }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.lastCall.args[7].contributors).to.deep.equal([{ ...contributor, notes: [] }]);

    read.resolves({ ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [{ ...contributor, notes: [] }] } });
    await controller.update(makeRequest({
      title: 'Edited again', contributors: [{ ...loaded, notes: [{ text: null }] }],
    }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.lastCall.args[7].contributors).to.deep.equal([{ ...contributor, notes: [] }]);
  });

  it('saves a title edit with unchanged duplicate rows whose disabled and absent fields differ from storage', async () => {
    const contributors = ['First', 'Second'].map(conditional => ({ name: 'Alpha', conditional }));
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors },
    });
    const loaded = await loadContributorRows();
    const submitted = loaded.map(({ name }) => ({ name, optionalNote: null }));
    await controller.update(makeRequest({
      title: 'Edited', contributors: submitted,
    }, { formSave: 'true' }), makeResponse().res);

    const saved = updateMeta.firstCall.args[7];
    expect(saved.title).to.equal('Edited');
    expect(saved.contributors).to.deep.equal(contributors);
  });

  it('allows clearing the only visible value in a single retained row', async () => {
    const contributor = { optionalNote: 'Before', internalCode: 'Keep' };
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [contributor] },
    });
    const [loaded] = await loadContributorRows();
    expect(loaded).to.deep.equal({ optionalNote: 'Before' });
    for (const optionalNote of [null, '']) {
      await controller.update(makeRequest({
        contributors: [{ ...loaded, name: null, optionalNote }],
      }, { formSave: 'true' }), makeResponse().res);
      expect(updateMeta.lastCall.args[7].contributors).to.deep.equal([{ ...contributor, optionalNote }]);
    }
  });

  it('rejects an unidentifiable clear mixed with an added row', async () => {
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord,
      metadata: { ...currentRecord.metadata, contributors: [{ optionalNote: 'Before', internalCode: 'Keep' }] },
    });
    const { res, status } = makeResponse();
    await controller.update(makeRequest({
      contributors: [{ optionalNote: null }, { optionalNote: 'Added' }],
    }, { formSave: 'true' }), res);

    sinon.assert.calledOnceWithExactly(status, 400);
    sinon.assert.notCalled(updateMeta);
  });

  it('treats a missing optional control as empty and still applies an explicit clear to a stored value', async () => {
    const contributor = { name: 'Alpha', internalCode: 'Keep' };
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    read.resolves({ ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [contributor] } });
    const [loaded] = await loadContributorRows();
    expect(loaded).to.deep.equal({ name: 'Alpha' });

    const submitted = { ...loaded, optionalNote: null };
    await controller.update(makeRequest({
      title: 'Edited', contributors: [submitted],
    }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal([contributor]);

    read.resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [{ ...contributor, optionalNote: 'Before' }] },
    });
    await controller.update(makeRequest({ contributors: [submitted] }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.secondCall.args[7].contributors).to.deep.equal([{ ...contributor, optionalNote: null }]);
  });

  it('rejects a repeatable edit when an omitted child cannot be assigned to a submitted row', async () => {
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [{ name: 'Alpha', conditional: 'Stored' }] },
    });
    const { res, status } = makeResponse();
    await controller.update(makeRequest({ contributors: [{ name: 'Renamed' }] }, { formSave: 'true' }), res);

    sinon.assert.calledOnceWithExactly(status, 400);
    sinon.assert.notCalled(updateMeta);
  });

  it('appends a row with interchangeable ordinary rows and a uniquely matched protected row', async () => {
    const contributors = [{ name: 'Protected', internalCode: 'Keep' }, { name: 'Ordinary' }, { name: 'Ordinary' }];
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { ...currentRecord.metadata, contributors },
    });
    await controller.update(makeRequest({
      contributors: [...contributors.map(({ name }) => ({ name })), { name: 'New' }],
    }, { formSave: 'true' }), makeResponse().res);

    expect(updateMeta.firstCall.args[7].contributors).to.deep.equal([...contributors, { name: 'New' }]);
  });

  it('rejects an ambiguous edit to an object row with stored-only data', async () => {
    const { res, status } = makeResponse();
    await controller.update(makeRequest({
      contributors: [{ name: 'First edited' }, { name: 'Removed' }, { name: 'Last', notes: [{ text: 'Nested' }] }],
    }, { formSave: 'true' }), res);

    sinon.assert.calledOnceWithExactly(status, 400);
    sinon.assert.notCalled(updateMeta);
  });

  it('rejects a whole-group clear that would erase restricted descendants', async () => {
    const { res, status } = makeResponse();
    await controller.update(makeRequest({ details: null }, { formSave: 'true' }), res);
    sinon.assert.calledOnceWithExactly(status, 400);
    sinon.assert.notCalled(updateMeta);
  });

  it('loads and saves the named form selected by the finalise route', async () => {
    const formName = 'default-1.0-draft';
    const formLookup = FormsService.getFormByName as sinon.SinonStub;
    formLookup.withArgs(formName, true, 'brand-1').returns(of({
      id: 'form-finalise', name: formName, branding: 'brand-1',
      configuration: { name: formName, type: 'dataPublication', componentDefinitions: [input('finaliseNote')] },
    }));
    const page = makeRequest({}, { recordType: currentRecord.metaMetadata.type });
    page.options = { ...routes['get /:branding/:portal/record/finalise/:recordType/edit/:oid'] as RouteTargetObject };
    const sendView = sinon.stub(controller, 'sendView');
    const load = makeRequest({}, { name: 'auto', edit: 'true', formSave: 'true', formName, apiVersion: '2.0' });
    load.session = page.session;
    const denied = makeResponse();
    await controller.getForm(load, denied.res);
    sinon.assert.calledOnceWithExactly(denied.status, 403);

    await controller.edit(page, {} as Sails.Res);
    // Hook views already pass formName to the Angular app.
    expect(sendView.firstCall.args[3]).to.include({ formName });
    const loaded = makeResponse();
    await controller.getForm(load, loaded.res);
    expect(loaded.json.firstCall.args[0].data.componentDefinitions[0].name).to.equal('finaliseNote');

    const save = makeRequest({
      finaliseNote: 'Finalised', title: 'Outside alternate form',
    }, { formSave: 'true', formName });
    save.session = page.session;
    await controller.update(save, makeResponse().res);
    expect(updateMeta.firstCall.args[7]).to.deep.equal({ ...currentRecord.metadata, finaliseNote: 'Finalised' });

    save.session = makeRequest({}, {}).session;
    const rejected = makeResponse();
    await controller.update(save, rejected.res);
    sinon.assert.calledOnceWithExactly(rejected.status, 403);
    sinon.assert.calledOnce(updateMeta);
  });

});

describe('RecordController getWorkflowSteps', () => {
  let controller: Controllers.Record;
  let originalSails: any;
  let originalBrandingService: any;
  let originalRecordTypesService: any;
  let originalWorkflowStepsService: any;
  let originalDashboardTypesService: any;
  let originalFormsService: any;
  let originalTranslationService: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalRecordTypesService = (global as any).RecordTypesService;
    originalWorkflowStepsService = (global as any).WorkflowStepsService;
    originalDashboardTypesService = (global as any).DashboardTypesService;
    originalFormsService = (global as any).FormsService;
    originalTranslationService = (global as any).TranslationService;

    (global as any).sails = {
      config: {},
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    };
    (global as any)._ = require('lodash');
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any).RecordTypesService = {
      get: sinon.stub(),
    };
    (global as any).WorkflowStepsService = {
      getAllForRecordType: sinon.stub(),
    };
    (global as any).DashboardTypesService = {
      getDashboardView: sinon.stub(),
    };
    (global as any).FormsService = {
      getFormByStartingWorkflowStep: sinon.stub(),
      getFormByName: sinon.stub(),
      getForm: sinon.stub(),
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => ({
        'default-title': 'Site',
        'rdmp-title-label': 'RDMP',
        'dataRecord-title-label': 'Data Record',
        'workspaces': 'Workspaces',
      }[key] ?? key)),
    };

    controller = new Controllers.Record();
    controller.recordsService = {
      getMeta: sinon.stub(),
      hasViewAccess: sinon.stub().returns(true),
      hasEditAccess: sinon.stub().returns(true),
      getAttachments: sinon.stub(),
      getResolvedPermissionsSummary: sinon.stub(),
    } as any;
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any).RecordTypesService = originalRecordTypesService;
    (global as any).WorkflowStepsService = originalWorkflowStepsService;
    (global as any).DashboardTypesService = originalDashboardTypesService;
    (global as any).FormsService = originalFormsService;
    (global as any).TranslationService = originalTranslationService;
  });

  it('renders record view with saved metadata title', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { type: 'rdmp' },
      metadata: { title: 'Saved title' },
    });

    await controller.view(req, res);

    expect(sendViewStub.calledOnce).to.be.true;
    expect(sendViewStub.firstCall.args[2]).to.equal('record/view');
    expect(sendViewStub.firstCall.args[3]).to.deep.equal({ title: 'Saved title | Site' });
  });

  it('falls back to record type label for record view when metadata title is empty', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { type: 'rdmp' },
      metadata: { title: '   ' },
    });

    await controller.view(req, res);

    expect(sendViewStub.calledOnce).to.be.true;
    expect(sendViewStub.firstCall.args[3]).to.deep.equal({ title: 'RDMP | Site' });
  });

  it('falls back to oid for record view when metadata title and record type are missing', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: {},
      metadata: { title: '' },
    });

    await controller.view(req, res);

    expect(sendViewStub.calledOnce).to.be.true;
    expect(sendViewStub.firstCall.args[3]).to.deep.equal({ title: 'oid-1 | Site' });
  });

  it('preserves existing error path when record metadata fetch fails for view', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = { serverError: sinon.stub() } as unknown as Sails.Res;
    (controller.recordsService.getMeta as sinon.SinonStub).rejects(new Error('boom'));

    await controller.view(req, res);

    expect((res.serverError as any).calledOnce).to.be.true;
  });

  it('returns badRequest when record oid is empty', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('   '),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {
      badRequest: sinon.stub(),
    } as unknown as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');

    await controller.view(req, res);

    expect((res.badRequest as any).calledOnce).to.be.true;
    expect(sendViewStub.called).to.be.false;
    expect((controller.recordsService.getMeta as sinon.SinonStub).called).to.be.false;
  });

  it('returns forbidden when view access is denied', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {
      forbidden: sinon.stub(),
    } as unknown as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { type: 'rdmp' },
      metadata: { title: 'Saved title' },
    });
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(false);

    await controller.view(req, res);

    expect((res.forbidden as any).calledOnce).to.be.true;
    expect(sendViewStub.called).to.be.false;
    expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnce).to.be.true;
  });

  for (const routeName of ['/:branding/:portal/record/view/:oid', '/:branding/:portal/record/view-orig/:oid']) {
    const route = routes[routeName] as RouteTargetObject;

    it(`renders an existing record through ${routeName} using one metadata lookup`, async () => {
      expect(route).to.include({ controller: 'RecordController', action: 'view' });
      const req = {
        param: sinon.stub().withArgs('oid').returns('oid-1'),
        session: { branding: 'default' },
        user: { username: 'alice', roles: [] },
        options: route,
      } as unknown as Sails.Req;
      const record = { redboxOid: 'oid-1', metaMetadata: { type: 'rdmp' }, metadata: { title: 'Saved title' } };
      const sendView = sinon.stub(controller, 'sendView');
      (controller.recordsService.getMeta as sinon.SinonStub).resolves(record);

      await controller.view(req, {} as Sails.Res);

      expect(sendView.calledOnce).to.be.true;
      expect(sendView.firstCall.args[2]).to.equal(route.locals?.view ?? 'record/view');
      expect(sendView.firstCall.args[3]).to.deep.equal({ title: 'Saved title | Site' });
      expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnceWithExactly('oid-1')).to.be.true;
      expect((controller.recordsService.hasViewAccess as sinon.SinonStub).firstCall.args[3]).to.equal(record);
    });

    for (const missingRecord of [undefined, null, {}]) {
      it(`returns notFound for ${routeName} when metadata is ${JSON.stringify(missingRecord)}`, async () => {
        expect(route).to.include({ controller: 'RecordController', action: 'view' });
        const req = {
          param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'deleted-oid' : 'rdmp'),
          session: { branding: 'default' },
          options: { ...route, locals: { ...route.locals, localFormName: 'form-1' } },
        } as unknown as Sails.Req;
        const notFound = sinon.stub();
        const serverError = sinon.stub();
        const res = { notFound, serverError } as unknown as Sails.Res;
        const sendView = sinon.stub(controller, 'sendView');
        (controller.recordsService.getMeta as sinon.SinonStub).resolves(missingRecord);

        await controller.view(req, res);

        expect(notFound.calledOnceWithExactly()).to.be.true;
        expect(serverError.called).to.be.false;
        expect(sendView.called).to.be.false;
        expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnceWithExactly('deleted-oid')).to.be.true;
        expect((controller.recordsService.hasViewAccess as sinon.SinonStub).called).to.be.false;
      });
    }

    for (const lookupError of [new Error('Storage unavailable'), new Error('Storage index not found'), { code: 500, message: 'Storage unavailable' }]) {
      it(`returns serverError for ${routeName} when lookup rejects with ${lookupError.message}`, async () => {
        const req = {
          param: sinon.stub().withArgs('oid').returns('oid-1'),
          session: { branding: 'default' },
          options: route,
        } as unknown as Sails.Req;
        const notFound = sinon.stub();
        const serverError = sinon.stub();
        const res = { notFound, serverError } as unknown as Sails.Res;
        const sendView = sinon.stub(controller, 'sendView');
        (controller.recordsService.getMeta as sinon.SinonStub).rejects(lookupError);

        await controller.view(req, res);

        expect(serverError.calledOnce).to.be.true;
        expect(notFound.called).to.be.false;
        expect(sendView.called).to.be.false;
        expect((controller.recordsService.hasViewAccess as sinon.SinonStub).called).to.be.false;
      });
    }

    it(`returns forbidden for ${routeName} when the record is inaccessible`, async () => {
      const req = {
        param: sinon.stub().withArgs('oid').returns('oid-1'),
        session: { branding: 'default' },
        options: route,
      } as unknown as Sails.Req;
      const forbidden = sinon.stub();
      const notFound = sinon.stub();
      const res = { forbidden, notFound } as unknown as Sails.Res;
      const sendView = sinon.stub(controller, 'sendView');
      (controller.recordsService.getMeta as sinon.SinonStub).resolves({ redboxOid: 'oid-1' });
      (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(false);

      await controller.view(req, res);

      expect(forbidden.calledOnce).to.be.true;
      expect(notFound.called).to.be.false;
      expect(sendView.called).to.be.false;
    });
  }

  it('returns server error when attachment listing fails', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      session: { branding: 'default' },
      user: { username: 'alice' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1', type: 'rdmp' },
    });
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(true);
    (controller.recordsService.getAttachments as sinon.SinonStub).rejects(new Error('boom'));

    await controller.getAttachments(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.include({ status: 500 });
  });

  it('returns resolved permissions when the user can view the record', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      user: { username: 'alice' },
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1' },
    });
    (controller.recordsService.getResolvedPermissionsSummary as sinon.SinonStub).resolves({
      edit: true,
      view: true,
    });

    await controller.getPermissions(req, res);

    expect((controller.recordsService.getResolvedPermissionsSummary as sinon.SinonStub).calledOnceWithExactly('oid-1')).to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data).to.deep.equal({ edit: true, view: true });
  });

  it('rejects permission requests when the user cannot view the record', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      user: { username: 'alice' },
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1' },
    });
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(false);

    await controller.getPermissions(req, res);

    expect((controller.recordsService.getResolvedPermissionsSummary as sinon.SinonStub).called).to.be.false;
    expect(sendRespStub.firstCall.args[2]?.status).to.equal(403);
  });

  it('returns not found when permission metadata does not exist', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      user: { username: 'alice' },
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves(null);

    await controller.getPermissions(req, res);

    expect(sendRespStub.firstCall.args[2]?.status).to.equal(404);
  });

  for (const missingRecord of [undefined, null, {}]) {
    for (const route of ['standard', 'named-form', 'record-type']) {
      it(`returns notFound for ${route} edit when the record lookup returns ${JSON.stringify(missingRecord)}`, async () => {
        const req = {
          param: sinon.stub().callsFake((name: string) => {
            if (name === 'oid') return 'deleted-oid';
            if (name === 'recordType' && route === 'record-type') return 'rdmp';
            return '';
          }),
          query: {},
          session: { branding: 'default' },
          options: { locals: route === 'named-form' ? { localFormName: 'form-1' } : {} },
        } as unknown as Sails.Req;
        const notFound = sinon.stub();
        const res = { notFound } as unknown as Sails.Res;
        const sendView = sinon.stub(controller, 'sendView');
        (controller.recordsService.getMeta as sinon.SinonStub).resolves(missingRecord);

        await controller.edit(req, res);

        expect(notFound.calledOnce).to.be.true;
        expect(sendView.called).to.be.false;
        expect((FormsService.getFormByName as sinon.SinonStub).called).to.be.false;
        expect((FormsService.getFormByStartingWorkflowStep as sinon.SinonStub).called).to.be.false;
      });
    }
  }

  it('returns a server error without rendering the editor when the record lookup fails', async () => {
    const req = {
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
      query: {},
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const serverError = sinon.stub();
    const notFound = sinon.stub();
    const res = { serverError, notFound } as unknown as Sails.Res;
    const sendView = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).rejects(new Error('Storage unavailable'));

    await controller.edit(req, res);

    expect(serverError.calledOnce).to.be.true;
    expect(notFound.called).to.be.false;
    expect(sendView.called).to.be.false;
  });

  for (const apiVersion of ['1.0', '2.0']) {
    for (const edit of ['true', 'false']) {
      it(`returns a missing-record 404 for a deleted record's form (API ${apiVersion}, edit=${edit})`, async () => {
        const req = {
          param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'deleted-oid' : 'auto'),
          query: { apiVersion, edit },
          session: { branding: 'default' },
        } as unknown as Sails.Req;
        const status = sinon.stub().returnsThis();
        const json = sinon.stub().returnsThis();
        const res = { status, json, set: sinon.stub() } as unknown as Sails.Res;
        (controller.recordsService.getMeta as sinon.SinonStub).resolves(undefined);

        await controller.getForm(req, res);

        expect(status.calledOnceWithExactly(404)).to.be.true;
        expect(json.calledOnce).to.be.true;
        if (apiVersion === '1.0') {
          expect(json.firstCall.args[0]).to.include({ message: 'missing-record' });
        } else {
          expect(json.firstCall.args[0].errors[0]).to.include({ code: 'missing-record' });
        }
        expect((controller.recordsService.hasViewAccess as sinon.SinonStub).called).to.be.false;
      });
    }

    for (const edit of ['true', 'false']) {
      it(`returns missing-record when the record disappears after page rendering (API ${apiVersion}, edit=${edit})`, async () => {
        const req = {
          param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
          query: { apiVersion, edit },
          session: { branding: 'default' },
          options: {},
        } as unknown as Sails.Req;
        const status = sinon.stub().returnsThis();
        const json = sinon.stub().returnsThis();
        const res = { status, json, set: sinon.stub() } as unknown as Sails.Res;
        const sendView = sinon.stub(controller, 'sendView');
        const getMeta = controller.recordsService.getMeta as sinon.SinonStub;
        getMeta.onFirstCall().resolves({
          redboxOid: 'oid-1',
          metaMetadata: { type: 'rdmp', form: 'form-1' },
          metadata: { title: 'Saved title' },
        });
        getMeta.onSecondCall().resolves(undefined);
        (FormsService.getFormByName as sinon.SinonStub).returns(of({ configuration: { type: 'rdmp' } }));

        await controller[edit === 'true' ? 'edit' : 'view'](req, res);

        expect(sendView.calledOnce).to.be.true;
        expect(sendView.firstCall.args[2]).to.equal(edit === 'true' ? 'record/edit' : 'record/view');
        (controller.recordsService.hasViewAccess as sinon.SinonStub).resetHistory();

        await controller.getForm(req, res);

        expect(getMeta.calledTwice).to.be.true;
        expect(status.calledOnceWithExactly(404)).to.be.true;
        expect(json.calledOnce).to.be.true;
        if (apiVersion === '1.0') {
          expect(json.firstCall.args[0]).to.include({ message: 'missing-record' });
        } else {
          expect(json.firstCall.args[0].errors[0]).to.include({ code: 'missing-record' });
        }
        expect((FormsService.getForm as sinon.SinonStub).called).to.be.false;
        expect((controller.recordsService.hasEditAccess as sinon.SinonStub).called).to.be.false;
        expect((controller.recordsService.hasViewAccess as sinon.SinonStub).called).to.be.false;
      });

      for (const lookup of ['record', 'form']) {
        it(`keeps code-500 ${lookup} lookup failures as server errors (API ${apiVersion}, edit=${edit})`, async () => {
          const req = {
            param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : 'auto'),
            query: { apiVersion, edit },
            session: { branding: 'default' },
          } as unknown as Sails.Req;
          const status = sinon.stub().returnsThis();
          const json = sinon.stub().returnsThis();
          const res = { status, json, set: sinon.stub() } as unknown as Sails.Res;
          const lookupError = { error: { code: 500 }, message: 'Storage unavailable' };
          if (lookup === 'record') {
            (controller.recordsService.getMeta as sinon.SinonStub).rejects(lookupError);
          } else {
            (controller.recordsService.getMeta as sinon.SinonStub).resolves({ redboxOid: 'oid-1' });
            (FormsService.getForm as sinon.SinonStub).rejects(lookupError);
          }

          await controller.getForm(req, res);

          expect(status.calledOnceWithExactly(500)).to.be.true;
          expect(json.calledOnce).to.be.true;
          const payload = json.firstCall.args[0];
          expect(JSON.stringify(payload)).not.to.include('missing-record');
          if (apiVersion === '1.0') {
            expect(payload).to.include({ message: 'Error getting form definition', details: lookupError.message });
          } else {
            expect(payload.errors[0]).to.include({ title: 'Error getting form definition', detail: lookupError.message });
          }
        });
      }

      it(`preserves permission errors for an existing form (API ${apiVersion}, edit=${edit})`, async () => {
        const req = {
          param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : 'auto'),
          query: { apiVersion, edit },
          session: { branding: 'default' },
        } as unknown as Sails.Req;
        const status = sinon.stub().returnsThis();
        const json = sinon.stub().returnsThis();
        const res = { status, json, set: sinon.stub() } as unknown as Sails.Res;
        (controller.recordsService.getMeta as sinon.SinonStub).resolves({ redboxOid: 'oid-1' });
        const access = controller.recordsService[edit === 'true' ? 'hasEditAccess' : 'hasViewAccess'] as sinon.SinonStub;
        access.returns(false);

        await controller.getForm(req, res);

        expect(access.calledOnce).to.be.true;
        expect(status.calledOnceWithExactly(500)).to.be.true;
        if (apiVersion === '1.0') {
          expect(json.firstCall.args[0]).to.include({ message: 'view-error-no-permissions' });
        } else {
          expect(json.firstCall.args[0].errors[0]).to.include({ code: 'view-error-no-permissions' });
        }
        expect((FormsService.getForm as sinon.SinonStub).called).to.be.false;
      });
    }
  }

  for (const formSelection of ['named', 'saved']) {
    for (const recordType of ['rdmp', null]) {
      it(`uses saved record type ${JSON.stringify(recordType)} with a ${formSelection} form that has no configured type`, async () => {
        const req = {
          param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
          query: {},
          session: { branding: 'default' },
          options: { locals: formSelection === 'named' ? { localFormName: 'named-form' } : {} },
        } as unknown as Sails.Req;
        const sendView = sinon.stub(controller, 'sendView');
        (controller.recordsService.getMeta as sinon.SinonStub).resolves({
          redboxOid: 'oid-1',
          metaMetadata: { type: recordType, form: 'saved-form' },
          metadata: { title: 'Saved title' },
        });
        (FormsService.getFormByName as sinon.SinonStub).returns(of({ configuration: {} }));

        await controller.edit(req, {} as Sails.Res);

        expect(sendView.calledOnce).to.be.true;
        expect(sendView.firstCall.args[2]).to.equal('record/edit');
        expect(sendView.firstCall.args[3]).to.deep.include({
          oid: 'oid-1', recordType: recordType ?? '', title: 'Saved title | Site',
          formName: formSelection === 'named' ? 'named-form' : '',
        });
        expect((FormsService.getFormByName as sinon.SinonStub).calledOnceWithExactly(
          formSelection === 'named' ? 'named-form' : 'saved-form', true, 'brand-1',
        )).to.be.true;
        expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnceWithExactly('oid-1')).to.be.true;
      });
    }
  }

  for (const formName of [undefined, null]) {
    it(`reports an unavailable form without mislabeling an existing record whose form is ${formName}`, async () => {
      const req = {
        param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
        query: { apiVersion: '2.0' },
        session: { branding: 'default' },
        options: {},
      } as unknown as Sails.Req;
      const status = sinon.stub().returnsThis();
      const json = sinon.stub().returnsThis();
      const notFound = sinon.stub();
      const res = { status, json, notFound, set: sinon.stub() } as unknown as Sails.Res;
      const sendView = sinon.stub(controller, 'sendView');
      (controller.recordsService.getMeta as sinon.SinonStub).resolves({
        redboxOid: 'oid-1', metaMetadata: { type: 'rdmp', form: formName },
      });
      (FormsService.getFormByName as sinon.SinonStub).returns(of(null));

      await controller.edit(req, res);

      expect((FormsService.getFormByName as sinon.SinonStub).calledOnceWithExactly('', true, 'brand-1')).to.be.true;
      expect(status.calledOnceWithExactly(404)).to.be.true;
      expect(json.firstCall.args[0].errors[0]).to.include({ detail: 'Form not found' });
      expect(JSON.stringify(json.firstCall.args[0])).not.to.include('missing-record');
      expect(notFound.called).to.be.false;
      expect(sendView.called).to.be.false;
      expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnce).to.be.true;
    });
  }

  it('renders a named create form without looking up an existing record', async () => {
    const req = {
      param: sinon.stub().callsFake((name: string) => name === 'recordType' ? 'rdmp' : ''),
      query: {},
      session: { branding: 'default' },
      options: { locals: { localFormName: 'named-form' } },
    } as unknown as Sails.Req;
    const sendView = sinon.stub(controller, 'sendView');
    (FormsService.getFormByName as sinon.SinonStub).returns(of({ configuration: { type: 'rdmp' } }));

    await controller.edit(req, {} as Sails.Res);

    expect(sendView.calledOnce).to.be.true;
    expect(sendView.firstCall.args[3]).to.deep.include({ oid: '', recordType: 'rdmp', formName: 'named-form', title: 'Create RDMP | Site' });
    expect((controller.recordsService.getMeta as sinon.SinonStub).called).to.be.false;
  });

  it('uses saved metadata title on existing edit routes', async () => {
    const req = {
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
      query: {},
      session: { branding: 'default' },
      options: {},
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      metaMetadata: { type: 'rdmp', form: 'form-1' },
      metadata: { title: 'Saved title' },
    });
    (global as any).FormsService.getFormByName.returns(of({ configuration: { type: 'rdmp' } }));

    const rendered = new Promise<void>((resolve) => {
      sendViewStub.callsFake(() => {
        resolve();
        return undefined;
      });
    });

    controller.edit(req, res);
    await rendered;

    expect(sendViewStub.calledOnce).to.be.true;
    expect(sendViewStub.firstCall.args[2]).to.equal('record/edit');
    expect(sendViewStub.firstCall.args[3]).to.deep.include({ title: 'Saved title | Site' });
    expect((controller.recordsService.getMeta as sinon.SinonStub).calledOnce).to.be.true;
  });

  it('uses create record type title on create routes', async () => {
    const req = {
      param: sinon.stub().callsFake((name: string) => name === 'recordType' ? 'rdmp' : ''),
      query: {},
      session: { branding: 'default' },
      options: {},
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (global as any).FormsService.getFormByStartingWorkflowStep.returns(of({ configuration: { type: 'rdmp' } }));

    const rendered = new Promise<void>((resolve) => {
      sendViewStub.callsFake(() => {
        resolve();
        return undefined;
      });
    });

    controller.edit(req, res);
    await rendered;

    expect(sendViewStub.calledOnce).to.be.true;
    expect(sendViewStub.firstCall.args[2]).to.equal('record/edit');
    expect(sendViewStub.firstCall.args[3]).to.deep.include({ title: 'Create RDMP | Site' });
    expect((controller.recordsService.getMeta as sinon.SinonStub).called).to.be.false;
  });

  it('returns 400 when record type is missing after normalization', async () => {
    const req = {
      param: sinon.stub().returns('   '),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getWorkflowSteps(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.equal({
      status: 400,
      displayErrors: [{ detail: 'Record Type is required' }],
    });
    expect((global as any).RecordTypesService.get.called).to.be.false;
    expect((global as any).WorkflowStepsService.getAllForRecordType.called).to.be.false;
  });

  it('returns 400 when record type is invalid', async () => {
    const req = {
      param: sinon.stub().returns('dataset'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (global as any).RecordTypesService.get.returns(of(null));

    await controller.getWorkflowSteps(req, res);

    expect((global as any).BrandingService.getBrand.calledWith('default')).to.be.true;
    expect((global as any).RecordTypesService.get.calledWith(sinon.match({ id: 'brand-1' }), 'dataset')).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.equal({
      status: 400,
      displayErrors: [{ detail: 'Record Type provided is not valid' }],
    });
    expect((global as any).WorkflowStepsService.getAllForRecordType.called).to.be.false;
  });

  it('returns workflow steps for a valid trimmed record type', async () => {
    const req = {
      param: sinon.stub().returns(' dataset '),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    const recordType = { id: 'rt-1', name: 'dataset' };
    const wfSteps = [{ name: 'draft' }, { name: 'review' }];
    (global as any).RecordTypesService.get.returns(of(recordType));
    (global as any).WorkflowStepsService.getAllForRecordType.returns(of(wfSteps));

    await controller.getWorkflowSteps(req, res);

    expect((global as any).RecordTypesService.get.calledWith(sinon.match({ id: 'brand-1' }), 'dataset')).to.be.true;
    expect((global as any).WorkflowStepsService.getAllForRecordType.calledWith(recordType)).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.equal({ data: wfSteps });
  });

  it('returns dashboard view metadata for a valid dashboard view', async () => {
    const req = {
      param: sinon.stub().withArgs('dashboardView').returns('consolidated'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    const dashboardView = {
      name: 'consolidated',
      titleLabelKey: 'consolidated',
      dashboardType: 'consolidated',
      sourceRecordType: 'rdmp',
      showAdminSideBar: true,
      steps: [
        {
          name: 'consolidated',
          sourceRecordType: 'rdmp',
          fetchMode: 'allForRecordType',
          dashboardTable: { rowConfig: [] },
        },
      ],
    };
    (global as any).DashboardTypesService.getDashboardView.returns(dashboardView);

    await controller.getDashboardView(req, res);

    expect((global as any).DashboardTypesService.getDashboardView.calledWithExactly('consolidated')).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2].data).to.deep.include({
      name: 'consolidated',
      titleLabelKey: 'consolidated',
      dashboardType: 'consolidated',
      sourceRecordType: 'rdmp',
      showAdminSideBar: true,
    });
    expect(sendRespStub.firstCall.args[2].data.steps).to.deep.equal([
      {
        name: 'consolidated',
        sourceRecordType: 'rdmp',
        sourceWorkflowStage: undefined,
        fetchMode: 'allForRecordType',
        dashboardTable: { rowConfig: [] },
        baseRecordType: undefined,
      },
    ]);
  });

  it('returns 404 when dashboard view config is malformed', async () => {
    const req = {
      param: sinon.stub().withArgs('dashboardView').returns('malformed'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (global as any).DashboardTypesService.getDashboardView.returns({
      titleLabelKey: 'malformed',
      dashboardType: 'consolidated',
      sourceRecordType: 'rdmp',
      steps: [],
    });

    await controller.getDashboardView(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.equal({
      status: 404,
      displayErrors: [{ detail: 'Dashboard view provided is not valid' }],
    });
  });

  it('redirects the legacy consolidated dashboard route', () => {
    const req = {} as Sails.Req;
    const res = {
      redirect: sinon.stub()
    } as unknown as Sails.Res;
    (global as any).BrandingService.getFullPath = sinon.stub().returns('/default/rdmp');

    controller.redirectLegacyConsolidatedDashboard(req, res);

    expect((res.redirect as any).calledWith('/default/rdmp/dashboard-view/consolidated')).to.be.true;
  });
});

describe('RecordController TUS URL generation', () => {
  let controller: Controllers.Record;
  let originalSails: any;
  let originalStorageManagerService: any;
  let originalBrandingService: any;
  let originalTranslationService: any;
  let originalCheckDiskSpace: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalStorageManagerService = (global as any).StorageManagerService;
    originalBrandingService = (global as any).BrandingService;
    originalTranslationService = (global as any).TranslationService;
    (global as any).sails = {
      config: {
        record: {
          attachments: {
            store: 'file',
            path: '/uploads/attachments',
            file: {
              directory: '/tmp/redbox-test-attachments',
            },
          },
          diskSpaceThreshold: 100,
          mongodbDisk: '/legacy/mongodb-disk',
        },
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    };
    (global as any)._ = require('lodash');
    (global as any).StorageManagerService = {
      stagingDisk: sinon.stub().returns({}),
      getStagingDiskConfig: sinon.stub().returns({
        driver: 'fs',
        config: { root: '/tmp/storage-manager-staging' },
      }),
    };
    (global as any).BrandingService = {
      getBrandAndPortalPath: sinon.stub().returns('/default/rdmp'),
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((value: string) => value),
    };
    controller = new Controllers.Record();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).StorageManagerService = originalStorageManagerService;
    (global as any).BrandingService = originalBrandingService;
    (global as any).TranslationService = originalTranslationService;
  });

  it('returns routed attachment URLs instead of the internal TUS mount path', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl({
      _tusBaseUrl: '/default/rdmp/record/oid-1',
    }, {
      host: 'localhost:1500',
      path: '/uploads/attachments',
      id: 'file-123',
    });

    expect(generatedUrl).to.equal('//localhost:1500/default/rdmp/record/oid-1/attach/file-123');
  });

  it('normalizes routed attachment URLs when the base URL has a trailing slash', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl({
      _tusBaseUrl: '/default/rdmp/record/oid-1/',
    }, {
      host: 'localhost:1500',
      path: '/uploads/attachments',
      id: 'file-123',
    });

    expect(generatedUrl).to.equal('//localhost:1500/default/rdmp/record/oid-1/attach/file-123');
  });

  it('does not expose the internal TUS mount path in generated attachment URLs', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl({
      _tusBaseUrl: '/default/rdmp/record/oid-1',
    }, {
      host: 'localhost:1500',
      path: '/uploads/attachments',
      id: 'file-123',
    });

    expect(generatedUrl).to.not.include('/uploads/attachments');
    expect(generatedUrl).to.include('/default/rdmp/record/oid-1/attach/file-123');
  });

  it('uses the StorageManager staging disk datastore for the tus server', () => {
    (controller as any).initTusServer();

    expect((global as any).StorageManagerService.stagingDisk.calledOnce).to.equal(true);
    expect((controller as any).tusServer.datastore.constructor.name).to.equal('TusStorageManagerDataStore');
  });

  it('does not require record.attachments.file.directory when using the storage manager datastore', () => {
    (global as any).sails.config.record.attachments.file = undefined;
    (global as any).sails.config.record.attachments.stageDir = undefined;

    expect(() => (controller as any).initTusServer()).to.not.throw();
  });

  it('checks disk space against the staging disk root for filesystem staging uploads', async () => {
    const checkDiskSpaceModule = require('check-disk-space');
    const checkDiskSpaceStub = sinon.stub(checkDiskSpaceModule, 'default').resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
    const handleStub = sinon.stub();
    (controller as any).tusServer = { handle: handleStub };
    sinon.stub(controller as any, 'getRecord').returns(of({}));
    sinon.stub(controller as any, 'hasEditAccess').returns(of(true));

    const req = {
      method: 'POST',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach',
      path: '/default/rdmp/record/oid-1/attach',
      headers: {
        host: 'localhost:1500',
        'upload-length': '1000',
      },
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : undefined),
    } as unknown as Sails.Req;
    const res = {
      setHeader: sinon.stub(),
      end: sinon.stub(),
      once: sinon.stub(),
    } as unknown as Sails.Res;

    await controller.doAttachment(req, res);

    expect(checkDiskSpaceStub.calledOnceWith('/tmp/storage-manager-staging')).to.equal(true);
    expect(handleStub.calledOnce).to.equal(true);
  });

  it('skips local disk-space checks for non-filesystem staging uploads', async () => {
    const checkDiskSpaceModule = require('check-disk-space');
    const checkDiskSpaceStub = sinon.stub(checkDiskSpaceModule, 'default').resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
    (global as any).StorageManagerService.getStagingDiskConfig.returns({
      driver: 's3',
      config: { bucket: 'uploads', key: 'AK', secret: 'SK', region: 'ap-southeast-2' },
    });
    const handleStub = sinon.stub();
    (controller as any).tusServer = { handle: handleStub };
    sinon.stub(controller as any, 'getRecord').returns(of({}));
    sinon.stub(controller as any, 'hasEditAccess').returns(of(true));

    const req = {
      method: 'POST',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach',
      path: '/default/rdmp/record/oid-1/attach',
      headers: {
        host: 'localhost:1500',
        'upload-length': '1000',
      },
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : undefined),
    } as unknown as Sails.Req;
    const res = {
      setHeader: sinon.stub(),
      end: sinon.stub(),
      once: sinon.stub(),
    } as unknown as Sails.Res;

    await controller.doAttachment(req, res);

    expect(checkDiskSpaceStub.called).to.equal(false);
    expect(handleStub.calledOnce).to.equal(true);
  });

  it('does not use record.mongodbDisk for tus disk-space validation', async () => {
    const checkDiskSpaceModule = require('check-disk-space');
    const checkDiskSpaceStub = sinon.stub(checkDiskSpaceModule, 'default').resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
    const handleStub = sinon.stub();
    (controller as any).tusServer = { handle: handleStub };
    sinon.stub(controller as any, 'getRecord').returns(of({}));
    sinon.stub(controller as any, 'hasEditAccess').returns(of(true));

    const req = {
      method: 'POST',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach',
      path: '/default/rdmp/record/oid-1/attach',
      headers: {
        host: 'localhost:1500',
        'upload-length': '1000',
      },
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : undefined),
    } as unknown as Sails.Req;
    const res = {
      setHeader: sinon.stub(),
      end: sinon.stub(),
      once: sinon.stub(),
    } as unknown as Sails.Res;

    await controller.doAttachment(req, res);

    expect(checkDiskSpaceStub.firstCall.args[0]).to.not.equal('/legacy/mongodb-disk');
  });

  it('uses the shared browser 404 response when an attachment is not in the record', async () => {
    (controller as any).tusServer = { handle: sinon.stub() };
    sinon.stub(controller as any, 'getRecord').returns(of({
      metaMetadata: { attachmentFields: [] },
      metadata: {},
    }));
    sinon.stub(controller as any, 'hasViewAccess').returns(of(true));

    const req = {
      method: 'GET',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach/file-missing',
      path: '/default/rdmp/record/oid-1/attach/file-missing',
      headers: { host: 'localhost:1500' },
      param: sinon.stub().callsFake((name: string) => ({ oid: 'oid-1', attachId: 'file-missing' }[name])),
    } as unknown as Sails.Req;
    const res = { notFound: sinon.stub() } as unknown as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.doAttachment(req, res);

    expect((res.notFound as any).calledOnce).to.equal(true);
    expect(sendRespStub.called).to.equal(false);
  });

  it('keeps the JSON 404 response for attachment API requests', async () => {
    (controller as any).tusServer = { handle: sinon.stub() };
    sinon.stub(controller as any, 'getRecord').returns(of({
      metaMetadata: { attachmentFields: [] },
      metadata: {},
    }));
    sinon.stub(controller as any, 'hasViewAccess').returns(of(true));

    const req = {
      method: 'GET',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach/file-missing',
      path: '/default/rdmp/record/oid-1/attach/file-missing',
      headers: { host: 'localhost:1500', 'x-source': 'jsclient' },
      param: sinon.stub().callsFake((name: string) => ({ oid: 'oid-1', attachId: 'file-missing' }[name])),
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.doAttachment(req, res);

    expect(sendRespStub.calledOnce).to.equal(true);
    expect(sendRespStub.firstCall.args[2]).to.deep.include({ status: 404 });
  });

  it('uses the shared browser 404 response when the attachment stream is missing', async () => {
    (controller as any).tusServer = { handle: sinon.stub() };
    sinon.stub(controller as any, 'getRecord').returns(of({
      metaMetadata: { attachmentFields: ['attachments'] },
      metadata: {
        attachments: [{ fileId: 'file-missing', name: 'missing.txt', mimeType: 'text/plain', size: '1' }],
      },
    }));
    sinon.stub(controller as any, 'hasViewAccess').returns(of(true));
    controller.datastreamService = {
      getDatastream: sinon.stub().rejects(new Error('attachment-not-found')),
    } as any;

    const req = {
      method: 'GET',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach/file-missing',
      path: '/default/rdmp/record/oid-1/attach/file-missing',
      headers: { host: 'localhost:1500' },
      param: sinon.stub().callsFake((name: string) => ({ oid: 'oid-1', attachId: 'file-missing' }[name])),
    } as unknown as Sails.Req;
    const res = {
      set: sinon.stub(),
      attachment: sinon.stub(),
      notFound: sinon.stub(),
    } as unknown as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.doAttachment(req, res);

    expect((res.notFound as any).calledOnce).to.equal(true);
    expect((res.set as any).called).to.equal(false);
    expect((res.attachment as any).called).to.equal(false);
    expect(sendRespStub.called).to.equal(false);
  });
});

describe('AsynchController authorization', () => {
  let controller: AsynchControllers.Asynch;
  let originalSails: any;
  let originalBrandingService: any;
  let originalAsynchsService: any;

  const makeRequest = (
    values: Record<string, unknown>,
    user: Record<string, unknown> | undefined = { username: 'alice', roles: [] }
  ) => ({
    isSocket: true,
    session: { branding: 'default' },
    user,
    param: sinon.stub().callsFake((name: string) => values[name]),
  } as unknown as Sails.Req);

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalAsynchsService = (global as any).AsynchsService;
    (global as any)._ = require('lodash');
    (global as any).BrandingService = { getBrand: sinon.stub().returns({ id: 'brand-1' }) };
    (global as any).AsynchsService = {
      get: sinon.stub().returns(of([])),
      finish: sinon.stub().returns(of([{ id: 'job-1', relatedRecordId: 'record-1' }])),
      update: sinon.stub().returns(of([{ id: 'job-1', relatedRecordId: 'record-1' }])),
    };
    (global as any).sails = {
      log: { verbose: sinon.stub() },
      services: {
        recordsservice: {
          getMeta: sinon.stub(),
          hasViewAccess: sinon.stub().returns(true),
        },
      },
      sockets: {
        join: sinon.stub().callsFake((_req: unknown, _roomId: string, callback: (error?: unknown) => void) => callback()),
        broadcast: sinon.stub(),
      },
    };
    controller = new AsynchControllers.Asynch();
    sinon.stub(controller as any, 'getNoCacheHeaders').returns({});
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any).AsynchsService = originalAsynchsService;
  });

  it('resolves and authorizes direct, progress, and composite rooms', async () => {
    const recordsService = (global as any).sails.services.recordsservice;
    recordsService.getMeta.callsFake(async (oid: string) => {
      if (oid === 'record-1') {
        return { redboxOid: oid };
      }
      throw new Error('not found');
    });
    (global as any).AsynchsService.get.callsFake(({ id }: { id: string }) =>
      of(id === 'job-1' ? [{ id, relatedRecordId: 'record-1' }] : [])
    );
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.subscribe(makeRequest({ roomId: 'record-1' }), {} as Sails.Res);
    await controller.subscribe(makeRequest({ roomId: 'job-1' }), {} as Sails.Res);
    await controller.subscribe(makeRequest({ roomId: 'record-1-export' }), {} as Sails.Res);

    expect(recordsService.hasViewAccess.callCount).to.equal(3);
    expect((global as any).sails.sockets.join.callCount).to.equal(3);
    expect(sendResp.thirdCall.args[2].data.status).to.be.true;
  });

  it('rejects invalid subscription attempts and reports join errors', async () => {
    const recordsService = (global as any).sails.services.recordsservice;
    recordsService.getMeta.rejects(new Error('not found'));
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.subscribe(makeRequest({ roomId: 'unknown-room' }), {} as Sails.Res);
    expect(sendResp.firstCall.args[2].data.status).to.be.false;

    recordsService.getMeta.resolves({ redboxOid: 'record-1' });
    recordsService.hasViewAccess.returns(false);
    await controller.subscribe(makeRequest({ roomId: 'record-1' }), {} as Sails.Res);
    expect(sendResp.getCalls().some((call) => call.args[2]?.status === 403)).to.be.true;

    await controller.subscribe(makeRequest({ roomId: 'record-1' }, undefined), {} as Sails.Res);
    expect(sendResp.getCalls().filter((call) => call.args[2]?.status === 403)).to.have.length(3);

    const badRequest = sinon.stub();
    await controller.subscribe({ isSocket: false, param: sinon.stub() } as unknown as Sails.Req, { badRequest } as unknown as Sails.Res);
    expect(badRequest.calledOnce).to.be.true;

    recordsService.hasViewAccess.returns(true);
    (global as any).sails.sockets.join.callsFake((_req: unknown, _roomId: string, callback: (error: unknown) => void) => callback(new Error('join failed')));
    await controller.subscribe(makeRequest({ roomId: 'record-1' }), {} as Sails.Res);
    expect(sendResp.callCount).to.equal(4);
  });

  it('only stops jobs owned by the authenticated user', () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    (global as any).AsynchsService.get.returns(of([{ id: 'job-1', started_by: 'alice' }]));
    controller.stop(makeRequest({ id: 'job-1' }), {} as Sails.Res);
    expect((global as any).AsynchsService.finish.calledOnce).to.be.true;

    (global as any).AsynchsService.get.returns(of([{ id: 'job-2', started_by: 'bob' }]));
    controller.stop(makeRequest({ id: 'job-2' }), {} as Sails.Res);
    expect(sendResp.getCalls().some((call) => call.args[2]?.status === 403)).to.be.true;

    (global as any).AsynchsService.get.returns(of([]));
    controller.stop(makeRequest({ id: 'missing' }, undefined), {} as Sails.Res);
    expect((global as any).AsynchsService.finish.callCount).to.equal(1);
  });

  it('only updates jobs owned by the authenticated user', () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    (global as any).AsynchsService.get.returns(of([{ id: 'job-1', started_by: 'alice' }]));
    controller.update(makeRequest({
      id: 'job-1',
      relatedRecordId: 'record-1',
      taskType: 'export',
      status: 'running',
    }), {} as Sails.Res);
    expect((global as any).AsynchsService.update.calledOnce).to.be.true;

    (global as any).AsynchsService.get.returns(of([{ id: 'job-2', started_by: 'bob' }]));
    controller.update(makeRequest({ id: 'job-2' }), {} as Sails.Res);
    expect(sendResp.getCalls().some((call) => call.args[2]?.status === 403)).to.be.true;
  });
});
