import { GenerationError } from '../../src/model/generation';
import { getEffectiveRelatedClientForm } from '../../src/related-records/effective-form';
import { RelatedDisplayWriteError } from '../../src/related-records/normalize-display-writes';
import { deletedRecordSummary } from '../../src/DeletedRecordSummary';
import { bulkDeletedRecordsBody } from '../../src/api-routes/groups/deleted-records';
import {createSinonStubLogger} from "../logger.test";

let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import { firstValueFrom, of } from 'rxjs';
import { tmpdir } from 'node:os';
import { MemoryStore, Cookie } from 'express-session';
import { readRouteForm, routeFormContractName } from '../../src/RecordRouteForm';
import { Settings } from 'luxon';
import { Controllers } from '../../src/controllers/RecordController';
import { UserModel, RoleModel } from '../../src/model';
import { Services as RecordServices } from '../../src/services/RecordsService';
import { Services as FormServices } from '../../src/services/FormsService';
import { Services as ValidationServices } from '../../src/services/RecordValidationService';
import { Controllers as AsynchControllers } from '../../src/controllers/AsynchController';
import { RecordSaveResponse } from '../../src/RecordSaveResponse';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';
import { routes, RouteTargetObject } from '../../src/config/routes.config';
import { Services as FormConsistencyServices } from '../../src/services/FormRecordConsistencyService';
import { dataRecordProjectedMetadata, dataRecordProjectionForm } from '../fixtures/metadata-projection.fixtures';
import { buildNestedViewForm, nestedViewFixture } from '../fixtures/nested-view-metadata.fixtures';
import type { FormConfigFrame, FormRowEdit, FormRowProofs } from '@researchdatabox/sails-ng-common';
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
      getRecordFormFingerprint: sinon.stub().resolves('sha256:test'),
      hasTransitionRoleAuthorization: sinon.stub().resolves(true),
      updateMeta: async (...args: unknown[]) => {
        const arg = args[7] as { metadata: unknown; mode: string };
        await updateMeta(...args.slice(0, 7), arg.metadata, arg.mode);
        const result = new RecordSaveResponse();
        result.confirmPrimaryPersistence(currentRecord.redboxOid);
        return result;
      },
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
      headers: {},
      params: { oid: currentRecord.redboxOid },
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
    expect(json.firstCall.args[0].data).to.deep.include({ redboxOid: 'oid-1' });
    expect(json.firstCall.args[0].data).not.to.have.property('metadata');
  });

  it('rejects saves from a stale workflow form and asks a transitioning editor to reload', async () => {
    const stale = makeResponse();
    await controller.update(makeRequest({ title: 'Discarded' }, {
      formSave: 'true', formName: 'previous-form',
    }), stale.res);
    sinon.assert.calledOnceWithExactly(stale.status, 409);
    sinon.assert.notCalled(updateMeta);

    const response = makeResponse();
    const getMeta = controller.recordsService.getMeta as sinon.SinonStub;
    updateMeta.callsFake(async () => {
      getMeta.resolves({ ...currentRecord, metaMetadata: { ...currentRecord.metaMetadata, form: 'review-form' } });
      return { success: true, isSuccessful: () => true };
    });
    await controller.update(makeRequest({ title: 'Ready' }, {
      formSave: 'true', loadedWorkflowForm: currentRecord.metaMetadata.form, targetStep: 'review', apiVersion: '2.0',
    }), response.res);
    expect(response.json.firstCall.args[0].meta.reloadEditForm).to.equal(true);
    sinon.assert.calledOnce(updateMeta);
  });

  it('saves newly imported contributors and proof-backed retained rows before a workflow transition', async () => {
    const path = '["contributors"]';
    const outgoing = { name: 'Legacy creator', known_ids: ['old-identifier'] };
    const retained = { name: 'Disabled creator', known_ids: ['keep-identifier'], internalCode: 'Keep' };
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    read.resolves({ ...currentRecord, metadata: { ...currentRecord.metadata, contributors: [outgoing, retained] } });
    updateMeta.callsFake(async (...args) => {
      read.resolves({ ...currentRecord, metadata: args[7] });
      return { success: true, isSuccessful: () => true };
    });

    const form = await loadFormForRowEdits();
    const draft = makeResponse();
    await controller.update(await rowSaveRequest({
      contributors: [null, { name: 'Imported', internalCode: 'Forged' }],
    }, { [path]: [{ retain: 1 }, null] }, form), draft.res);
    expect(updateMeta.firstCall.args[7]).to.deep.equal({
      ...currentRecord.metadata, contributors: [retained, { name: 'Imported' }],
    });

    const proofs = draft.json.firstCall.args[0].meta.savedRowProofs;
    const subsequent = await rowSaveRequest({
      contributors: [null, { name: 'Edited import' }],
    }, { [path]: [{ retain: 0 }, 1] }, { ...form, proofs });
    await controller.update(subsequent, makeResponse().res);
    expect(updateMeta.secondCall.args[7].contributors).to.deep.equal([retained, { name: 'Edited import' }]);

    read.resolves({
      ...currentRecord, metadata: {
        ...currentRecord.metadata, contributors: [retained, { name: 'Edited import', known_ids: ['outgoing-identity'] }],
      },
    });
    const submit = await rowSaveRequest({
      contributors: [null, { name: 'Edited import' }],
    }, { [path]: [{ retain: 0 }, null] }, await loadFormForRowEdits());
    submit.query.targetStep = 'review';
    await controller.update(submit, makeResponse().res);
    expect(updateMeta.thirdCall.args[6]).to.equal(nextStep);
    expect(updateMeta.thirdCall.args[7].contributors).to.deep.equal([retained, { name: 'Edited import' }]);
  });

  it('keeps replacement and explicit merge semantics for other callers', async () => {
    const { res } = makeResponse();
    const body = { title: 'Replacement', keywords: [] };

    await controller.update(makeRequest(body, {}), res);
    await controller.update(makeRequest(body, { merge: 'true' }), res);

    sinon.assert.notCalled((FormsService.getFormByName as sinon.SinonStub).withArgs(sinon.match.any, true));
    expect(updateMeta.firstCall.args[7]).to.deep.equal(body);
    expect(updateMeta.secondCall.args[7]).to.deep.equal(body);
    expect(updateMeta.firstCall.args[8]).to.equal('replace');
    expect(updateMeta.secondCall.args[8]).to.equal('merge');
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
    expect(response.json.firstCall.args[0].data).to.deep.include({ redboxOid: 'oid-1' });
    expect(response.json.firstCall.args[0].data).not.to.have.property('metadata');

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

  it('confirms list values independently of row proofs and preserves a hook change on a title save', async () => {
    const selector: FormConfigFrame = {
      ...formConfig,
      componentDefinitions: [...formConfig.componentDefinitions!, {
        name: 'dataLocations',
        model: { class: 'PublishDataLocationSelectorModel' },
        component: { class: 'PublishDataLocationSelectorComponent' },
      }],
    };
    (FormsService.getFormByName as sinon.SinonStub).returns(of({
      id: 'form-1', name: 'publication-draft', branding: 'brand-1', configuration: selector,
    }));
    const original = { type: 'url', location: 'https://example.test/original' };
    const addedByHook = { type: 'url', location: 'https://example.test/hook' };
    const read = controller.recordsService.getMeta as sinon.SinonStub;
    read.resolves({ ...currentRecord, metadata: { ...currentRecord.metadata, dataLocations: [original] } });
    let runHook = true;
    updateMeta.callsFake(async (...args) => {
      const metadata = runHook ? { ...args[7], dataLocations: [addedByHook] } : args[7];
      read.resolves({ ...currentRecord, metadata });
      return { success: true, isSuccessful: () => true };
    });

    const response = makeResponse();
    await controller.update(await rowSaveRequest({ dataLocations: [], keywords: ['Rebuilt'] }, {}), response.res);
    expect(updateMeta.lastCall.args[7].dataLocations).to.deep.equal([]);
    expect(response.json.firstCall.args[0].meta.confirmedListPaths).to.deep.equal(['["keywords"]']);
    expect(response.json.firstCall.args[0].meta.savedRowProofs['["keywords"]']).to.have.length(1);

    runHook = false;
    await controller.update(makeRequest({ title: 'New title' }, { formSave: 'true', apiVersion: '2.0' }), makeResponse().res);
    expect(updateMeta.lastCall.args[7]).to.include({ title: 'New title' });
    expect(updateMeta.lastCall.args[7].dataLocations).to.deep.equal([addedByHook]);
    expect(updateMeta.lastCall.args[7].keywords).to.deep.equal(['Rebuilt']);

    const cleared = makeResponse();
    await controller.update(await rowSaveRequest({ dataLocations: [] }, {}), cleared.res);
    expect(updateMeta.lastCall.args[7].dataLocations).to.deep.equal([]);
    expect(cleared.json.firstCall.args[0].meta.confirmedListPaths).to.deep.equal(['["dataLocations"]']);
    expect(cleared.json.firstCall.args[0].meta.savedRowProofs).to.deep.equal({ '["dataLocations"]': [] });
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

  it('saves fields enabled through component.disabled while preserving independently disabled fields', async () => {
    const dynamicField = {
      ...input('conditional'),
      model: { class: 'SimpleInputModel' as const, config: { disabled: true } },
      component: { class: 'SimpleInputComponent' as const, config: { disabled: true } },
      expressions: [{ name: 'enable', config: { target: 'component.disabled' as const, template: 'false' } }],
    };
    const lookup = FormsService.getFormByName as sinon.SinonStub;
    lookup.returns(of({
      id: 'form-dynamic', name: formConfig.name, branding: 'brand-1',
      configuration: {
        ...formConfig, componentDefinitions: [
          dynamicField,
          { ...dynamicField, name: 'lockedLayout', layout: { class: 'DefaultLayout', config: { disabled: true } } },
          { ...dynamicField, name: 'lockedComponent', expressions: [{
            name: 'enable-model-only', config: { target: 'model.disabled', template: 'false' },
          }] },
        ],
      },
    }));
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      ...currentRecord, metadata: { conditional: 'Before', lockedLayout: 'Keep layout', lockedComponent: 'Keep component' },
    });
    await controller.update(makeRequest({
      conditional: 'Edited', lockedLayout: 'Ignore', lockedComponent: 'Ignore',
    }, { formSave: 'true' }), makeResponse().res);
    expect(updateMeta.firstCall.args[7]).to.deep.equal({
      conditional: 'Edited', lockedLayout: 'Keep layout', lockedComponent: 'Keep component',
    });
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



});

describe('RecordController getWorkflowSteps', () => {
  let controller: Controllers.Record;
  let originalSails: any;
  let originalBrandingService: any;
  let originalRecordTypesService: any;
  let originalWorkflowStepsService: any;
  let originalDashboardTypesService: any;
  let originalFormsService: any;
  let originalFormRecordConsistencyService: any;
  let originalTranslationService: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalRecordTypesService = (global as any).RecordTypesService;
    originalWorkflowStepsService = (global as any).WorkflowStepsService;
    originalDashboardTypesService = (global as any).DashboardTypesService;
    originalFormsService = (global as any).FormsService;
    originalFormRecordConsistencyService = (global as any).FormRecordConsistencyService;
    originalTranslationService = (global as any).TranslationService;

    (global as any).sails = {
      config: {},
      log: createSinonStubLogger(sinon),
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
    (global as any).WorkflowStepsService.getAllForRecordTypeIncludingHidden = sinon.stub().callsFake((...args) => (global as any).WorkflowStepsService.getAllForRecordType(...args));
    (global as any).DashboardTypesService = {
      getDashboardView: sinon.stub(),
    };
    (global as any).FormsService = {
      getFormByStartingWorkflowStep: sinon.stub(),
      getFormByName: sinon.stub(),
      buildClientFormConfig: sinon.stub(),
      discoverValidationOperations: sinon.stub(),
      getForm: sinon.stub(),
    };
    (global as any).FormRecordConsistencyService = {
      projectMetadataClientFormConfig: sinon.stub(),
      metadataForViewForm: new FormConsistencyServices.FormRecordConsistency().metadataForViewForm,
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake(
        (key: string) =>
          ({
            'default-title': 'Site',
            'rdmp-title-label': 'RDMP',
            'dataRecord-title-label': 'Data Record',
            workspaces: 'Workspaces',
          })[key] ?? key
      ),
    };

    controller = new Controllers.Record();
    controller.recordsService = {
      getMeta: sinon.stub(),
      getDeletedRecordMeta: sinon.stub(),
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
    (global as any).FormRecordConsistencyService = originalFormRecordConsistencyService;
    (global as any).TranslationService = originalTranslationService;
  });

  it('maps a browser update transient display rejection to 400 on API v2 and keeps the v1 500', async () => {
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
    controller.recordsService = {
      getMeta: sinon.stub().resolves({ redboxOid: 'oid-1', metaMetadata: { brandId: 'brand-1', type: 'dataset', form: '' }, metadata: {}, authorization: {} }),
      hasEditAccess: sinon.stub().returns(true),
      updateMeta: sinon.stub().rejects(new RelatedDisplayWriteError()),
    } as any;
    const send = sinon.stub(controller as any, 'sendResp');
    const request = (apiVersion: string) => ({ body: { title: 'PRIVATE' }, headers: { 'x-redbox-api-version': apiVersion }, params: { oid: 'oid-1' }, query: {}, session: { branding: 'default' }, user: { username: 'tester' } });
    await (controller as any).updateInternal(request('2.0'), {});
    expect(send.firstCall.args[2].status).to.equal(400);
    expect(send.firstCall.args[2].displayErrors[0].code).to.equal('related-display-field-not-writable');
    expect(JSON.stringify(send.firstCall.args[2])).not.to.include('PRIVATE');
    // API v1 keeps its existing contract: non-conflict save failures are server errors.
    await (controller as any).updateInternal(request('1.0'), {});
    expect(send.secondCall.args[2].status).to.equal(500);
    expect(JSON.stringify(send.secondCall.args[2])).not.to.include('PRIVATE');
  });

  it('renders the admin Parties route with the existing party dashboard', () => {
    const sendView = sinon.stub(controller as any, 'sendView');
    const req = { options: { locals: {} }, param: sinon.stub(), session: { branding: 'default' } } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    controller.renderParties(req, res);
    expect(routes['get /:branding/:portal/admin/parties']).to.equal('RecordController.renderParties');
    expect(sendView.firstCall.args[2]).to.equal('dashboard');
    expect(sendView.firstCall.args[3]).to.include({ recordType: 'party', packageType: 'party', adminParties: true, showAdminSideBar: true });
  });

  describe('metadata update timestamps', () => {
    let originalZone: typeof Settings.defaultZone;

    beforeEach(() => {
      originalZone = Settings.defaultZone;
      Settings.defaultZone = 'Australia/Brisbane';
      sinon.stub(Date, 'now').returns(Date.parse('2026-09-24T04:30:00Z'));
    });

    afterEach(() => {
      Settings.defaultZone = originalZone;
    });

    it('passes a UTC save timestamp and the updated metadata to the record service', async () => {
      const brand = { id: 'brand-1' };
      const user = { username: 'user-1' };
      const record = {
        metaMetadata: { brandId: brand.id, createdOn: '2026-09-01T00:00:00Z' },
        metadata: { title: 'Original title' },
      };
      const metadata = { title: 'Updated title' };
      const saved = { success: true };
      const updateMeta = sinon.stub().resolves(saved);
      controller.recordsService.updateMeta = updateMeta;

      const result = await firstValueFrom((controller as any).saveMetadata(brand, 'oid-1', record, metadata, user));

      expect(result).to.equal(saved);
      expect(updateMeta.calledOnce).to.equal(true);
      expect(updateMeta.firstCall.args).to.deep.equal([
        brand,
        'oid-1',
        {
          metaMetadata: {
            brandId: brand.id,
            createdOn: '2026-09-01T00:00:00Z',
            lastSavedBy: user.username,
            lastSaveDate: '2026-09-24T04:30:00.000Z',
          },
          metadata,
        },
        user,
        true,
        true,
        {},
        { metadata, mode: 'pre-applied' },
      ]);
    });
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

    expect((controller.recordsService.getResolvedPermissionsSummary as sinon.SinonStub).calledOnceWithExactly('oid-1'))
      .to.be.true;
    expect(sendRespStub.firstCall.args[2]?.data).to.deep.equal({ edit: true, view: true });
  });

  it('returns revision metadata and ETag on an authorized browser record read', async () => {
    const req = {
      param: sinon.stub().withArgs('oid').returns('oid-1'),
      query: {},
      user: { username: 'alice' },
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const record = {
      redboxOid: 'oid-1',
      revision: 3,
      metaMetadata: { brandId: 'brand-1' },
      metadata: { title: 'Current' },
    };
    (controller.recordsService.getMeta as sinon.SinonStub).resolves(record);
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getMeta(req, {} as Sails.Res);

    expect(sendResp.firstCall.args[2]).to.deep.equal({
      data: record.metadata,
      meta: { oid: 'oid-1', revision: 3, entityTag: formatRecordEntityTag('oid-1', 3) },
      v1: record.metadata,
      headers: { ETag: formatRecordEntityTag('oid-1', 3) },
    });
  });

  describe('view saved metadata authorization', () => {
    const round3Cases: Array<{ name: string; mutate: (data: any, saved: any) => void; check: (projected: any, response: any, saved: any) => void; retain?: boolean }> = [];
    for (const retain of [false, true]) {
      for (const location of ['top', 'nested', 'row']) {
        for (const value of ['workspace-secret', ['workspace-secret'], 42, false, null, { saved: 'workspace-secret' }]) {
          round3Cases.push({ name: `static content ${location} ${JSON.stringify(value)} retained=${retain}`, retain,
            mutate: (data, saved) => {
              const field = { name: 'workspaces', component: { class: 'ContentComponent', config: { content: 'Relationships' } } };
              const defs = location === 'top' ? data.componentDefinitions : location === 'nested'
                ? data.componentDefinitions[0].component.config.componentDefinitions
                : data.componentDefinitions[1].component.config.elementTemplate.component.config.componentDefinitions;
              defs.push(field);
              const target = location === 'top' ? saved : location === 'nested' ? saved.parent : saved.rows[0];
              target.workspaces = value;
            },
            check: (projected, response) => {
              const target = location === 'top' ? projected : location === 'nested' ? projected.parent : projected.rows[0];
              expect(target).not.to.have.property('workspaces');
              expect(JSON.stringify(response)).not.to.contain('workspace-secret');
              const parent = response.data?.componentDefinitions?.[0];
              if (retain && location === 'nested' && parent) expect(parent.model.config.value).not.to.have.property('workspaces');
            },
          });
        }
      }
    }
    for (const location of ['top', 'nested']) {
      for (const value of [[{ public: 'visible', restricted: 'malformed-role-secret' }], ['malformed-role-secret'], 'malformed-role-secret', 42, false, null]) {
        round3Cases.push({ name: `malformed transformed group ${location} ${JSON.stringify(value)}`,
          mutate: (_data, saved) => { if (location === 'top') saved.parent = value; else saved.parent.nested = value; },
          check: (projected, response) => {
            expect(location === 'top' ? projected : projected.parent).not.to.have.property(location === 'top' ? 'parent' : 'nested');
            expect(JSON.stringify(response)).not.to.contain('malformed-role-secret');
            const content = response.data?.componentDefinitions?.[0]?.component.config.content;
            if (content !== undefined) {
              expect(content).to.be.an('object');
              if (location === 'nested') expect(content).not.to.have.property('nested');
            }
          },
        });
      }
    }
    for (const retain of [false, true]) {
      round3Cases.push({ name: `whole nested optionObject leaves retained=${retain}`, retain,
        mutate: (data, saved) => {
          const leaf = { name: 'school', component: { class: 'TypeaheadInputComponent', config: { valueMode: 'optionObject' } }, model: { class: 'TypeaheadInputModel' } };
          const school = { label: 'School of Testing', value: 'TEST', sourceType: 'static', extra: { saved: true } };
          for (const group of [data.componentDefinitions[0], data.componentDefinitions[1].component.config.elementTemplate]) {
            group.component.config.componentDefinitions.push(structuredClone(leaf));
            group.component.config.componentDefinitions.find((c: any) => c.name === 'nested').component.config.componentDefinitions.push(structuredClone(leaf));
          }
          saved.parent.school = school; saved.parent.nested.school = school;
          saved.rows.forEach((row: any) => { row.school = school; row.nested.school = school; });
        },
        check: (projected, response, saved) => {
          expect(projected.parent.school).to.deep.equal(saved.parent.school);
          expect(projected.parent.nested.school).to.deep.equal(saved.parent.nested.school);
          projected.rows.forEach((row: any, i: number) => {
            expect(row.school).to.deep.equal(saved.rows[i].school);
            expect(row.nested.school).to.deep.equal(saved.rows[i].nested.school);
          });
          for (const secret of ['role-secret', 'mode-secret', 'server-secret']) expect(JSON.stringify(response)).not.to.contain(secret);
        },
      });
    }
    for (const endpoint of ['getForm', 'getMeta'] as const) {
      for (const scenario of round3Cases) {
        it(`round3 ${endpoint} ${scenario.name}`, async () => {
          const { data, metadata } = nestedViewFixture(scenario.retain ?? false);
          scenario.mutate(data, metadata);
          const form = { name: data.name, configuration: data };
          const record = { redboxOid: 'oid-1', metaMetadata: { brandId: 'brand-1', type: 'dataset', form: form.name }, metadata };
          (global as any).sails.config = { reusableFormDefinitions: {} };
          (global as any).sails.services = { formpayloadprehydrateservice: { build: sinon.stub().resolves({}) } };
          (global as any).FormsService.getForm.resolves(form);
          (global as any).FormsService.getFormByName.returns(of(form));
          (global as any).FormsService.discoverValidationOperations.resolves([]);
          (global as any).FormsService.buildClientFormConfig.callsFake(buildNestedViewForm);
          (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
          (controller.recordsService.getMeta as sinon.SinonStub).callsFake(async () => structuredClone(record));
          (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
          Object.assign(controller.recordsService, { getRecordFormFingerprint: sinon.stub().resolves('fingerprint') });
          const req = { param: sinon.stub().callsFake(name => name === 'oid' ? 'oid-1' : name === 'name' ? 'dataset' : undefined),
            query: { edit: 'false', apiVersion: '2.0' }, session: { branding: 'default' },
            user: { username: 'reader', roles: [{ name: 'Researcher' }] },
          } as unknown as Sails.Req;
          const sendResp = sinon.stub(controller as any, 'sendResp');
          await controller[endpoint](req, {} as Sails.Res);
          const response = sendResp.firstCall.args[2];
          expect(response.status).not.to.equal(500);
          scenario.check(endpoint === 'getForm' ? response.meta.runtimeContext.record.metadata : response.data, response, metadata);
        });
      }
    }

    for (const endpoint of ['getForm', 'getMeta'] as const) {
      for (const roles of [['Researcher', 'Guest'], ['Admin', 'Librarians', 'Researcher', 'Guest']]) {
        for (const scenario of ['leaf', 'rows', 'malformed-top', 'malformed-nested', 'string', 'empty', 'fallback']) {
          it(`round2 ${endpoint} whole response ${scenario} for ${roles}`, async () => {
            const { data, metadata } = nestedViewFixture(scenario.startsWith('malformed'));
            const saved = metadata as any;
            saved.information_steward = { name: 'School of Testing', code: 'TEST', extra: { saved: true } };
            saved.workspaces = [{ restricted: 'workspace-secret' }];
            (data.componentDefinitions as any[]).push({ name: 'information_steward',
              component: { class: 'TypeaheadInputComponent', config: { displayField: 'name' } },
              model: { class: 'TypeaheadInputModel' },
            }, { name: 'workspaces', component: { class: 'ContentComponent', config: { content: 'Relationships' } } });
            if (scenario === 'rows') saved.rows = [{ public: '', restricted: 'first-role-secret' }, { public: 'second' }];
            if (scenario === 'malformed-top') saved.parent = [{ public: 'visible', restricted: 'malformed-role-secret' }];
            if (scenario === 'malformed-nested') saved.parent.nested = [{ public: 'visible', restricted: 'malformed-role-secret' }];
            if (scenario === 'fallback') saved.parent = { restricted: 'fallback-role-secret' };
            const form = { name: data.name, configuration: data };
            const record = { redboxOid: 'oid-1', metaMetadata: { brandId: 'brand-1', type: 'dataset', form: form.name }, metadata };
            (global as any).sails.config = { reusableFormDefinitions: {} };
            (global as any).sails.services = { formpayloadprehydrateservice: { build: sinon.stub().resolves({}) } };
            (global as any).FormsService.getForm.resolves(form);
            (global as any).FormsService.getFormByName.returns(of(form));
            (global as any).FormsService.discoverValidationOperations.resolves([]);
            (global as any).FormsService.buildClientFormConfig.callsFake(async (...args) => {
              const built = await buildNestedViewForm(args[0], args[1], args[2], args[3]);
              if (scenario === 'string' || scenario === 'empty') {
                for (const node of built.componentDefinitions.slice(0, 2)) {
                  node.component.config.content = scenario === 'string' ? 'Display only' : '';
                }
              }
              return built;
            });
            (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
            (controller.recordsService.getMeta as sinon.SinonStub).callsFake(async () => structuredClone(record));
            (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
            Object.assign(controller.recordsService, { getRecordFormFingerprint: sinon.stub().resolves('fingerprint') });
            const req = { param: sinon.stub().callsFake(name => name === 'oid' ? 'oid-1' : name === 'name' ? 'dataset' : undefined),
              query: { edit: 'false', apiVersion: '2.0' }, session: { branding: 'default' },
              user: { username: 'reader', roles: roles.map(name => ({ name, branding: 'brand-1' })) },
            } as unknown as Sails.Req;
            const sendResp = sinon.stub(controller as any, 'sendResp');
            await controller[endpoint](req, {} as Sails.Res);
            const response = sendResp.firstCall.args[2];
            expect(response.status).not.to.equal(500);
            const projected = endpoint === 'getForm' ? response.meta.runtimeContext.record.metadata : response.data;
            const serialized = JSON.stringify(response);
            // Check the whole response before the leaf assertion, so malformed
            // retained model leaks are independently visible in the red run.
            expect(serialized).not.to.contain('workspace-secret');
            if (!roles.includes('Admin')) {
              expect(serialized).not.to.contain('role-secret');
              expect(serialized).not.to.contain('service-result');
              expect(serialized).not.to.contain('irds-result');
            }
            expect(serialized).not.to.contain('server-secret');
            if (scenario === 'rows' && !roles.includes('Admin')) {
              expect(projected.rows).to.deep.equal([{ public: 'second' }]);
            }
            expect(projected.information_steward).to.deep.equal(saved.information_steward);
            expect(serialized).to.contain('School of Testing');
            expect(projected).not.to.have.property('workspaces');
          });
        }
      }
    }

    for (const retain of [true, false]) {
      for (const roles of [['Researcher'], ['Admin']]) {
        for (const endpoint of ['getForm', 'getMeta'] as const) {
          it(`${endpoint} projects nested view metadata for ${roles}, retained containers=${retain}`, async () => {
            const { data, metadata, expected } = nestedViewFixture(retain);
            const form = { name: data.name, configuration: data };
            const record = {
              redboxOid: 'oid-1',
              metaMetadata: { brandId: 'brand-1', type: 'dataset', form: form.name },
              metadata,
            };
            (global as any).sails.config = { reusableFormDefinitions: {} };
            (global as any).sails.services = {
              formpayloadprehydrateservice: { build: sinon.stub().resolves({}) },
            };
            (global as any).FormsService.getForm.resolves(form);
            (global as any).FormsService.getFormByName.returns(of(form));
            (global as any).FormsService.discoverValidationOperations.resolves([]);
            (global as any).FormsService.buildClientFormConfig.callsFake(buildNestedViewForm);
            (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
            (controller.recordsService.getMeta as sinon.SinonStub).callsFake(async () => structuredClone(record));
            (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
            Object.assign(controller.recordsService, { getRecordFormFingerprint: sinon.stub().resolves('fingerprint') });
            const req = {
              param: sinon.stub().callsFake(name => name === 'oid' ? 'oid-1' : name === 'name' ? 'dataset' : undefined),
              query: { edit: 'false', apiVersion: '2.0' }, session: { branding: 'default' },
              user: { username: 'reader', roles: roles.map(name => ({ name, branding: 'brand-1' })) },
            } as unknown as Sails.Req;
            const sendResp = sinon.stub(controller as any, 'sendResp');
            await controller[endpoint](req, {} as Sails.Res);
            const response = sendResp.firstCall.args[2];
            expect(response.status).not.to.equal(500);
            const result = endpoint === 'getForm' ? response.meta.runtimeContext.record.metadata : response.data;
            expect(result).to.deep.equal(expected(roles));
            const serialized = JSON.stringify(response);
            for (const secret of ['mode-secret', 'server-secret', 'top-level-secret']) {
              expect(serialized).not.to.contain(secret);
            }
            expect(serialized.includes('role-secret')).to.equal(roles.includes('Admin'));
          });
        }
      }
    }

    for (const roles of [['Researcher'], ['Admin']]) {
      for (const mode of ['view', 'edit']) {
        it(`filters real ${mode} forms for ${roles} on both record endpoints`, async () => {
          const { ConstructFormConfigVisitor } = require('../../src/visitor/construct.visitor');
          const { ClientFormConfigVisitor } = require('../../src/visitor/client.visitor');
          const { nothingLogger } = require('@researchdatabox/sails-ng-common');
          const service = new FormConsistencyServices.FormRecordConsistency();
          (global as any).FormRecordConsistencyService = service;
          const fields = ['title', 'restricted', 'editOnly'].map((name) => ({
            name,
            component: { class: 'SimpleInputComponent', config: {} },
            model: { class: 'SimpleInputModel', config: {} },
            ...(name === 'restricted' ? { constraints: { authorization: { allowRoles: ['Admin'] } } } : {}),
            ...(name === 'editOnly' ? { constraints: { allowModes: ['edit'] } } : {}),
          }));
          const form = {
            name: 'dataset-draft',
            configuration: { type: 'dataset', name: 'dataset-draft', componentDefinitions: fields },
          };
          const record = {
            redboxOid: 'oid-1',
            metaMetadata: { brandId: 'brand-1', type: 'dataset', form: form.name },
            metadata: {
              title: 'Visible',
              restricted: 'restricted-secret',
              editOnly: 'edit-secret',
              serverOnly: 'server-secret',
            },
          };
          (global as any).sails.config = { reusableFormDefinitions: {} };
          (global as any).sails.services = {
            formpayloadprehydrateservice: { build: sinon.stub().resolves({}) },
          };
          (global as any).FormsService.getForm.resolves(form);
          (global as any).FormsService.getFormByName.returns(of(form));
          (global as any).FormsService.discoverValidationOperations.resolves([]);
          (global as any).FormsService.buildClientFormConfig.callsFake(
            async (data, formMode, userRoles, metadata) => {
              const constructed = await new ConstructFormConfigVisitor(nothingLogger).start({
                data,
                formMode,
                record: metadata,
              });
              return new ClientFormConfigVisitor(nothingLogger).start({
                form: constructed,
                formMode,
                userRoles,
              });
            },
          );
          (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
          (controller.recordsService.getMeta as sinon.SinonStub).callsFake(async () => structuredClone(record));
          (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(mode === 'edit');
          Object.assign(controller.recordsService, {
            getRecordFormFingerprint: sinon.stub().resolves('fingerprint'),
          });
          const req = {
            param: sinon
              .stub()
              .callsFake((name) => (name === 'oid' ? 'oid-1' : name === 'name' ? 'dataset' : undefined)),
            query: { edit: String(mode === 'edit'), apiVersion: '2.0' },
            session: { branding: 'default' },
            user: { username: 'reader', roles: roles.map((name) => ({ name, branding: 'brand-1' })) },
          } as unknown as Sails.Req;
          const sendResp = sinon.stub(controller as any, 'sendResp');
          await controller.getForm(req, {} as Sails.Res);
          const response = sendResp.firstCall.args[2];
          expect(response.status).not.to.equal(500);
          if (mode === 'view') {
            expect(response.meta.runtimeContext.record.metadata).to.deep.equal({
              title: 'Visible',
              ...(roles.includes('Admin') ? { restricted: 'restricted-secret' } : {}),
            });
            expect(JSON.stringify(response.meta)).not.to.contain('edit-secret');
            expect(JSON.stringify(response.meta)).not.to.contain('server-secret');
            expect(JSON.stringify(response.meta).includes('restricted-secret')).to.equal(
              roles.includes('Admin'),
            );
          } else {
            expect(response.meta.runtimeContext.record).not.to.have.property('metadata');
          }
          sendResp.resetHistory();
          await controller.getMeta(req, {} as Sails.Res);
          expect(sendResp.firstCall.args[2].data).to.deep.equal({
            title: 'Visible',
            ...(roles.includes('Admin') ? { restricted: 'restricted-secret' } : {}),
            ...(mode === 'edit' ? { editOnly: 'edit-secret' } : {}),
          });
          // Project before role/mode filtering: authorized related data cannot
          // make a field removed from the caller's form visible again.
          Object.assign(controller.recordsService, {
            getConsumerView: sinon.stub().callsFake(async (raw: any) => ({ ...raw,
              metadata: { ...raw.metadata, title: 'Current projected title',
                restricted: 'projected-role-secret', serverOnly: 'projected-server-secret' },
            })),
          });
          req.query.consumerView = 'true';
          sendResp.resetHistory();
          await controller.getMeta(req, {} as Sails.Res);
          expect(sendResp.firstCall.args[2].data).to.deep.equal({
            title: 'Current projected title',
            ...(roles.includes('Admin') ? { restricted: 'projected-role-secret' } : {}),
          });
          expect(JSON.stringify(sendResp.firstCall.args[2])).not.to.contain('projected-server-secret');
          expect(record.metadata.title).to.equal('Visible');
        });
      }
    }
  });

  describe("Data Record metadata projection", () => {
    function prepareProjection() {
      const service = new FormConsistencyServices.FormRecordConsistency();
      FormRecordConsistencyService = service;
      (FormsService.getFormByName as sinon.SinonStub).returns(
        of({ configuration: dataRecordProjectionForm }),
      );
      (FormsService.buildClientFormConfig as sinon.SinonStub).resolves(
        dataRecordProjectionForm,
      );
      (controller.recordsService.getMeta as sinon.SinonStub).resolves({
        redboxOid: "representative-data-record",
        metaMetadata: {
          type: "dataRecord",
          form: dataRecordProjectionForm.name,
          brandId: "brand-1",
        },
        metadata: {
          ...dataRecordProjectedMetadata,
          serverOnly: { credentials: "hidden" },
        },
      });
      const req = {
        param: sinon.stub().withArgs("oid").returns("representative-data-record"),
        query: {},
        user: { username: "researcher", roles: [{ name: "Researcher", branding: "brand-1" }] },
        session: { branding: "default" },
      } as unknown as Sails.Req;
      const response = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub(),
        set: sinon.stub().returnsThis(),
      };
      return { service, req, response };
    }

    it("returns 200 with Data Locations and Data Manager using the real projection and response path", async () => {
      const { req, response } = prepareProjection();

      await controller.getMeta(req, response as unknown as Sails.Res);

      expect(response.status.calledOnceWithExactly(200)).to.be.true;
      expect(response.json.calledOnceWithExactly(dataRecordProjectedMetadata)).to
        .be.true;
      expect(
        (
          FormsService.buildClientFormConfig as sinon.SinonStub
        ).firstCall.args.slice(1, 3),
      ).to.deep.equal(["edit", ["Researcher"]]);
    });

    it("returns 403 without projecting metadata when record view access is denied", async () => {
      const { service, req, response } = prepareProjection();
      const project = sinon.spy(service, "projectMetadataClientFormConfig");
      (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(false);

      await controller.getMeta(req, response as unknown as Sails.Res);

      expect(response.status.calledOnceWithExactly(403)).to.be.true;
      expect(project.notCalled).to.be.true;
      expect((FormsService.buildClientFormConfig as sinon.SinonStub).notCalled).to
        .be.true;
    });

    it("returns 500 without raw metadata when projection fails", async () => {
      const { service, req, response } = prepareProjection();
      sinon
        .stub(service, "projectMetadataClientFormConfig")
        .rejects(new Error("Invalid form schema"));

      await controller.getMeta(req, response as unknown as Sails.Res);

      expect(response.status.calledOnceWithExactly(500)).to.be.true;
      expect(response.json.firstCall.args[0]).to.have.property(
        "message",
        "Failed to filter metadata for this record.",
      );
      expect(JSON.stringify(response.json.firstCall.args[0])).not.to.contain(
        "serverOnly",
      );
    });
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
        (controller.recordsService.hasEditAccess as sinon.SinonStub).resetHistory();

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
            (controller.recordsService.getMeta as sinon.SinonStub).resolves({
              redboxOid: 'oid-1',
              metaMetadata: { form: 'auto' },
            });
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

      it(`returns a versioned permission denial without loading the form (API ${apiVersion}, edit=${edit})`, async () => {
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
        if (edit !== 'true') expect((controller.recordsService.hasEditAccess as sinon.SinonStub).called).to.be.false;
        expect(status.calledOnceWithExactly(apiVersion === '1.0' ? 500 : 403)).to.be.true;
        if (apiVersion === '1.0') {
          expect(json.firstCall.args[0]).to.deep.equal({ message: 'view-error-no-permissions', details: '' });
        } else {
          expect(json.firstCall.args[0]).to.deep.equal({
            errors: [{ code: 'view-error-no-permissions', title: 'view-error-no-permissions' }], meta: {},
          });
        }
        expect((FormsService.getForm as sinon.SinonStub).called).to.be.false;
      });
    }
  }

  for (const formSelection of ['named', 'saved']) {
    for (const persona of ['view-only', 'outsider']) {
      it(`denies an existing ${formSelection} ${persona} edit page before form lookup or protected title rendering`, async () => {
        const req = {
          param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
          query: {},
          session: { branding: 'default' },
          user: { username: persona, roles: [{ name: 'Researcher' }] },
          options: { locals: formSelection === 'named' ? { localFormName: 'named-form' } : {} },
        } as unknown as Sails.Req;
        (controller.recordsService.getMeta as sinon.SinonStub).resolves({
          redboxOid: 'oid-1',
          metaMetadata: { type: 'rdmp', form: 'saved-form' },
          metadata: { title: 'Protected acceptance record title' },
        });
        (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
        (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(persona === 'view-only');
        const forbidden = sinon.stub();
        const res = { forbidden } as unknown as Sails.Res;
        const sendView = sinon.stub(controller, 'sendView');

        await controller.edit(req, res);

        expect(forbidden.calledOnceWithExactly()).to.equal(true);
        expect(sendView.notCalled).to.equal(true);
        expect((FormsService.getFormByName as sinon.SinonStub).notCalled).to.equal(true);
        expect((FormsService.getFormByStartingWorkflowStep as sinon.SinonStub).notCalled).to.equal(true);
        expect((controller.recordsService.hasEditAccess as sinon.SinonStub).calledOnce).to.equal(true);
        expect((controller.recordsService.hasViewAccess as sinon.SinonStub).notCalled).to.equal(true);
      });
    }

    for (const persona of ['owner', 'editor']) {
      for (const recordType of ['rdmp', null]) {
        it(`allows server-authorized ${persona} with saved record type ${JSON.stringify(recordType)} with a ${formSelection} form that has no configured type`, async () => {
          const req = {
            param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : ''),
            query: {},
            session: { branding: 'default' },
            user: { username: persona, roles: [{ name: 'Researcher' }] },
            options: { locals: formSelection === 'named' ? { localFormName: 'named-form' } : {} },
          } as unknown as Sails.Req;
          const sendView = sinon.stub(controller, 'sendView');
          (controller.recordsService.getMeta as sinon.SinonStub).resolves({
            redboxOid: 'oid-1',
            metaMetadata: { type: recordType, form: formSelection === 'named' ? 'named-form' : 'saved-form' },
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
          const editAccess = controller.recordsService.hasEditAccess as sinon.SinonStub;
          expect(editAccess.calledOnce).to.be.true;
          expect(editAccess.firstCall.args[1]).to.equal(req.user);
          expect(editAccess.firstCall.args[2]).to.equal(req.user?.roles);
          expect(editAccess.firstCall.args[0]).to.deep.equal({ id: 'brand-1', name: 'default' });
          expect(editAccess.firstCall.args[3]).to.deep.include({ redboxOid: 'oid-1', metadata: { title: 'Saved title' } });
        });
      }
    }
  }

  for (const selection of ['named', 'saved']) {
    for (const persona of ['owner', 'editor', 'admin', 'viewer', 'outsider', 'anonymous']) {
      it(`enforces real record ACLs for ${persona} on the ${selection} edit route despite spoofed query authority`, async () => {
        const originalRoles = Reflect.get(globalThis, 'RolesService');
        const role = Object.assign(new RoleModel(), { id: 'admin-role', name: 'Admin' });
        const user = persona === 'anonymous' ? undefined : Object.assign(new UserModel(), {
          username: persona, roles: persona === 'admin' ? [role] : [],
        });
        const authorized = ['owner', 'editor', 'admin'].includes(persona);
        Reflect.set(globalThis, 'RolesService', { getRole: (_brand: unknown, name: string) => name === 'Admin' ? role : undefined });
        try {
          const service = new RecordServices.Records();
          (controller.recordsService.hasEditAccess as sinon.SinonStub).callsFake(service.hasEditAccess.bind(service));
          (controller.recordsService.getMeta as sinon.SinonStub).resolves({
            redboxOid: 'oid-1',
            metaMetadata: { type: 'rdmp', form: selection === 'named' ? 'named-form' : 'saved-form' },
            authorization: { edit: ['owner', 'editor'], editRoles: ['Admin'], view: ['viewer'], viewRoles: [] },
            metadata: { title: 'Protected saved title' },
          });
          (FormsService.getFormByName as sinon.SinonStub).returns(of({ configuration: { type: 'rdmp' } }));
          const req = {
            param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : (!authorized && name === 'recordType' ? 'spoofed-type' : '')),
            query: { hasEditAccess: true, edit: 'true', roles: ['Admin'], runtimeContext: { record: { hasEditAccess: true } } },
            session: { branding: 'default' }, user,
            options: { locals: selection === 'named' ? { localFormName: 'named-form' } : {} },
          } as unknown as Sails.Req;
          const forbidden = sinon.stub();
          const sendView = sinon.stub(controller, 'sendView');
          await controller.edit(req, { forbidden } as unknown as Sails.Res);
          expect(forbidden.called).to.equal(!authorized);
          expect(sendView.called).to.equal(authorized);
          expect((FormsService.getFormByName as sinon.SinonStub).called).to.equal(authorized);
          expect((FormsService.getFormByStartingWorkflowStep as sinon.SinonStub).called).to.be.false;
          if (authorized) expect(sendView.firstCall.args[3]).to.include({ title: 'Protected saved title | Site' });
        } finally {
          Reflect.set(globalThis, 'RolesService', originalRoles);
        }
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
    expect((controller.recordsService.hasEditAccess as sinon.SinonStub).called).to.be.false;
  });

  it('uses saved metadata title on existing edit routes', async () => {
    const req = {
      param: sinon.stub().callsFake((name: string) => (name === 'oid' ? 'oid-1' : '')),
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

    const rendered = new Promise<void>(resolve => {
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
      param: sinon.stub().callsFake((name: string) => (name === 'recordType' ? 'rdmp' : '')),
      query: {},
      session: { branding: 'default' },
      options: {},
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendViewStub = sinon.stub(controller, 'sendView');
    (global as any).FormsService.getFormByStartingWorkflowStep.returns(of({ configuration: { type: 'rdmp' } }));

    const rendered = new Promise<void>(resolve => {
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

  it('maps only the browser operation query to validationOperation while preserving CRUD intent', async function () {
    const req = {
      params: { targetStep: 'route-step' },
      query: { operation: ' submit ' },
      headers: {},
      options: { locals: { portal: '  tenant-portal  ' } },
      body: {
        operation: 'body-must-not-control-validation',
        portal: 'forged-body-portal',
        targetStep: 'body-step',
        validationBypass: { mode: 'bypass' },
        schemaOperation: 'forged-operation',
        ifMatch: `"sha256:${'b'.repeat(64)}"`,
        schemaOutcome: { digest: 'b'.repeat(64) },
      },
      param: sinon.stub().callsFake((name: string) => (name === 'operation' ? 'body-operation' : 'body-step')),
    } as unknown as Sails.Req;
    const parsed = (controller as any).publicValidationOperation(req);
    const context = await (controller as any).saveContext(req, 'transition', parsed.value);

    expect(parsed).to.deep.equal({ valid: true, value: 'submit' });
    expect(context.operation).to.equal('transition');
    expect(context.validationOperation).to.equal('submit');
    expect(context.schemaOperation).to.equal('submit');
    expect(context.portal).to.equal('tenant-portal');
    expect(context.ifMatch).to.equal(undefined);
    expect(context).not.to.have.property('schemaOutcome');
    expect(context.validationBypass).to.equal(undefined);
    expect(context.validationRequestParameters).to.deep.equal({ targetStep: 'route-step' });
    expect((req.param as sinon.SinonStub).notCalled).to.equal(true);
    expect((controller as any).publicValidationOperation({ query: {} })).to.deep.equal({ valid: true });
    expect(
      (controller as any).publicValidationOperation({
        query: { operation: 'bad operation' },
      })
    ).to.deep.equal({ valid: false });
  });

  it('keeps the literal v1 failure body while exposing typed v2 failures', function () {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000010');
    result.outcome = 'not-saved';
    result.problems = [
      {
        kind: 'validation',
        phase: 'pre-save',
        issues: [{ message: '@validation-failed' }],
      },
    ];
    const sendResp = sinon.stub(controller as any, 'sendResp');

    (controller as any).sendSaveFailure(
      { headers: { 'X-ReDBox-Api-Version': '1.0' } },
      {},
      result,
      'Failed to save record'
    );
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 500,
      v1: { message: 'Failed to save record' },
    });

    sendResp.resetHistory();
    (controller as any).sendSaveFailure(
      { headers: { 'X-ReDBox-Api-Version': '2.0' } },
      {},
      result,
      'Failed to save record'
    );
    expect(sendResp.firstCall.args[2]).to.deep.include({
      status: 400,
      displayErrors: [{ title: '@validation-failed' }],
    });
    expect(sendResp.firstCall.args[2]).not.to.have.property('v1');
  });

  it('normalizes browser tags, form fingerprints, and resolution linkage once', async function () {
    const entityTag = formatRecordEntityTag('oid-1', 6);
    const requestId = '00000000-0000-4000-8000-000000000011';
    const priorRequestId = '00000000-0000-4000-8000-000000000012';
    const req = {
      params: { oid: 'oid-1' },
      query: { merge: 'true' },
      headers: {
        'if-match': entityTag,
        'x-redbox-form-fingerprint': 'form-fingerprint-1',
        'x-redbox-save-request-id': requestId,
        'x-redbox-concurrency-resolution': 'client-manually-resolved',
        'x-redbox-resolution-of-request-id': priorRequestId,
      },
    } as unknown as Sails.Req;

    const parsed = await (controller as any).mutationSaveContext(req, 'oid-1', 'update', undefined, undefined, true);
    expect(parsed.valid).to.equal(true);
    expect(parsed.context.requestId).to.equal(requestId);
    expect(parsed.context.concurrency).to.deep.equal({
      entityTagSupplied: true,
      expectedRevision: 6,
      formFingerprint: 'form-fingerprint-1',
      resolution: 'client-manually-resolved',
      resolutionOfRequestId: priorRequestId,
    });

    const malformed = await (controller as any).mutationSaveContext(
      { headers: { 'if-match': `W/${entityTag}` } },
      'oid-1',
      'update',
      undefined,
      undefined,
      true
    );
    expect(malformed).to.deep.equal({
      valid: false,
      code: 'record-if-match-invalid',
      header: 'If-Match',
    });
  });

  it('maps certified browser concurrency outcomes without status inference', function () {
    const cases = [
      ['record-precondition-required', 428],
      ['record-revision-stale', 412],
      ['form-definition-changed', 409],
    ] as const;
    const entityTag = formatRecordEntityTag('oid-1', 8);
    const sendResp = sinon.stub(controller as any, 'sendResp');

    for (const [code, status] of cases) {
      sendResp.resetHistory();
      const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000013');
      result.outcome = 'not-saved';
      result.problems = [{ kind: 'conflict', phase: 'pre-save', issues: [{ code, message: `@${code}` }] }];
      result.setConcurrencyMetadata({ revision: 8, currentRevision: 8, entityTag });
      (controller as any).sendSaveFailure({ headers: { 'x-redbox-api-version': '2.0' } }, {}, result, 'Save failed');
      expect(sendResp.firstCall.args[2]).to.deep.include({
        status,
        headers: { ETag: entityTag },
        displayErrors: [{ code, title: `@${code}` }],
      });
      expect(sendResp.firstCall.args[2].meta).to.include({ outcome: 'not-saved' });
    }

    sendResp.resetHistory();
    const malformed = new RecordSaveResponse('00000000-0000-4000-8000-000000000014');
    malformed.outcome = 'unknown';
    (controller as any).sendSaveFailure(
      { headers: { 'x-redbox-api-version': '2.0' } },
      {},
      malformed,
      'Malformed failure'
    );
    expect(sendResp.firstCall.args[2].status).to.equal(500);
  });

  it('projects latest conflict metadata only while browser view access remains', async function () {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000015');
    result.outcome = 'not-saved';
    result.problems = [
      {
        kind: 'conflict',
        phase: 'persistence',
        issues: [{ code: 'record-revision-stale', message: '@record-revision-stale' }],
      },
    ];
    result.setProjectedMetadata({ attackerCandidate: 'must-not-return' });
    const latest = {
      redboxOid: 'oid-1',
      revision: 4,
      metaMetadata: { brandId: 'brand-1', form: 'form-1' },
      metadata: { title: 'Latest', hidden: 'must-not-return' },
    };
    (controller.recordsService.getMeta as sinon.SinonStub).resolves(latest);
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(true);
    (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
    (global as any).FormsService.getFormByName.returns(of({ configuration: { componentDefinitions: [] } }));
    (global as any).FormsService.buildClientFormConfig.resolves({ componentDefinitions: [] });
    (global as any).FormRecordConsistencyService.projectMetadataClientFormConfig.resolves({ title: 'Latest' });

    expect(
      await (controller as any).projectSafeSaveFailure(
        { user: { username: 'alice' } },
        { id: 'brand-1' },
        'oid-1',
        result
      )
    ).to.equal(true);
    expect(result.metadata).to.deep.equal({ title: 'Latest' });
    expect(result.concurrency?.revision).to.equal(4);
    expect((global as any).FormsService.buildClientFormConfig.firstCall.args[1]).to.equal('view');
    expect((global as any).FormRecordConsistencyService.projectMetadataClientFormConfig.firstCall.args[2]).to.equal(
      'view'
    );

    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(false);
    result.setProjectedMetadata({ attackerCandidate: 'must-not-return' });
    expect(
      await (controller as any).projectSafeSaveFailure(
        { user: { username: 'alice' } },
        { id: 'brand-1' },
        'oid-1',
        result
      )
    ).to.equal(false);
    expect(result.metadata).to.equal(null);
    expect(result.concurrency).to.equal(undefined);
  });

  it('disables route-form rebase when conflict metadata is projected through the stored form', async function () {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000016');
    result.outcome = 'not-saved';
    result.problems = [{ kind: 'conflict', phase: 'persistence', issues: [{ code: 'record-revision-stale' }] }];
    result.setConcurrencyMetadata({ currentRevision: 5, formFingerprint: `route:sha256:${'a'.repeat(64)}` });
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      revision: 5,
      metaMetadata: { brandId: 'brand-1', form: 'form-1' },
      metadata: { title: 'Latest', finaliseNotes: 'Concurrent alternate-form value' },
    });
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(true);
    (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(true);
    (FormsService.getFormByName as sinon.SinonStub).returns(of({ configuration: { componentDefinitions: [] } }));
    (FormsService.buildClientFormConfig as sinon.SinonStub).resolves({ componentDefinitions: [] });
    (FormRecordConsistencyService.projectMetadataClientFormConfig as sinon.SinonStub).resolves({ title: 'Latest' });
    await (controller as any).projectSafeSaveFailure({ user: { username: 'alice' } }, { id: 'brand-1' }, 'oid-1', result);
    expect(result.metadata).to.deep.equal({ title: 'Latest' });
    expect(result.concurrency?.currentRevision).to.equal(5);
    expect(result.concurrency?.formFingerprint).to.equal(undefined);
  });

  it('never falls back to unrestricted conflict metadata when no safe form projection exists', async function () {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000016');
    result.outcome = 'not-saved';
    result.problems = [
      {
        kind: 'conflict',
        phase: 'pre-save',
        issues: [{ code: 'record-revision-stale', message: '@record-revision-stale' }],
      },
    ];
    result.setProjectedMetadata({ candidateSecret: true });
    (controller.recordsService.getMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      revision: 5,
      metaMetadata: { brandId: 'brand-1', form: 'missing-form' },
      metadata: { unrestrictedSecret: true },
    });
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(true);
    (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
    (global as any).FormsService.getFormByName.returns(of(undefined));

    expect(
      await (controller as any).projectSafeSaveFailure(
        { user: { username: 'alice' } },
        { id: 'brand-1' },
        'oid-1',
        result
      )
    ).to.equal(true);
    expect(result.metadata).to.equal(null);
    expect(result.concurrency?.revision).to.equal(5);
  });

  it('returns a private browser lifecycle conflict when tombstone view permission was revoked', async function () {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000017');
    result.outcome = 'not-saved';
    result.problems = [
      {
        kind: 'conflict',
        phase: 'persistence',
        issues: [{ code: 'record-lifecycle-operation-conflict', message: '@record-lifecycle-operation-conflict' }],
      },
    ];
    result.setProjectedMetadata({ staleDeletedValue: 'must-not-return' });
    result.setConcurrencyMetadata({ revision: 7, entityTag: formatRecordEntityTag('oid-1', 7) });
    (controller.recordsService.getMeta as sinon.SinonStub).resolves(null);
    (controller.recordsService.getDeletedRecordMeta as sinon.SinonStub).resolves({
      redboxOid: 'oid-1',
      revision: 13,
      metaMetadata: { brandId: 'brand-1', form: 'form-1' },
      metadata: { deletedSecret: 'must-not-return' },
    });
    (controller.recordsService.hasViewAccess as sinon.SinonStub).returns(false);
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await (controller as any).sendLifecycleResult(
      { user: { username: 'alice' }, headers: { 'x-redbox-api-version': '2.0' } },
      {},
      { id: 'brand-1' },
      'oid-1',
      result,
      'Lifecycle conflict'
    );

    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 403,
      displayErrors: [{ code: 'not-authorised' }],
    });
    expect(result.metadata).to.equal(null);
    expect(result.concurrency).to.equal(undefined);
  });

  it('returns the stable W04 fingerprint with generated browser form metadata', async function () {
    const form = {
      id: 'form-1',
      name: 'dataset-draft',
      branding: 'brand-1',
      configuration: { type: 'dataset', componentDefinitions: [] },
    };
    (global as any).sails.config = { reusableFormDefinitions: {}, validators: { definitions: [] } };
    (global as any).sails.services = {
      formpayloadprehydrateservice: { build: sinon.stub().resolves({}) },
    };
    (global as any).FormsService.getFormByStartingWorkflowStep.returns(of(form));
    (global as any).FormsService.buildClientFormConfig.resolves(form.configuration);
    (global as any).FormsService.discoverValidationOperations.resolves([]);
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
    (global as any).WorkflowStepsService.getFirst = sinon
      .stub()
      .returns(of({ name: 'draft', config: { form: 'dataset-draft' } }));
    (controller.recordsService as any).getRecordFormFingerprint = sinon.stub().returns('form-fingerprint-1');
    const req = {
      param: sinon
        .stub()
        .callsFake((name: string) => (name === 'name' ? 'dataset' : name === 'formName' ? 'dataset-draft' : undefined)),
      query: { edit: 'true', roles: ['Superuser'], hasEditAccess: true, recordType: 'spoofed' },
      session: { branding: 'default' },
      user: { username: 'alice', roles: [{ name: 'Researcher' }, { name: 'Admin' }] },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getForm(req, {} as Sails.Res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2].meta).to.deep.include({
      formFingerprint: 'form-fingerprint-1',
      recordType: 'dataset',
      oid: null,
      runtimeContext: { user: { roles: ['Researcher', 'Admin'] }, record: { type: 'dataset', hasEditAccess: false } },
    });
    // A create has no stored record, so its contract is the starting step the
    // save will apply, not the form object this route happened to load.
    const createArgs = (controller.recordsService as any).getRecordFormFingerprint.firstCall.args;
    expect(createArgs[0]).to.deep.equal({
      metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      workflow: { stage: 'draft' },
    });
    expect(createArgs[1]).to.deep.equal({ name: 'dataset' });
    expect(createArgs[2]).to.equal(form);
  });

  describe('generation create-form metadata', () => {
    const generationSession = {
      runId: 'run-1', bindingKey: 'draft-from-source', autoOpen: true,
      initialValues: [{ metadataPointer: '/source', value: 'source-1' }],
    };
    const generationLaunches = [{ bindingKey: 'draft-from-source', sourcePointer: '/source' }];
    let resolveTargetSession: sinon.SinonStub;
    let resolveCreateLaunches: sinon.SinonStub;
    let sendResp: sinon.SinonStub;

    beforeEach(() => {
      const form = {
        id: 'form-1', name: 'dataset-draft', branding: 'brand-1',
        configuration: { type: 'dataset', componentDefinitions: [] },
      };
      resolveTargetSession = sinon.stub().resolves(generationSession);
      resolveCreateLaunches = sinon.stub().resolves(generationLaunches);
      Object.assign(sails.config, {
        generation: { enabled: true }, reusableFormDefinitions: {}, validators: { definitions: [] },
      });
      Reflect.set(sails, 'services', {
        formpayloadprehydrateservice: { build: sinon.stub().resolves({}) },
        generationbindingservice: {
          resolveActions: sinon.stub().resolves([]), resolveTargetSession, resolveCreateLaunches,
        },
      });
      (FormsService.getFormByStartingWorkflowStep as sinon.SinonStub).returns(of(form));
      (FormsService.buildClientFormConfig as sinon.SinonStub).resolves(form.configuration);
      (FormsService.discoverValidationOperations as sinon.SinonStub).resolves([]);
      (RecordTypesService.get as sinon.SinonStub).returns(of({ name: 'dataset' }));
      Reflect.set(WorkflowStepsService, 'getFirst', sinon.stub().returns(of({ name: 'draft', config: { form: 'dataset-draft' } })));
      Reflect.set(controller.recordsService, 'getRecordFormFingerprint', sinon.stub().returns('form-fingerprint-1'));
      sendResp = sinon.stub(controller, 'sendResp');
    });

    const request = (query: Record<string, string>): Sails.Req => ({
      param: sinon.stub().callsFake((name: string) => name === 'name' ? 'dataset' : name === 'formName' ? 'dataset-draft' : undefined),
      query, session: { branding: 'default' },
      user: { id: 'user-1', username: 'alice', roles: [{ name: 'Researcher' }] },
    } as unknown as Sails.Req);

    it('includes authorized launch definitions with the target session so an unsaved draft can restart', async () => {
      await controller.getForm(request({ edit: 'true', generationRunId: ' run-1 ' }), {} as Sails.Res);

      expect(sendResp.calledOnce).to.equal(true);
      expect(sendResp.firstCall.args[2].meta).to.deep.include({ generationEnabled: true, generationSession, generationLaunches });
      expect(resolveTargetSession.firstCall.args.slice(1)).to.deep.equal(['run-1', 'dataset', 'dataset-draft']);
      expect(resolveCreateLaunches.calledOnce).to.equal(true);
      expect(resolveCreateLaunches.firstCall.args).to.deep.equal([
        resolveTargetSession.firstCall.args[0], 'dataset', 'dataset-draft',
      ]);
    });

    it('signals disabled generation without resolving optional metadata', async () => {
      sails.config.generation.enabled = false;
      await controller.getForm(request({ edit: 'true' }), {} as Sails.Res);
      expect(sendResp.firstCall.args[2].meta.generationEnabled).to.equal(false);
      expect(resolveCreateLaunches.called).to.equal(false);
      expect(resolveTargetSession.called).to.equal(false);
    });

    it('keeps launch definitions available for an ordinary editable create form', async () => {
      await controller.getForm(request({ edit: 'true' }), {} as Sails.Res);

      expect(sendResp.firstCall.args[2].meta.generationLaunches).to.deep.equal(generationLaunches);
      expect(sendResp.firstCall.args[2].meta).not.to.have.property('generationSession');
      expect(resolveTargetSession.called).to.equal(false);
    });

    it('does not expose create launches for a read-only target form', async () => {
      await controller.getForm(request({ edit: 'false', generationRunId: 'run-1' }), {} as Sails.Res);

      expect(sendResp.firstCall.args[2].meta.generationSession).to.deep.equal(generationSession);
      expect(sendResp.firstCall.args[2].meta).not.to.have.property('generationLaunches');
      expect(resolveCreateLaunches.called).to.equal(false);
    });

    it('loads an ordinary create form when optional launch metadata lookup fails', async () => {
      resolveCreateLaunches.rejects(new Error('MongoDB credential must remain private'));
      await controller.getForm(request({ edit: 'true' }), {} as Sails.Res);
      const response = sendResp.firstCall.args[2];
      expect(response.data).to.deep.equal({ type: 'dataset', componentDefinitions: [] });
      expect(response.meta.generationEnabled).to.equal(false);
      expect(response.meta).not.to.have.property('generationLaunches');
      expect(response.meta).not.to.have.property('generationSession');
      expect((sails.log.warn as sinon.SinonStub).calledWithExactly('record_generation_metadata_unavailable')).to.equal(true);
    });

    for (const edit of ['true', 'false']) {
      it(`loads an ordinary stored-record form in edit=${edit} when optional action lookup fails`, async () => {
        (controller.recordsService.getMeta as sinon.SinonStub).resolves({
          redboxOid: 'oid-1', metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' }, metadata: {},
        });
        (FormsService.getForm as sinon.SinonStub).resolves({ name: 'dataset-draft', configuration: { type: 'dataset', componentDefinitions: [] } });
        (sails.services.generationbindingservice as any).resolveActions.rejects(new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Private source details'));
        const req = request({ edit });
        (req.param as sinon.SinonStub).withArgs('oid').returns('oid-1');
        await controller.getForm(req, {} as Sails.Res);
        const response = sendResp.firstCall.args[2];
        expect(response.data).to.deep.equal({ type: 'dataset', componentDefinitions: [] });
        expect(response.meta).not.to.have.property('runtimeActions');
        expect((sails.log.warn as sinon.SinonStub).calledWithExactly('record_generation_metadata_unavailable')).to.equal(true);
      });
    }

    it('loads an ordinary form without a generation service during an optional subsystem outage', async () => {
      Reflect.deleteProperty(sails.services, 'generationbindingservice');
      await controller.getForm(request({ edit: 'true' }), {} as Sails.Res);
      expect(sendResp.firstCall.args[2].data).to.deep.equal({ type: 'dataset', componentDefinitions: [] });
      expect(sendResp.firstCall.args[2].meta).not.to.have.property('generationLaunches');
    });

    it('preserves explicit missing-run errors without returning form or partial launch metadata', async () => {
      resolveTargetSession.rejects(new GenerationError('GENERATION_ACTION_NOT_AVAILABLE', 'Run not available'));
      await controller.getForm(request({ edit: 'true', generationRunId: 'missing-run' }), {} as Sails.Res);
      expect(sendResp.firstCall.args[2].status).to.equal(404);
      expect(sendResp.firstCall.args[2].data.error.code).to.equal('GENERATION_ACTION_NOT_AVAILABLE');
      expect(sendResp.firstCall.args[2]).not.to.have.property('meta');
      expect(resolveCreateLaunches.called).to.equal(false);
    });

    it('keeps explicit run requests strict if later launch metadata fails', async () => {
      resolveCreateLaunches.rejects(new Error('Generation database unavailable'));
      await controller.getForm(request({ edit: 'true', generationRunId: 'run-1' }), {} as Sails.Res);
      expect(resolveTargetSession.calledOnce).to.equal(true);
      expect(sendResp.firstCall.args[2].status).to.equal(500);
      expect(sendResp.firstCall.args[2]).not.to.have.property('meta');
    });

    it('does not resolve or expose launch definitions when target-session authorization fails', async () => {
      resolveTargetSession.rejects(new Error('Session is not authorized'));
      await controller.getForm(request({ edit: 'true', generationRunId: 'run-1' }), {} as Sails.Res);

      expect(sendResp.calledOnce).to.equal(true);
      expect(sendResp.firstCall.args[2].status).to.equal(500);
      expect(sendResp.firstCall.args[2]).not.to.have.property('meta');
      expect(resolveCreateLaunches.called).to.equal(false);
    });
  });

  for (const roleNames of [undefined, [], ['Researcher'], ['Admin', 'Librarians']]) {
    for (const { editable, edit } of [
      { editable: true, edit: 'true' },
      { editable: true, edit: 'false' },
      { editable: false, edit: 'false' },
    ]) {
      for (const apiVersion of ['1.0', '2.0']) {
        it(`reports authoritative edit access ${editable} in mode ${edit} (API ${apiVersion}, roles ${JSON.stringify(roleNames)})`, async function () {
          const record = {
            redboxOid: 'oid-1',
            metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
            metadata: { title: 'Visible to both personas' },
          };
          const form = { name: 'dataset-draft', configuration: { type: 'dataset', componentDefinitions: [] } };
          const forms = {
            getForm: sinon.stub().resolves(form),
            buildClientFormConfig: sinon.stub().resolves(form.configuration),
            discoverValidationOperations: sinon.stub().resolves([]),
          };
          Reflect.set(globalThis, 'FormsService', forms);
          Reflect.set(globalThis, 'sails', {
            config: { reusableFormDefinitions: {} },
            services: { formpayloadprehydrateservice: { build: sinon.stub().resolves({}) } },
            log: createSinonStubLogger(sinon),
          });
          (controller.recordsService.getMeta as sinon.SinonStub).resolves(record);
          (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(editable);
          Object.assign(controller.recordsService, { getRecordFormFingerprint: sinon.stub().resolves('fingerprint') });
          forms.getForm.resolves(form);
          forms.buildClientFormConfig.resolves(form.configuration);
          forms.discoverValidationOperations.resolves([]);
          Reflect.set(globalThis, 'RecordTypesService', { get: sinon.stub().returns(of({ name: 'dataset' })) });
          const user =
            roleNames === undefined
              ? undefined
              : Object.assign(new UserModel(), {
                  username: 'reader-or-owner',
                  roles: roleNames.map(name => Object.assign(new RoleModel(), { id: `role-${name}`, name })),
                });
          const req = {
            param: sinon
              .stub()
              .callsFake((name: string) =>
                name === 'oid'
                  ? 'oid-1'
                  : name === 'name'
                    ? roleNames?.length
                      ? 'spoofed-route-type'
                      : 'auto'
                    : undefined
              ),
            query: {
              edit,
              apiVersion,
              roles: ['Admin'],
              recordType: 'spoofed',
              hasEditAccess: !editable,
              runtimeContext: { user: { roles: ['Admin'] }, record: { type: 'spoofed', hasEditAccess: !editable } },
            },
            session: { branding: 'default' },
            user,
          } as unknown as Sails.Req;
          const json = sinon.stub().returnsThis();
          const res = { status: sinon.stub().returnsThis(), json, set: sinon.stub() } as unknown as Sails.Res;

          await controller.getForm(req, res);

          expect(forms.buildClientFormConfig.firstCall.args[1]).to.equal(edit === 'true' ? 'edit' : 'view');
          if (apiVersion === '1.0') {
            // The native v1 contract returns only form data, without a metadata envelope.
            expect(json.firstCall.args[0]).to.deep.equal(form.configuration);
            return;
          }
          const meta = (
            json.firstCall.args[0] as {
              meta: {
                recordType: string;
                runtimeContext: { user: { roles: string[] }; record: { type: string; hasEditAccess: boolean } };
              };
            }
          ).meta;
          expect(meta.runtimeContext).to.deep.equal({
            user: { roles: roleNames ?? [] },
            record: { type: 'dataset', hasEditAccess: editable, ...(edit === 'false' ? { metadata: {} } : {}) },
          });
          expect(meta.recordType).to.equal('dataset');
          expect((controller.recordsService.hasEditAccess as sinon.SinonStub).calledOnce).to.equal(true);
          expect((controller.recordsService.hasViewAccess as sinon.SinonStub).callCount).to.equal(
            edit === 'true' ? 0 : 1
          );
          // Response metadata is per request, even when the form/service fixtures are reused.
          meta.runtimeContext.user.roles.push('Injected');
          meta.runtimeContext.record.hasEditAccess = !editable;
          await controller.getForm(req, res);
          const next = (json.secondCall.args[0] as { meta: typeof meta }).meta;
          expect(next.runtimeContext).to.deep.equal({
            user: { roles: roleNames ?? [] },
            record: { type: 'dataset', hasEditAccess: editable, ...(edit === 'false' ? { metadata: {} } : {}) },
          });
          expect(user?.roles.map(role => role.name) ?? []).to.deep.equal(roleNames ?? []);
        });
      }
    }
  }

  it('fingerprints the authoritative delivered form independently of target intent', async function () {
    const currentRec = {
      redboxOid: 'oid-1',
      revision: 3,
      metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      metadata: { title: 'Current' },
      workflow: { stage: 'draft' },
    };
    const recordType = { name: 'dataset' };
    (global as any).sails.config = { reusableFormDefinitions: {}, validators: { definitions: [] } };
    (global as any).sails.services = {
      formpayloadprehydrateservice: { build: sinon.stub().resolves({}) },
    };
    (controller.recordsService.getMeta as sinon.SinonStub).resolves(currentRec);
    (controller.recordsService as any).hasEditAccess = sinon.stub().returns(true);
    (global as any).FormsService.getForm = sinon
      .stub()
      .resolves({ id: 'form-1', name: 'dataset-draft', branding: 'brand-1', configuration: { type: 'dataset' } });
    (global as any).FormsService.buildClientFormConfig.resolves({ type: 'dataset' });
    (global as any).FormsService.discoverValidationOperations.resolves([]);
    (global as any).RecordTypesService.get.returns(of(recordType));
    (controller.recordsService as any).getRecordFormFingerprint = sinon.stub().resolves('form-fingerprint-2');
    const req = {
      param: sinon
        .stub()
        .callsFake((name: string) =>
          name === 'oid' ? 'oid-1' : name === 'formName' ? 'dataset-draft' : name === 'name' ? 'dataset' : undefined
        ),
      query: { edit: 'true', targetStep: 'published' },
      session: { branding: 'default' },
      user: { username: 'alice', roles: [] },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getForm(req, {} as Sails.Res);

    const args = (controller.recordsService as any).getRecordFormFingerprint.firstCall.args;
    expect(args[0]).to.equal(currentRec);
    expect(args[1]).to.deep.equal(recordType);
    expect(args[2]).to.deep.include({ id: 'form-1', name: 'dataset-draft', branding: 'brand-1' });
    expect(sendResp.firstCall.args[2].meta).to.deep.include({
      formFingerprint: 'form-fingerprint-2',
      revision: 3,
      entityTag: formatRecordEntityTag('oid-1', 3),
    });
    expect(sendResp.firstCall.args[2].headers).to.deep.equal({ ETag: formatRecordEntityTag('oid-1', 3) });
  });

  describe('route-authorised finalise forms', () => {
    let record;
    let form;
    let currentStep;
    let transitionStep;
    let session;
    let sessionStore;
    let user;
    let sendResp;
    let sendView;
    let formName;
    let routeLocals;
    const load = async (oid = record.redboxOid, res = {} as Sails.Res) => {
      await controller.getForm(
        {
          param: name => (name === 'oid' ? oid : name === 'formName' ? formName : 'rdmp'),
          query: { edit: 'true' },
          session,
          sessionID: 'session-a',
          sessionStore,
          user,
        } as unknown as Sails.Req,
        res
      );
      return sendResp.lastCall.args[2];
    };
    const open = async (oid = record.redboxOid, requestSession = session, overrides: Partial<Sails.Req> = {}) =>
      controller.edit(
        {
          param: name =>
            name === 'oid' ? oid : name === 'recordType' && routeLocals.localFormName ? 'rdmp' : undefined,
          options: { locals: routeLocals },
          query: {},
          session: requestSession,
          sessionID: 'session-a',
          sessionStore,
          user,
          ...overrides,
        } as unknown as Sails.Req,
        { forbidden: sinon.stub() } as unknown as Sails.Res
      );

    beforeEach(() => {
      record = {
        redboxOid: 'oid-1',
        revision: 3,
        metaMetadata: { brandId: 'brand-1', type: 'rdmp', form: 'rdmp-draft' },
        metadata: { title: 'Draft' },
        workflow: { stage: 'draft' },
      };
      formName = 'rdmp-transition';
      routeLocals = { localFormName: formName };
      form = {
        id: 'form-1',
        name: formName,
        branding: 'brand-1',
        configuration: { type: 'rdmp', componentDefinitions: [] },
      };
      currentStep = { name: 'draft', config: { form: 'rdmp-draft', workflow: { stage: 'draft' } } };
      transitionStep = {
        name: 'transition-finalised',
        hidden: true,
        config: { form: formName, workflow: { stage: 'transition-finalised' } },
      };
      session = { branding: 'default', cookie: new Cookie() };
      sessionStore = new MemoryStore();
      user = { username: 'alice', roles: [] };
      (controller.recordsService.getMeta as sinon.SinonStub).resolves(record);
      (global as any).RecordTypesService.get.returns(of({ id: 'rt-1', name: 'rdmp' }));
      (global as any).BrandingService.getBrandById = sinon.stub().returns({ id: 'brand-1' });
      const service = new RecordServices.Records();
      controller.recordsService.hasTransitionRoleAuthorization = service.hasTransitionRoleAuthorization;
      controller.recordsService.getRecordFormFingerprint = service.getRecordFormFingerprint.bind(service);
      (global as any).WorkflowStepsService.get = sinon.stub().callsFake(() => of(currentStep));
      (global as any).WorkflowStepsService.getAllForRecordTypeIncludingHidden = sinon
        .stub()
        .callsFake(() => of([currentStep, transitionStep]));
      (global as any).WorkflowStepsService.getAllForRecordType.callsFake(() => of([currentStep]));
      (global as any).FormsService.getFormByName.callsFake(() => of(form));
      (global as any).FormsService.getForm.callsFake(async () => form);
      (global as any).FormsService.buildClientFormConfig.callsFake(async () => form.configuration);
      (global as any).FormsService.discoverValidationOperations.resolves([]);
      (global as any).sails.services = { formpayloadprehydrateservice: { build: sinon.stub().resolves({}) } };
      sendView = sinon.stub(controller, 'sendView');
      sendResp = sinon.stub(controller, 'sendResp');
      sinon.stub(controller, 'getApiVersion').returns('2.0');
    });

    for (const stage of ['draft', 'finalised']) {
      it(`loads the finalise transition form from ${stage} after the configured edit route authorises it`, async () => {
        record.workflow.stage = currentStep.name = currentStep.config.workflow.stage = stage;
        await open();
        const result = await load();
        expect(result.status).to.equal(undefined);
        expect(result.meta.formName).to.equal(formName);
        expect(result.meta.formFingerprint).to.match(/^route:sha256:[0-9a-f]{64}$/);
        expect(result.headers.ETag).to.equal(formatRecordEntityTag('oid-1', 3));
        expect((global as any).FormsService.getForm.firstCall.args[1]).to.equal(formName);
        expect((FormsService.buildClientFormConfig as sinon.SinonStub).lastCall.args[10])
          .to.deep.equal({ existingRecordPresentation: true });
        expect(record.metaMetadata.form).to.equal('rdmp-draft');
        expect(record.workflow.stage).to.equal(stage);
        expect(
          (
            await readRouteForm(
              { session, sessionID: 'session-a', sessionStore, user } as unknown as Sails.Req,
              record.redboxOid,
              { fingerprint: result.meta.formFingerprint }
            )
          )?.fingerprint
        ).to.equal(result.meta.formFingerprint);
        expect(sendView.calledOnce).to.equal(true);
      });
    }

    for (const collision of [false, true]) {
      it(`loads a form from a persisted stage differing from its step name${collision ? ' despite a name collision' : ''}`, async () => {
        record.workflow.stage = currentStep.config.workflow.stage = 'under-review';
        currentStep.name = 'review-step';
        currentStep.config.workflow.next = [transitionStep.name];
        const other = {
          name: 'under-review',
          config: { form: 'other-form', workflow: { stage: 'other-stage', next: [] } },
        };
        const steps = [currentStep, transitionStep, ...(collision ? [other] : [])];
        (WorkflowStepsService.get as sinon.SinonStub).callsFake((_type, name) =>
          of(steps.find(step => step.name === name))
        );
        (WorkflowStepsService.getAllForRecordTypeIncludingHidden as sinon.SinonStub).returns(of(steps));

        await open();
        const result = await load();

        expect(sendView.calledOnce).to.equal(true);
        expect(result.status).to.equal(undefined);
        expect(result.meta.formName).to.equal(formName);
        expect(record.workflow.stage).to.equal('under-review');
      });
    }

    it('does not borrow a permissive edge list from an unrelated same-name step', async () => {
      record.workflow.stage = currentStep.config.workflow.stage = 'under-review';
      currentStep.name = 'review-step';
      currentStep.config.workflow.next = [];
      const other = {
        name: 'under-review',
        config: { form: 'other-form', workflow: { stage: 'other-stage', next: [transitionStep.name] } },
      };
      (WorkflowStepsService.get as sinon.SinonStub).returns(of(other));
      (WorkflowStepsService.getAllForRecordTypeIncludingHidden as sinon.SinonStub).returns(
        of([other, currentStep, transitionStep])
      );

      await open();

      expect(sendView.notCalled).to.equal(true);
      expect(sendResp.lastCall.args[2]).to.deep.include({
        status: 409,
        displayErrors: [{ code: 'form-definition-changed' }],
      });
    });

    it('retains the name default for a step without a configured persisted stage', async () => {
      delete currentStep.config.workflow.stage;
      await open();
      expect((await load()).meta.formName).to.equal(formName);
    });

    for (const scenario of ['distinct-form', 'same-form', 'no-matching-form']) {
      it(`${scenario === 'distinct-form' ? 'disambiguates' : 'rejects ambiguous'} steps sharing a persisted stage (${scenario})`, async () => {
        if (scenario === 'no-matching-form') currentStep.config.form = 'different-form';
        const other = {
          name: 'other-step',
          config: {
            form: scenario === 'same-form' ? record.metaMetadata.form : 'other-form',
            workflow: { stage: record.workflow.stage, next: [] },
          },
        };
        (WorkflowStepsService.getAllForRecordTypeIncludingHidden as sinon.SinonStub).returns(
          of([other, currentStep, transitionStep])
        );

        await open();

        if (scenario === 'distinct-form') {
          expect(sendView.calledOnce).to.equal(true);
          expect((await load()).meta.formName).to.equal(formName);
        } else {
          expect(sendView.notCalled).to.equal(true);
          expect(sendResp.lastCall.args[2]).to.deep.include({
            status: 409,
            displayErrors: [{ code: 'form-definition-changed' }],
          });
        }
      });
    }

    for (const scenario of ['wrong-type', 'unreachable', 'unconfigured', 'transition-role']) {
      it(`rejects an ineligible ${scenario} form at the edit-route boundary`, async () => {
        if (scenario === 'wrong-type') form.configuration.type = 'dataPublication';
        if (scenario === 'unreachable') currentStep.config.workflow.next = ['finalised'];
        if (scenario === 'unconfigured') transitionStep.config.form = 'other-form';
        if (scenario === 'transition-role') transitionStep.config.authorization = { transitionRoles: ['Admin'] };
        const store = sinon.spy(sessionStore, 'set');

        await open();

        expect(sendResp.lastCall?.args[2]).to.deep.include({
          status: 409,
          displayErrors: [{ code: 'form-definition-changed' }],
        });
        expect(sendView.notCalled).to.equal(true);
        expect(store.notCalled).to.equal(true);
      });
    }

    for (const missing of ['sessionID', 'sessionStore']) {
      it(`does not render an alternate form without ${missing} to hold its grant`, async () => {
        await open(record.redboxOid, session, { [missing]: undefined });

        expect(sendResp.lastCall?.args[2]).to.deep.include({
          status: 409,
          displayErrors: [{ code: 'form-definition-changed' }],
        });
        expect(sendView.notCalled).to.equal(true);
      });
    }

    it('discovers validation operations for an authorised alternate form without changing the stored context', async () => {
      form.configuration.name = formName;
      form.configuration.validationOperations = {
        submit: { label: 'Submit for review', enabledValidationGroups: ['all'] },
        adminOnly: { label: 'Private action', enabledValidationGroups: ['all'], roles: ['Admin'] },
      };
      const forms = new FormServices.Forms();
      const validation = new ValidationServices.RecordValidation();
      const discover = sinon.spy(validation, 'discoverOperations');
      Object.assign(sails.services, {
        recordsservice: controller.recordsService,
        recordvalidationservice: validation,
      });
      (FormsService.discoverValidationOperations as sinon.SinonStub).callsFake(
        forms.discoverValidationOperations.bind(forms)
      );
      (FormsService.getFormByName as sinon.SinonStub).callsFake(name =>
        of(
          name === formName
            ? form
            : {
                name,
                branding: 'brand-1',
                configuration: { name, type: 'rdmp', componentDefinitions: [] },
              }
        )
      );

      await open();
      const result = await load();

      expect(result.meta.validationOperations).to.deep.equal([{ name: 'submit', label: 'Submit for review' }]);
      expect(discover.calledOnce).to.equal(true);
      const candidate = discover.firstCall.args[0].candidate;
      expect(candidate.metaMetadata.form).to.equal('rdmp-draft');
      expect(routeFormContractName(discover.firstCall.args[0].routeFormContract, candidate)).to.equal(formName);
      expect(candidate.workflow).to.deep.equal({ stage: 'draft' });
      expect(record.metaMetadata.form).to.equal('rdmp-draft');
      expect(record.workflow).to.deep.equal({ stage: 'draft' });
    });

    for (const action of ['update', 'stepTo']) {
      it(`skips grant-store lookup for an ordinary fingerprint-protected ${action}`, async () => {
        formName = form.name = record.metaMetadata.form;
        const delivered = await load();
        const get = sinon
          .stub(sessionStore, 'get')
          .callsFake((_key, callback) => callback(new Error('Store unavailable')));
        const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000123');
        saved.outcome = 'saved';
        saved.success = true;
        const update = sinon.stub().resolves(saved);
        controller.recordsService.updateMeta = update;
        const req = {
          params: { oid: record.redboxOid, targetStep: 'finalised' },
          query: {},
          headers: {
            'if-match': delivered.headers.ETag,
            'x-redbox-form-fingerprint': delivered.meta.formFingerprint,
          },
          body: { title: 'Ordinary save' },
          session,
          sessionID: 'session-a',
          sessionStore,
          user,
        } as unknown as Sails.Req;

        if (action === 'stepTo') await controller.stepTo(req, {} as Sails.Res);
        else {
          const internal = controller as unknown as {
            updateInternal(req: Sails.Req, res: Sails.Res): Promise<unknown>;
          };
          await internal.updateInternal(req, {} as Sails.Res);
        }

        expect(get.notCalled).to.equal(true);
        expect(update.calledOnce).to.equal(true);
        expect(update.firstCall.args[8].routeForm).to.equal(undefined);
      });
    }

    for (const action of ['restoreRecord', 'destroyDeletedRecord'] as const) {
      for (const apiVersion of ['1.0', '2.0']) {
        for (const failure of ['snapshot', 'context', 'mutation']) {
          it(`sanitises ${action} ${failure} failures (API ${apiVersion})`, async () => {
            const error = new Error('private lifecycle diagnostics');
            (controller.getApiVersion as sinon.SinonStub).returns(apiVersion);
            controller.recordsService.getDeletedRecordMeta = sinon.stub().resolves(record);
            const mutation = sinon.stub().rejects(error);
            controller.recordsService[action] = mutation;
            if (failure === 'snapshot') {
              (controller.recordsService.getDeletedRecordMeta as sinon.SinonStub).rejects(error);
            }
            if (failure === 'context') {
              const internal = controller as unknown as { mutationSaveContext(): Promise<unknown> };
              sinon.stub(internal, 'mutationSaveContext').rejects(error);
            }
            const req = {
              param: () => record.redboxOid,
              params: { oid: record.redboxOid },
              query: {},
              headers: {},
              session,
              sessionID: 'session-a',
              sessionStore,
              user,
            } as unknown as Sails.Req;

            await controller[action](req, {} as Sails.Res);

            expect(sendResp.lastCall.args[2]).to.deep.equal(
              apiVersion === '1.0'
                ? {
                    status: 500,
                    v1: { message: '@record-save-failed' },
                  }
                : {
                    status: 500,
                    displayErrors: [{ code: 'record-save-failed', title: '@record-save-failed' }],
                  }
            );
            expect(mutation.callCount).to.equal(failure === 'mutation' ? 1 : 0);
            expect(JSON.stringify(sendResp.args)).not.to.include(error.message);
            expect(JSON.stringify((sails.log.error as sinon.SinonStub).args)).not.to.include(error.message);
          });
        }
      }
    }

    it('handles session-store failures on stepTo without saving or exposing error details', async () => {
      await open();
      const delivered = await load();
      const update = sinon.stub();
      controller.recordsService.updateMeta = update;
      sinon
        .stub(sessionStore, 'get')
        .callsFake((_key, callback) => callback(new Error('private session-store connection details')));
      const req = {
        params: { oid: record.redboxOid, targetStep: 'finalised' },
        query: { formName: record.metaMetadata.form },
        headers: {
          'if-match': formatRecordEntityTag(record.redboxOid, record.revision),
          'x-redbox-form-fingerprint': delivered.meta.formFingerprint,
        },
        body: { title: 'Finalise' },
        session,
        sessionID: 'session-a',
        sessionStore,
        user,
      } as unknown as Sails.Req;

      await controller.stepTo(req, {} as Sails.Res);

      expect(sendResp.lastCall.args[2]).to.deep.equal({
        status: 500,
        displayErrors: [{ code: 'record-save-failed', title: '@record-save-failed' }],
      });
      expect(update.notCalled).to.equal(true);
      expect(JSON.stringify(sendResp.args)).not.to.include('private session-store connection details');
      expect(JSON.stringify((sails.log.error as sinon.SinonStub).args)).not.to.include(
        'private session-store connection details'
      );
    });

    for (const operation of ['get', 'set'] as const) {
      for (const apiVersion of ['1.0', '2.0']) {
        it(`sanitises grant-store ${operation} failures during form delivery (API ${apiVersion})`, async () => {
          await open();
          const storeError = new Error('private grant-store diagnostics');
          if (operation === 'get') {
            sinon.stub(sessionStore, 'get').callsFake((_key, callback) => callback(storeError));
          } else {
            sinon.stub(sessionStore, 'set').callsFake((_key, _entry, callback) => callback(storeError));
          }
          (controller.getApiVersion as sinon.SinonStub).returns(apiVersion);
          sendResp.callThrough();
          const status = sinon.stub().returnsThis();
          const json = sinon.stub().returnsThis();
          const res = { status, json, set: sinon.stub() } as unknown as Sails.Res;

          const result = await load(record.redboxOid, res);

          expect(status.calledOnceWithExactly(500)).to.equal(true);
          expect(json.calledOnce).to.equal(true);
          expect(result.errors).to.equal(undefined);
          expect(result.displayErrors).to.deep.equal([{ title: 'Error getting form definition' }]);
          expect(JSON.stringify(json.firstCall.args[0])).not.to.include(storeError.message);
          expect(JSON.stringify(json.firstCall.args[0])).not.to.include(storeError.stack);
          expect(
            (sails.log.error as sinon.SinonStub).calledWith('record_route_form_store_failed', storeError)
          ).to.equal(true);
          expect(record.metaMetadata.form).to.equal('rdmp-draft');
          if (operation === 'get') expect((FormsService.getForm as sinon.SinonStub).notCalled).to.equal(true);
        });
      }
    }

    it('keeps the core default finalise route working with a different stored form', async () => {
      routeLocals = (routes['get /:branding/:portal/record/finalise/:recordType/edit/:oid'] as RouteTargetObject)
        .locals;
      formName = form.name = transitionStep.config.form = routeLocals.localFormName;
      await open();
      expect((await load()).meta.formName).to.equal('default-1.0-draft');
    });

    it('honors an explicit next stage', async () => {
      currentStep.config.workflow.next = 'transition-finalised';
      await open();
      expect((await load()).meta.formName).to.equal(formName);
    });

    it('allows a hidden finalise form whose save button targets an explicit next stage', async () => {
      currentStep.config.workflow.next = ['finalised'];
      const finalised = { name: 'finalised', config: { form: 'rdmp-finalised' } };
      (global as any).WorkflowStepsService.getAllForRecordTypeIncludingHidden.callsFake(() =>
        of([currentStep, transitionStep, finalised])
      );
      form.configuration.componentDefinitions = [
        {
          name: 'finalise',
          component: { class: 'SaveButtonComponent', config: { targetStep: 'finalised' } },
        },
      ];
      await open();
      const result = await load();
      expect(result.status).to.equal(undefined);
      expect(result.meta.formName).to.equal(formName);
    });

    it('resolves nested reusable save buttons when authorising a direct transition form', async () => {
      currentStep.config.workflow.next = ['finalised'];
      (global as any).WorkflowStepsService.getAllForRecordTypeIncludingHidden.callsFake(() =>
        of([currentStep, transitionStep, { name: 'finalised', config: { form: 'rdmp-finalised' } }])
      );
      sails.config.reusableFormDefinitions = {
        finaliseActions: [
          { name: 'finalise', component: { class: 'SaveButtonComponent', config: { targetStep: 'finalised' } } },
        ],
      };
      form.configuration.componentDefinitions = [
        {
          name: 'actions',
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: '',
                  overrides: { reusableFormName: 'finaliseActions' },
                  component: { class: 'ReusableComponent' },
                },
              ],
            },
          },
        },
      ];
      await open();
      expect((await load()).meta.formName).to.equal(formName);
    });

    for (const scenario of ['reachable', 'unreachable', 'role-restricted']) {
      it(`checks a hidden transition form's headerActions save target when ${scenario}`, async () => {
        currentStep.config.workflow.next = ['finalised'];
        const finalised = {
          name: 'finalised',
          config: {
            form: 'rdmp-finalised',
            authorization: { transitionRoles: scenario === 'role-restricted' ? ['Admin'] : [] },
          },
        };
        (WorkflowStepsService.getAllForRecordTypeIncludingHidden as sinon.SinonStub).returns(
          of([currentStep, transitionStep, finalised])
        );
        form.configuration.componentDefinitions = [
          {
            name: 'dataLocations',
            component: {
              class: 'PublishDataLocationSelectorComponent',
              config: {
                headerActions: [
                  {
                    name: 'finalise',
                    component: {
                      class: 'SaveButtonComponent',
                      config: { targetStep: scenario === 'unreachable' ? 'private' : 'finalised' },
                    },
                  },
                ],
              },
            },
          },
        ];

        await open();
        const result = await load();

        expect(result.status).to.equal(scenario === 'reachable' ? undefined : 409);
        if (scenario === 'reachable') expect(result.meta.formName).to.equal(formName);
        else expect(result.displayErrors).to.deep.equal([{ code: 'form-definition-changed' }]);
      });
    }

    for (const scenario of ['forbidden-target', 'target-role', 'non-hidden-form', 'metadata-target']) {
      it(`rejects a direct transition form with ${scenario}`, async () => {
        currentStep.config.workflow.next = ['finalised'];
        const target = { name: 'finalised', config: { form: 'rdmp-finalised', authorization: {} } };
        (global as any).WorkflowStepsService.getAllForRecordTypeIncludingHidden.callsFake(() =>
          of([currentStep, transitionStep, target])
        );
        const button = {
          name: 'finalise',
          component: { class: 'SaveButtonComponent', config: { targetStep: 'finalised' } },
        };
        form.configuration.componentDefinitions = [button];
        if (scenario === 'forbidden-target') button.component.config.targetStep = 'unreachable';
        if (scenario === 'target-role') target.config.authorization = { transitionRoles: ['Admin'] };
        if (scenario === 'non-hidden-form') transitionStep.hidden = false;
        if (scenario === 'metadata-target') {
          form.configuration.componentDefinitions = [];
          record.metadata.button = button;
        }
        await open();
        expect((await load()).status).to.equal(409);
      });
    }

    it('loads a legacy transition form without an explicit type', async () => {
      delete form.configuration.type;
      await open();
      const result = await load();
      expect(result.status).to.equal(undefined);
      expect(result.meta.formName).to.equal(formName);
    });

    it('retains grants across concurrent tabs with last-write-wins session snapshots', async () => {
      const other = { ...record, redboxOid: 'oid-2' };
      (controller.recordsService.getMeta as sinon.SinonStub).callsFake(async oid =>
        oid === other.redboxOid ? other : record
      );
      // express-session loads a separate snapshot for each overlapping request.
      const tabA = _.cloneDeep(session);
      const tabB = _.cloneDeep(session);
      await Promise.all([open(record.redboxOid, tabA), open(other.redboxOid, tabB)]);
      const persist = snapshot =>
        new Promise<void>((resolve, reject) =>
          sessionStore.set('session-a', snapshot, error => (error ? reject(error) : resolve()))
        );
      await persist(tabA);
      await persist(tabB);
      session = _.cloneDeep(tabB);
      expect((await load(record.redboxOid)).status).to.equal(undefined);
      expect((await load(other.redboxOid)).status).to.equal(undefined);
      const delivered = await Promise.all([load(record.redboxOid), load(other.redboxOid)]);
      for (const [index, oid] of [record.redboxOid, other.redboxOid].entries()) {
        const context = await (controller as any).saveContext(
          {
            params: { oid },
            query: {},
            headers: {},
            sessionID: 'session-a',
            sessionStore,
            session,
            user,
          },
          'transition',
          undefined,
          'finalised',
          { formFingerprint: delivered[index].meta.formFingerprint }
        );
        expect(context.routeForm?.oid).to.equal(oid);
      }
    });

    it('does not share route grants with another session or accept expired grants', async () => {
      await open();
      const req = { session, sessionID: 'session-b', sessionStore, user } as unknown as Sails.Req;
      expect(await readRouteForm(req, record.redboxOid, { formName })).to.equal(undefined);
      const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
      try {
        clock.tick(86_400_001);
        expect((await load()).status).to.equal(409);
      } finally {
        clock.restore();
      }
    });

    for (const scenario of [
      'no-route',
      'normal-edit',
      'wrong-type',
      'unreachable',
      'unconfigured',
      'transition-role',
      'tampered-name',
      'changed-stage',
      'changed-user',
    ]) {
      it(`returns 409 for ${scenario}`, async () => {
        if (scenario === 'normal-edit') routeLocals = {};
        if (scenario === 'wrong-type') form.configuration.type = 'dataPublication';
        if (scenario === 'unreachable') currentStep.config.workflow.next = 'finalised';
        if (scenario === 'unconfigured') transitionStep.config.form = 'other-form';
        if (scenario === 'transition-role') transitionStep.config.authorization = { transitionRoles: ['Admin'] };
        if (scenario !== 'no-route') await open();
        if (scenario === 'tampered-name') formName = 'client-selected';
        if (scenario === 'changed-stage') record.workflow.stage = 'other-stage';
        if (scenario === 'changed-user') user.username = 'bob';
        const result = await load();
        expect(result).to.include({ status: 409 });
        expect(result.displayErrors).to.deep.equal([{ code: 'form-definition-changed' }]);
        expect((global as any).FormsService.getForm.notCalled).to.equal(true);
        expect((FormsService.discoverValidationOperations as sinon.SinonStub).notCalled).to.equal(true);
      });
    }

    for (const action of ['update', 'stepTo']) {
      for (const tampered of [false, true]) {
        it(`${action} ${tampered ? 'rejects a tampered formName' : 'forwards only the session grant matched by the delivered fingerprint'}`, async () => {
          await open();
          const delivered = await load();
          // Another tab opens the same page, but has not requested its form yet.
          await open();
          const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000123');
          saved.oid = record.redboxOid;
          saved.outcome = 'saved';
          saved.success = true;
          const update = sinon.stub().resolves(saved);
          controller.recordsService.updateMeta = update;
          const req = {
            params: { oid: record.redboxOid, targetStep: 'finalised' },
            query: { targetStep: 'finalised', formName: tampered ? 'tampered-form' : formName },
            headers: {
              'if-match': delivered.headers.ETag,
              'x-redbox-form-fingerprint': delivered.meta.formFingerprint,
            },
            body: { title: 'Finalise' },
            session,
            sessionID: 'session-a',
            sessionStore,
            user,
          } as unknown as Sails.Req;
          if (action === 'stepTo') await controller.stepTo(req, {} as Sails.Res);
          else await (controller as any).updateInternal(req, {} as Sails.Res);
          if (tampered) {
            expect(sendResp.lastCall.args[2]).to.include({ status: 409 });
            expect(update.notCalled).to.equal(true);
          } else {
            expect(update.calledOnce).to.equal(true);
            expect(update.firstCall.args[8].routeForm).to.include({
              formName,
              fingerprint: delivered.meta.formFingerprint,
              oid: record.redboxOid,
            });
            expect(update.firstCall.args[8].concurrency.expectedRevision).to.equal(3);
          }
        });
      }
    }

    it('returns the existing no-permissions response and issues no grant without edit access', async () => {
      (controller.recordsService.hasEditAccess as sinon.SinonStub).returns(false);
      await open();
      expect(
        await readRouteForm(
          { session, sessionID: 'session-a', sessionStore, user } as unknown as Sails.Req,
          record.redboxOid,
          { formName }
        )
      ).to.equal(undefined);
      const result = await load();
      expect(result.status).to.equal(403);
      expect(result.displayErrors).to.deep.equal([{ code: 'view-error-no-permissions' }]);
    });
  });

  it('rejects a caller-selected form that differs from the stored authoritative form', async function () {
    const currentRec = {
      redboxOid: 'oid-1',
      revision: 3,
      metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      metadata: { title: 'Current' },
      workflow: { stage: 'draft' },
    };
    (controller.recordsService.getMeta as sinon.SinonStub).resolves(currentRec);
    (controller.recordsService as any).hasEditAccess = sinon.stub().returns(true);
    (controller.recordsService as any).getRecordFormFingerprint = sinon.stub();
    (global as any).FormsService.getForm = sinon.stub();
    const req = {
      param: sinon
        .stub()
        .callsFake((name: string) =>
          name === 'oid' ? 'oid-1' : name === 'formName' ? 'client-selected' : name === 'name' ? 'dataset' : undefined
        ),
      query: { edit: 'true' },
      session: { branding: 'default' },
      user: { username: 'alice', roles: [] },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getForm(req, {} as Sails.Res);

    expect(sendResp.firstCall.args[2]).to.deep.include({
      status: 409,
      displayErrors: [{ code: 'form-definition-changed' }],
    });
    expect((global as any).FormsService.getForm.notCalled).to.equal(true);
    expect((controller.recordsService as any).getRecordFormFingerprint.notCalled).to.equal(true);
  });

  it('includes the authoritative revision on browser actionable list rows', async function () {
    controller.recordsService = {
      getRecordsForDisplay: sinon.stub().resolves({
        isSuccessful: () => true,
        totalItems: 1,
        items: [
          {
            redboxOid: 'oid-1',
            revision: 11,
            metadata: { title: 'Record' },
            dateCreated: '2026-01-01T00:00:00Z',
            lastSaveDate: '2026-01-02T00:00:00Z',
          },
        ],
      }),
      hasEditAccess: sinon.stub().returns(true),
    } as any;

    const response = await (controller as any).getRecords(undefined, 'dataset', 0, 10, { username: 'alice' }, [], {
      id: 'brand-1',
    });

    expect(response.items[0]).to.deep.include({ oid: 'oid-1', revision: 11, hasEditAccess: true });
  });

  it('includes the tombstone revision on browser deleted-record list rows', async function () {
    controller.recordsService = {
      getDeletedRecords: sinon.stub().resolves({
        isSuccessful: () => true,
        totalItems: 1,
        items: [
          {
            redboxOid: 'oid-1',
            revision: 12,
            deletedRecordMetadata: { metadata: { title: 'Deleted record' }, metaMetadata: { type: 'rdmp' } },
            deletedBy: { id: 'user-1', username: 'alice', brandId: 'brand-1' },
            dateDeleted: '2026-01-03T00:00:00Z',
          },
        ],
      }),
    } as any;

    const response = await (controller as any).getDeletedRecords(
      undefined,
      'dataset',
      0,
      10,
      { username: 'alice' },
      [],
      { id: 'brand-1' }
    );

    expect(response.items[0]).to.deep.include({ oid: 'oid-1', revision: 12, recordType: 'rdmp', deletedBy: { id: 'user-1', username: 'alice' } });
  });

  it('only exposes an actor from the active brand and resolves available type labels', () => {
    const doc = { deletedRecordMetadata: { metaMetadata: { type: 'rdmp' } }, deletedBy: { brandId: 'other', username: 'private' } };
    expect(deletedRecordSummary(doc, 'brand-1', key => key === 'rdmp-title' ? 'Plans' : key)).to.deep.equal({ recordType: 'rdmp', recordTypeLabel: 'Plans', deletedBy: null });
    expect(deletedRecordSummary({}, 'brand-1', key => key)).to.deep.equal({ recordType: '', deletedBy: null });
  });

  it('bounds batches and rejects duplicates, invalid actions and missing preconditions', () => {
    const item = { oid: 'one', entityTag: formatRecordEntityTag('one', 3) };
    for (const body of [{ action: 'restore', items: [] }, { action: 'other', items: [item] }, { action: 'restore', items: [item, item] }, { action: 'destroy', items: [{ oid: 'one' }] }, { action: 'restore', items: Array.from({ length: 101 }, (_, i) => ({ ...item, oid: String(i) })) }]) {
      expect(bulkDeletedRecordsBody.safeParse(body).success).to.equal(false);
    }
    expect(bulkDeletedRecordsBody.safeParse({ action: 'restore', items: Array.from({ length: 100 }, (_, i) => ({ ...item, oid: String(i) })) }).success).to.equal(true);
  });

  for (const action of ['restore', 'destroy']) {
    it(`bulk ${action} checks each brand/edit permission and continues through failures and unknown outcomes`, async () => {
      const unavailable = new Set(['missing', 'other-brand']);
      const read = sinon.stub().callsFake(async (oid, brand) => unavailable.has(oid) ? null : { redboxOid: oid, metaMetadata: { brandId: brand.id } });
      const mutate = sinon.stub().callsFake(async (oid) => {
        if (oid === 'throw') throw new Error('private exception');
        return { outcome: oid === 'stale' ? 'not-saved' : 'saved', wasPersisted: () => oid !== 'stale', problems: oid === 'stale' ? [{ kind: 'conflict' }] : [] };
      });
      controller.recordsService = { getDeletedRecordMeta: read, hasEditAccess: (_brand, _user, _roles, record) => record.redboxOid !== 'denied', restoreRecord: mutate, destroyDeletedRecord: mutate } as any;
      const ids = ['ok', 'missing', 'denied', 'other-brand', 'stale', 'throw', 'last'];
      const req: any = { body: { action, items: ids.map(oid => ({ oid, entityTag: formatRecordEntityTag(oid, 3) })) }, headers: {}, params: {}, query: {}, user: { username: 'alice' }, session: { branding: 'default' } };
      const send = sinon.stub(controller as any, 'sendResp');
      await controller.bulkDeletedRecords(req, {} as any);
      expect(mutate.getCalls().map(call => call.args[0])).to.deep.equal(['ok', 'stale', 'throw', 'last']);
      for (const call of mutate.getCalls()) {
        expect(call.args[3]).to.include({ operation: action === 'restore' ? 'restore' : 'purge', routeFamily: 'browser' });
        expect(call.args[3].concurrency).to.include({ expectedRevision: 3 });
      }
      expect(read.getCalls().every(call => call.args[1].id === 'brand-1')).to.equal(true);
      expect(send.firstCall.args[2].v1.results.map(item => item.status)).to.deep.equal(['succeeded', 'failed', 'failed', 'failed', 'failed', 'unknown', 'succeeded']);
      expect(send.firstCall.args[2].v1.results[4].reason).to.equal('record-changed');
      expect(JSON.stringify(send.firstCall.args[2])).not.to.include('private exception');
    });
  }

  it('returns an invalid precondition for one item without dispatching its mutation', async () => {
    (controller.recordsService.getDeletedRecordMeta as sinon.SinonStub).resolves({ metaMetadata: { brandId: 'brand-1' } });
    const mutate = sinon.stub();
    Object.assign(controller.recordsService, { restoreRecord: mutate });
    const send = sinon.stub(controller as any, 'sendResp');
    await controller.bulkDeletedRecords({ body: { action: 'restore', items: [{ oid: 'one', entityTag: 'invalid' }] }, user: {}, session: { branding: 'default' } } as any, {} as any);
    expect(mutate.notCalled).to.equal(true);
    expect(send.firstCall.args[2].v1.results).to.deep.equal([{ oid: 'one', status: 'failed', reason: 'invalid-precondition' }]);
  });

  it('rejects malformed bulk input without reading or mutating records', async () => {
    const send = sinon.stub(controller as any, 'sendResp');
    await controller.bulkDeletedRecords({ body: { action: 'destroy', items: [] } } as any, {} as any);
    expect(send.firstCall.args[2].status).to.equal(400);
    expect((controller.recordsService.getDeletedRecordMeta as sinon.SinonStub).notCalled).to.equal(true);
  });

  it('preserves the form-configuration failure response before operation discovery', async function () {
    (global as any).FormsService.getFormByStartingWorkflowStep.returns(
      of({
        name: 'dataset-draft',
        configuration: null,
      })
    );
    const req = {
      param: sinon
        .stub()
        .callsFake((name: string) => (name === 'name' ? 'dataset' : name === 'formName' ? 'dataset-draft' : undefined)),
      query: { edit: 'true' },
      session: { branding: 'default' },
      user: { username: 'alice', roles: [] },
    } as unknown as Sails.Req;
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.getForm(req, {} as Sails.Res);

    const message = 'Form configuration not found for form dataset-draft, record type dataset, oid null';
    expect(
      sendResp.calledOnceWith(req, sinon.match.any, {
        status: 500,
        displayErrors: [{ detail: message }],
        v1: { message },
      })
    ).to.equal(true);
    expect((global as any).FormsService.buildClientFormConfig.called).to.equal(false);
    expect((global as any).FormsService.discoverValidationOperations.called).to.equal(false);
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
      redirect: sinon.stub(),
    } as unknown as Sails.Res;
    (global as any).BrandingService.getFullPath = sinon.stub().returns('/default/rdmp');

    controller.redirectLegacyConsolidatedDashboard(req, res);

    expect((res.redirect as any).calledWith('/default/rdmp/dashboard-view/consolidated')).to.be.true;
  });

  it('uses the record brand for form lookup and scopes form role names to the active brand', async () => {
    const formConfig = { componentDefinitions: [] };
    const clientFormConfig = { componentDefinitions: [{ name: 'title' }] };
    (global as any).sails.config = { reusableFormDefinitions: { shared: {} } };
    (global as any).FormsService.getFormByName.returns(of({ configuration: formConfig }));
    (global as any).FormsService.buildClientFormConfig.returns(clientFormConfig);
    const req = { user: { roles: [
      { name: 'researcher', branding: { id: 'fallback-brand' } },
      { name: 'admin', branding: 'record-brand' },
      { name: 'unscoped-admin' }, { name: '', branding: 'fallback-brand' }, {},
    ] } } as unknown as Sails.Req;
    const record = { metaMetadata: { brandId: 'record-brand' }, metadata: { title: 'A title' } };
    const brand = { id: 'fallback-brand', name: 'fallback' };

    const result = await getEffectiveRelatedClientForm(req, brand as any, record, 'form-1', false, 'edit');

    expect(result).to.equal(clientFormConfig);
    expect((global as any).FormsService.getFormByName.calledWith('form-1', false, 'record-brand')).to.be.true;
    expect(
      (global as any).FormsService.buildClientFormConfig.calledWith(
        formConfig,
        'edit',
        ['researcher'],
        record.metadata,
        { shared: {} },
        'fallback',
        sinon.match.any,
        { user: req.user, brand, record }
      )
    ).to.be.true;
  });

  it('returns no post-save metadata when syncing is not applicable', async () => {
    (global as any).sails.config = { record: { form: { returnMetadataOnSave: true } } };
    const req = {} as Sails.Req;
    const brand = { id: 'brand-1', name: 'default' };

    expect(await (controller as any).getPostSaveMetadata(req, brand, null, null)).to.equal(null);
    expect(await (controller as any).getPostSaveMetadata(req, brand, { metadata: {} }, { name: 'next' })).to.equal(
      null
    );
    expect(
      await (controller as any).getPostSaveMetadata(req, brand, { metadata: {}, metaMetadata: {} }, null)
    ).to.equal(null);
    (global as any).sails.config.record.form.returnMetadataOnSave = false;
    expect(
      await (controller as any).getPostSaveMetadata(
        req,
        brand,
        {
          metadata: {},
          metaMetadata: { form: 'form-1' },
        },
        null
      )
    ).to.equal(null);
  });

  it('projects post-save metadata and handles projection failures', async () => {
    (global as any).sails.config = { record: { form: { returnMetadataOnSave: true } }, reusableFormDefinitions: {} };
    const req = {} as Sails.Req;
    const brand = { id: 'brand-1', name: 'default' };
    const savedRecord = { redboxOid: 'oid-1', metaMetadata: { form: 'form-1' }, metadata: { title: 'server title' } };
    const clientFormConfig = { componentDefinitions: [] };
    (global as any).FormsService.getFormByName.returns(of({ configuration: clientFormConfig }));
    (global as any).FormsService.buildClientFormConfig.returns(clientFormConfig);
    (global as any).FormRecordConsistencyService.projectMetadataClientFormConfig.resolves({ title: 'projected' });

    expect(await (controller as any).getPostSaveMetadata(req, brand, savedRecord, null)).to.deep.equal({
      title: 'projected',
    });

    (global as any).FormRecordConsistencyService.projectMetadataClientFormConfig.rejects(
      new Error('projection failed')
    );
    expect(await (controller as any).getPostSaveMetadata(req, brand, savedRecord, null)).to.equal(null);
    expect((global as any).sails.log.error.calledOnce).to.be.true;
  });

  it('routes browser stepTo through the authoritative transition save boundary', async () => {
    const currentRecord = {
      redboxOid: 'oid-1',
      revision: 4,
      metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      metadata: { title: 'Before' },
      workflow: { stage: 'draft' },
      authorization: { edit: ['tester'] },
    };
    const nextStep = {
      name: 'review',
      config: {
        form: 'dataset-review',
        workflow: { stage: 'review' },
        authorization: { transitionRoles: ['Researcher'] },
      },
    };
    const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000123');
    saved.oid = 'oid-1';
    saved.outcome = 'saved';
    saved.success = true;
    const updateMeta = sinon.stub().resolves(saved);
    const legacyPremutation = sinon.stub();
    controller.recordsService = {
      getMeta: sinon.stub().resolves(currentRecord),
      hasEditAccess: sinon.stub().returns(true),
      updateMeta,
      setWorkflowStepRelatedMetadata: legacyPremutation,
    } as any;
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
    (global as any).WorkflowStepsService.get = sinon.stub().returns(of(nextStep));
    const params: Record<string, unknown> = {
      oid: 'oid-1',
      targetStep: 'review',
    };
    const req = {
      body: { title: 'After', targetStep: 'body-step', operation: 'body-operation' },
      headers: {
        'if-match': formatRecordEntityTag('oid-1', 4),
        'x-redbox-form-fingerprint': 'current-form-fingerprint',
      },
      params,
      query: { operation: 'submit' },
      session: { branding: 'default' },
      user: { username: 'tester', roles: [{ name: 'Researcher' }] },
      param: sinon
        .stub()
        .callsFake((name: string) =>
          name === 'targetStep' ? 'body-step' : name === 'operation' ? 'body-operation' : params[name]
        ),
    } as unknown as Sails.Req;
    sinon.stub(controller as any, 'getApiVersion').returns('1.0');
    const sendResp = sinon.stub(controller as any, 'sendResp');

    await controller.stepTo(req, {} as Sails.Res);

    expect(legacyPremutation.notCalled).to.equal(true);
    expect(updateMeta.calledOnce).to.equal(true);
    expect(updateMeta.firstCall.args.slice(0, 8)).to.deep.equal([
      { id: 'brand-1', name: 'default' },
      'oid-1',
      currentRecord,
      req.user,
      true,
      true,
      nextStep,
      {
        metadata: { title: 'After', targetStep: 'body-step', operation: 'body-operation' },
        mode: 'replace',
      },
    ]);
    expect(currentRecord.workflow.stage).to.equal('draft');
    expect(currentRecord.metaMetadata.form).to.equal('dataset-draft');
    expect(updateMeta.firstCall.args[8]).to.deep.include({
      routeFamily: 'browser',
      operation: 'transition',
      targetStep: 'review',
      validationOperation: 'submit',
      validationRequestParameters: { targetStep: 'review' },
    });
    expect(updateMeta.firstCall.args[8].concurrency).to.deep.equal({
      entityTagSupplied: true,
      expectedRevision: 4,
      formFingerprint: 'current-form-fingerprint',
    });
    expect((req.param as sinon.SinonStub).notCalled).to.equal(true);
    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2].v1).to.deep.equal({
      success: true,
      oid: 'oid-1',
      message: '',
      data: undefined,
      metadata: null,
      details: undefined,
      totalItems: 0,
      items: [],
    });
  });

  it('does not let browser update body metadata initiate a transition or validation operation', async () => {
    const currentRecord = {
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      metadata: { title: 'Before' },
      workflow: { stage: 'draft' },
      authorization: { edit: ['tester'] },
    };
    const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000124');
    saved.oid = 'oid-1';
    saved.outcome = 'saved';
    saved.success = true;
    const updateMeta = sinon.stub().resolves(saved);
    controller.recordsService = {
      getMeta: sinon.stub().resolves(currentRecord),
      hasEditAccess: sinon.stub().returns(true),
      updateMeta,
    } as any;
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
    (global as any).WorkflowStepsService.get = sinon.stub();
    const req = {
      body: { title: 'After', targetStep: 'published', operation: 'publish' },
      headers: {},
      params: { oid: 'oid-1' },
      query: {},
      session: { branding: 'default' },
      user: { username: 'tester' },
      param: sinon
        .stub()
        .callsFake((name: string) =>
          name === 'targetStep' ? 'published' : name === 'operation' ? 'publish' : undefined
        ),
    } as unknown as Sails.Req;
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');
    sinon.stub(controller as any, 'sendResp');

    await (controller as any).updateInternal(req, {} as Sails.Res);

    expect((global as any).WorkflowStepsService.get.notCalled).to.equal(true);
    expect(updateMeta.calledOnce).to.equal(true);
    expect(updateMeta.firstCall.args[7]).to.deep.equal({ metadata: req.body, mode: 'replace' });
    expect(updateMeta.firstCall.args[7].metadata).to.equal(req.body);
    const context = updateMeta.firstCall.args[8];
    expect(context).to.include({ routeFamily: 'browser', operation: 'update' });
    expect(context.concurrency).to.deep.equal({ entityTagSupplied: false });
    expect(context.targetStep).to.equal(undefined);
    expect(context.validationOperation).to.equal(undefined);
    expect(context.validationRequestParameters).to.deep.equal({});
    expect((req.param as sinon.SinonStub).notCalled).to.equal(true);
  });

  it('preserves strict, stale, and form-drift statuses on browser update routes', async () => {
    const cases = [
      { code: 'record-precondition-required', status: 428, headers: {} },
      {
        code: 'record-revision-stale',
        status: 412,
        headers: {
          'if-match': formatRecordEntityTag('oid-1', 4),
          'x-redbox-form-fingerprint': 'current-form-fingerprint',
        },
      },
      {
        code: 'form-definition-changed',
        status: 409,
        headers: {
          'if-match': formatRecordEntityTag('oid-1', 5),
          'x-redbox-form-fingerprint': 'old-form-fingerprint',
        },
      },
    ] as const;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));

    for (const testCase of cases) {
      sendResp.resetHistory();
      const currentRecord = {
        redboxOid: 'oid-1',
        revision: 5,
        metaMetadata: { brandId: 'brand-1', type: 'dataset', form: '' },
        metadata: { title: 'Current' },
        authorization: { edit: ['tester'], view: ['tester'] },
      };
      const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000126');
      result.outcome = 'not-saved';
      result.problems = [
        {
          kind: 'conflict',
          phase: 'pre-save',
          issues: [{ code: testCase.code, message: `@${testCase.code}` }],
        },
      ];
      result.setConcurrencyMetadata({
        revision: 5,
        entityTag: formatRecordEntityTag('oid-1', 5),
        ...(testCase.code === 'form-definition-changed' ? { formFingerprint: 'current-form-fingerprint' } : {}),
      });
      const updateMeta = sinon.stub().resolves(result);
      controller.recordsService = {
        getMeta: sinon.stub().resolves(currentRecord),
        hasEditAccess: sinon.stub().returns(true),
        hasViewAccess: sinon.stub().returns(true),
        updateMeta,
      } as any;
      const req = {
        body: { title: 'Rejected' },
        headers: { 'x-redbox-api-version': '2.0', ...testCase.headers },
        params: { oid: 'oid-1' },
        query: {},
        session: { branding: 'default' },
        user: { username: 'tester' },
      } as unknown as Sails.Req;

      await (controller as any).updateInternal(req, {} as Sails.Res);

      expect(sendResp.firstCall.args[2].status, testCase.code).to.equal(testCase.status);
      expect(sendResp.firstCall.args[2].meta.outcome).to.equal('not-saved');
      expect(updateMeta.firstCall.args[8].concurrency.entityTagSupplied).to.equal(
        testCase.code !== 'record-precondition-required'
      );
    }
  });

  it('rejects malformed and wildcard browser tags before record work', async () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');
    const getMeta = sinon.stub();
    const updateMeta = sinon.stub();
    controller.recordsService = { getMeta, updateMeta } as any;

    for (const ifMatch of [`W/${formatRecordEntityTag('oid-1', 5)}`, '*']) {
      sendResp.resetHistory();
      await (controller as any).updateInternal(
        {
          body: { title: 'Rejected' },
          headers: { 'x-redbox-api-version': '2.0', 'if-match': ifMatch },
          params: { oid: 'oid-1' },
          query: {},
          session: { branding: 'default' },
          user: { username: 'tester' },
        },
        {}
      );
      expect(sendResp.firstCall.args[2]).to.deep.equal({
        status: 400,
        displayErrors: [{ code: 'record-if-match-invalid', source: { header: 'If-Match' } }],
      });
    }
    expect(getMeta.notCalled).to.equal(true);
    expect(updateMeta.notCalled).to.equal(true);
  });

  it('passes the raw browser merge delta to RecordsService with array replacement semantics', async () => {
    const currentRecord = {
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      metadata: {
        retained: 'keep',
        nested: { retained: true, values: [{ id: 'stored-nested' }] },
        values: [{ id: 'stored' }],
      },
      workflow: { stage: 'draft' },
      authorization: { edit: ['tester'] },
    };
    const rawDelta = {
      nested: { incoming: true, values: [{ id: 'incoming-nested' }] },
      values: [{ id: 'incoming' }],
    };
    const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000126');
    saved.oid = 'oid-1';
    saved.outcome = 'saved';
    saved.success = true;
    const updateMeta = sinon.stub().resolves(saved);
    controller.recordsService = {
      getMeta: sinon.stub().resolves(currentRecord),
      hasEditAccess: sinon.stub().returns(true),
      updateMeta,
    } as any;
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
    const req = {
      body: rawDelta,
      headers: {},
      params: { oid: 'oid-1' },
      query: { merge: 'true' },
      session: { branding: 'default' },
      user: { username: 'tester' },
    } as unknown as Sails.Req;
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');
    sinon.stub(controller as any, 'sendResp');

    await (controller as any).updateInternal(req, {} as Sails.Res);

    expect(updateMeta.calledOnce).to.equal(true);
    expect(updateMeta.firstCall.args[7]).to.deep.equal({
      metadata: rawDelta,
      mode: 'merge',
      arrayMergeMode: 'replace',
    });
    expect(updateMeta.firstCall.args[7].metadata).to.equal(rawDelta);
    expect(currentRecord.metadata).to.deep.equal({
      retained: 'keep',
      nested: { retained: true, values: [{ id: 'stored-nested' }] },
      values: [{ id: 'stored' }],
    });
  });

  it('does not let browser create body metadata initiate a transition', async () => {
    const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000125');
    saved.oid = 'oid-created';
    saved.outcome = 'saved';
    saved.success = true;
    const create = sinon.stub().resolves(saved);
    controller.recordsService = {
      create,
      getMeta: sinon.stub().resolves({ redboxOid: 'oid-created', metadata: {}, metaMetadata: {} }),
    } as any;
    (global as any).RecordTypesService.get.returns(of({ name: 'dataset' }));
    const req = {
      body: { title: 'Created', targetStep: 'published', operation: 'publish' },
      headers: {},
      params: { recordType: 'dataset' },
      query: {},
      session: { branding: 'default' },
      user: { username: 'tester' },
      param: sinon
        .stub()
        .callsFake((name: string) =>
          name === 'targetStep' ? 'published' : name === 'operation' ? 'publish' : undefined
        ),
    } as unknown as Sails.Req;
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');
    sinon.stub(controller as any, 'sendResp');

    await (controller as any).createInternal(req, {} as Sails.Res);

    expect(create.calledOnce).to.equal(true);
    expect(create.firstCall.args[6]).to.equal(undefined);
    const context = create.firstCall.args[7];
    expect(context).to.include({ routeFamily: 'browser', operation: 'create' });
    expect(context.targetStep).to.equal(undefined);
    expect(context.validationOperation).to.equal(undefined);
    expect(context.validationRequestParameters).to.deep.equal({ recordType: 'dataset' });
    expect((req.param as sinon.SinonStub).notCalled).to.equal(true);
  });

  it('returns safe missing and authorization responses for browser update and delete lookups', async () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');
    const updateMeta = sinon.stub();
    const deleteRecord = sinon.stub();
    const getMeta = sinon.stub().resolves(null);
    const hasEditAccess = sinon.stub().returns(true);
    controller.recordsService = {
      getMeta,
      hasEditAccess,
      updateMeta,
      delete: deleteRecord,
    } as any;
    const baseRequest = {
      body: { title: 'Rejected' },
      headers: {},
      params: { oid: 'oid-1' },
      query: {},
      session: { branding: 'default' },
      user: { username: 'tester' },
      param: sinon.stub().withArgs('oid').returns('oid-1'),
    } as unknown as Sails.Req;

    await (controller as any).updateInternal(baseRequest, {} as Sails.Res);
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 404,
      displayErrors: [{ code: 'missing-record' }],
    });

    sendResp.resetHistory();
    await controller.delete(baseRequest, {} as Sails.Res);
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 404,
      displayErrors: [{ code: 'missing-record' }],
    });
    expect(updateMeta.notCalled).to.equal(true);
    expect(deleteRecord.notCalled).to.equal(true);

    getMeta.resetBehavior();
    getMeta.rejects(new Error('private lookup failure'));
    sendResp.resetHistory();
    await (controller as any).updateInternal(baseRequest, {} as Sails.Res);
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 404,
      displayErrors: [{ code: 'missing-record' }],
    });

    sendResp.resetHistory();
    await controller.delete(baseRequest, {} as Sails.Res);
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 404,
      displayErrors: [{ code: 'missing-record' }],
    });
    expect(JSON.stringify(sendResp.args)).not.to.include('private lookup failure');

    getMeta.resetBehavior();
    getMeta.resolves({
      redboxOid: 'oid-1',
      metaMetadata: { brandId: 'brand-1', type: 'dataset' },
      metadata: {},
      authorization: {},
    });
    hasEditAccess.returns(false);
    sendResp.resetHistory();
    await (controller as any).updateInternal(baseRequest, {} as Sails.Res);
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 403,
      displayErrors: [{ code: 'not-authorised' }],
    });

    sendResp.resetHistory();
    await controller.delete(baseRequest, {} as Sails.Res);
    expect(sendResp.firstCall.args[2]).to.deep.equal({
      status: 403,
      displayErrors: [{ code: 'edit-error-no-permissions' }],
    });
    expect(updateMeta.notCalled).to.equal(true);
    expect(deleteRecord.notCalled).to.equal(true);
  });

  it('sanitizes unexpected browser update and transition failures', function () {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    sinon.stub(controller as any, 'getApiVersion').returns('2.0');

    (controller as any).sendUnexpectedSaveFailure(
      { headers: {} },
      {},
      'update',
      new Error('database password is secret')
    );

    const envelope = sendResp.firstCall.args[2];
    expect(JSON.stringify(envelope)).not.to.include('database password');
    expect(envelope).to.deep.equal({
      status: 500,
      displayErrors: [{ code: 'record-save-failed', title: '@record-save-failed' }],
    });
    const logPayload = (global as any).sails.log.error.firstCall.args;
    expect(JSON.stringify(logPayload)).not.to.include('database password');
    expect(logPayload[1]).to.deep.include({ action: 'update', error_type: 'Error' });
  });
});

describe('RecordController TUS URL generation', () => {
  class TestTusRecordController extends Controllers.Record {
    public override async checkDiskSpace(root: string) {
      return super.checkDiskSpace(root);
    }

    public getTusServer() {
      this.initTusServer();
      if (!this.tusServer) {
        throw new Error('TUS server was not initialized');
      }
      return this.tusServer;
    }
  }

  let controller: TestTusRecordController;
  let originalSails: any;
  let originalStorageManagerService: any;
  let originalBrandingService: any;
  let originalTranslationService: any;

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
      log: createSinonStubLogger(sinon),
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
    controller = new TestTusRecordController();
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
    const generatedUrl = tusServer.options.generateUrl(
      {
        _tusBaseUrl: '/default/rdmp/record/oid-1',
      },
      {
        host: 'localhost:1500',
        path: '/uploads/attachments',
        id: 'file-123',
      }
    );

    expect(generatedUrl).to.equal('//localhost:1500/default/rdmp/record/oid-1/attach/file-123');
  });

  it('normalizes routed attachment URLs when the base URL has a trailing slash', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl(
      {
        _tusBaseUrl: '/default/rdmp/record/oid-1/',
      },
      {
        host: 'localhost:1500',
        path: '/uploads/attachments',
        id: 'file-123',
      }
    );

    expect(generatedUrl).to.equal('//localhost:1500/default/rdmp/record/oid-1/attach/file-123');
  });

  it('does not expose the internal TUS mount path in generated attachment URLs', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl(
      {
        _tusBaseUrl: '/default/rdmp/record/oid-1',
      },
      {
        host: 'localhost:1500',
        path: '/uploads/attachments',
        id: 'file-123',
      }
    );

    expect(generatedUrl).to.not.include('/uploads/attachments');
    expect(generatedUrl).to.include('/default/rdmp/record/oid-1/attach/file-123');
  });

  it('uses the StorageManager staging disk datastore for the tus server', () => {
    (controller as any).initTusServer();

    expect((global as any).StorageManagerService.stagingDisk.calledOnce).to.equal(true);
    expect((controller as any).tusServer.datastore.constructor.name).to.equal('TusStorageManagerDataStore');
  });

  it('configures a finite default TUS maximum even when legacy attachment config omits limits', () => {
    expect(new TestTusRecordController().getTusServer().options.maxSize).to.equal(1073741824);
  });

  it('uses record.maxUploadSize for the server and rejects an unbounded chunk configuration', () => {
    sails.config.record.maxUploadSize = 12345;
    expect(new TestTusRecordController().getTusServer().options.maxSize).to.equal(12345);
    sails.config.record.attachments.maxChunkSize = Infinity;
    expect(() => new TestTusRecordController().getTusServer()).to.throw('positive safe integers');
  });

  it('does not require record.attachments.file.directory when using the storage manager datastore', () => {
    (global as any).sails.config.record.attachments.file = undefined;
    (global as any).sails.config.record.attachments.stageDir = undefined;

    expect(() => (controller as any).initTusServer()).to.not.throw();
  });

  it('loads the ESM disk-space checker from the CommonJS controller', async () => {
    const diskSpace = await controller.checkDiskSpace(tmpdir());

    expect(diskSpace.free).to.be.a('number').and.to.be.at.least(0);
    expect(diskSpace.size).to.be.a('number').and.to.be.greaterThan(0);
    expect(diskSpace.diskPath).to.be.a('string');
  });

  it('checks disk space against the staging disk root for filesystem staging uploads', async () => {
    const checkDiskSpaceStub = sinon
      .stub(controller, 'checkDiskSpace')
      .resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
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
      param: sinon.stub().callsFake((name: string) => (name === 'oid' ? 'oid-1' : undefined)),
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
    const checkDiskSpaceStub = sinon
      .stub(controller, 'checkDiskSpace')
      .resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
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
      param: sinon.stub().callsFake((name: string) => (name === 'oid' ? 'oid-1' : undefined)),
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
    const checkDiskSpaceStub = sinon
      .stub(controller, 'checkDiskSpace')
      .resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
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
      param: sinon.stub().callsFake((name: string) => (name === 'oid' ? 'oid-1' : undefined)),
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
  ) =>
    ({
      isSocket: true,
      session: { branding: 'default' },
      user,
      param: sinon.stub().callsFake((name: string) => values[name]),
    }) as unknown as Sails.Req;

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
        join: sinon
          .stub()
          .callsFake((_req: unknown, _roomId: string, callback: (error?: unknown) => void) => callback()),
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
    expect(sendResp.getCalls().some(call => call.args[2]?.status === 403)).to.be.true;

    await controller.subscribe(makeRequest({ roomId: 'record-1' }, undefined), {} as Sails.Res);
    expect(sendResp.getCalls().filter(call => call.args[2]?.status === 403)).to.have.length(3);

    const badRequest = sinon.stub();
    await controller.subscribe(
      { isSocket: false, param: sinon.stub() } as unknown as Sails.Req,
      { badRequest } as unknown as Sails.Res
    );
    expect(badRequest.calledOnce).to.be.true;

    recordsService.hasViewAccess.returns(true);
    (global as any).sails.sockets.join.callsFake((_req: unknown, _roomId: string, callback: (error: unknown) => void) =>
      callback(new Error('join failed'))
    );
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
    expect(sendResp.getCalls().some(call => call.args[2]?.status === 403)).to.be.true;

    (global as any).AsynchsService.get.returns(of([]));
    controller.stop(makeRequest({ id: 'missing' }, undefined), {} as Sails.Res);
    expect((global as any).AsynchsService.finish.callCount).to.equal(1);
  });

  it('only updates jobs owned by the authenticated user', () => {
    const sendResp = sinon.stub(controller as any, 'sendResp');
    (global as any).AsynchsService.get.returns(of([{ id: 'job-1', started_by: 'alice' }]));
    controller.update(
      makeRequest({
        id: 'job-1',
        relatedRecordId: 'record-1',
        taskType: 'export',
        status: 'running',
      }),
      {} as Sails.Res
    );
    expect((global as any).AsynchsService.update.calledOnce).to.be.true;

    (global as any).AsynchsService.get.returns(of([{ id: 'job-2', started_by: 'bob' }]));
    controller.update(makeRequest({ id: 'job-2' }), {} as Sails.Res);
    expect(sendResp.getCalls().some(call => call.args[2]?.status === 403)).to.be.true;
  });
});
