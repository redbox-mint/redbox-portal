import assert from 'node:assert/strict';
import { expect } from 'chai';
import sinon from 'sinon';
import type { Response } from 'supertest';
import { csrfToken, loginSession } from '../helpers/admin-session';

describe('Vocabulary-backed checkbox details writes', function () {
  this.timeout(60_000);

  const savePath = '/default/rdmp/recordmeta';
  const vocabulary = 'checkbox-details-formats';
  const storedFormats = [{ value: 'tabulated', details: { volume: '1 TB' } }];
  const oids: string[] = [];

  afterEach(async function () {
    sinon.restore();
    for (const redboxOid of oids.splice(0)) {
      await RecordAudit.destroy({ redboxOid });
      await Record.destroy({ redboxOid });
    }
  });

  function expectSaved(response: Response): void {
    expect(response.status, JSON.stringify(response.body)).to.be.within(200, 299);
  }

  function expectRejected(response: Response, issue: string): void {
    expect(response.status, JSON.stringify(response.body)).to.be.within(400, 599);
    expect(JSON.stringify(response.body)).to.include(issue);
  }

  it('preserves only verified checkbox answers during an outage and enforces activation after recovery', async function () {
    const session = await loginSession();
    const headers = {
      'X-Source': 'jsclient',
      'X-ReDBox-Api-Version': '2.0',
      'X-CSRF-Token': await csrfToken(session),
    };
    const records = sails.services.recordsservice;
    const read = (oid: string) => records.getMeta(oid);
    const create = async (metadata: Record<string, unknown>): Promise<Response> => {
      const response = await session.post(`${savePath}/checkbox-details-demo`)
        .set(headers).query({ operation: 'draft' }).send(metadata);
      if (response.body.data?.redboxOid) oids.push(response.body.data.redboxOid);
      return response;
    };
    const update = (oid: string, metadata: Record<string, unknown>, query: Record<string, string> = { operation: 'draft' }) =>
      session.put(`${savePath}/${oid}`).set(headers).query(query).send(metadata);
    const amend = async (oid: string, updates: Record<string, unknown>, activate = false): Promise<Response> => {
      const { metadata } = await read(oid);
      return await update(oid, { ...metadata, ...updates }, activate ? { operation: 'activate', targetStep: 'active' } : undefined);
    };

    const created = await create({ title: 'Verified checkbox details', digitalFormatEstimates: storedFormats });
    expectSaved(created);
    const oid: string = created.body.data.redboxOid;
    const getEntries = VocabularyService.getEntries.bind(VocabularyService);
    const lookup = sinon.stub(VocabularyService, 'getEntries').callsFake((branding, ref, options) =>
      ref === vocabulary ? Promise.reject(new Error('Synthetic vocabulary datastore outage')) : getEntries(branding, ref, options)
    );

    expectSaved(await amend(oid, { title: 'Preserved during the outage' }));
    expect((await read(oid)).metadata.digitalFormatEstimates).to.deep.equal(storedFormats);
    expectSaved(await create({ title: 'Draft without checkbox details' }));
    expectSaved(await create({ title: 'Explicitly empty draft', digitalFormatEstimates: [] }));

    expectRejected(await amend(oid, { title: '' }), '@validator-error-required');
    for (const value of ['image', 'unconfigured-option']) {
      expectRejected(await amend(oid, {
        digitalFormatEstimates: [...storedFormats, { value, details: { volume: '2 TB' } }],
      }), '@validator-error-checkbox-details-option');
    }
    expectRejected(await amend(oid, {
      digitalFormatEstimates: [{ value: 'tabulated', details: { volume: '2 TB' } }],
    }), '@validator-error-checkbox-details-field');
    expectRejected(await amend(oid, {}, true), 'record-validation-configuration');
    expect((await read(oid)).workflow.stage).to.equal('draft');
    expect((await read(oid)).metadata.digitalFormatEstimates).to.deep.equal(storedFormats);

    expectSaved(await amend(oid, { digitalFormatEstimates: [] }));
    expect((await read(oid)).metadata.digitalFormatEstimates).to.deep.equal([]);
    expect(lookup.called).to.equal(true);
    lookup.restore();

    expectRejected(await amend(oid, {}, true), '@validator-error-required');
    expectSaved(await amend(oid, { digitalFormatEstimates: storedFormats }, true));
    expect((await read(oid)).workflow.stage).to.equal('active');

    const verified = [...storedFormats, { value: 'image', details: { volume: '2 TB' } }];
    const existing = await create({ title: 'Saved before vocabulary deletion', digitalFormatEstimates: verified });
    expectSaved(existing);
    const existingOid: string = existing.body.data.redboxOid;
    await session.get(`/default/rdmp/record/form/auto/${existingOid}`).set(headers).query({ edit: 'true' }).expect(200);

    const missing = sinon.stub(VocabularyService, 'getEntries').callsFake((branding, ref, options) =>
      ref === vocabulary ? Promise.resolve(null) : getEntries(branding, ref, options)
    );
    const validation = sinon.spy(sails.services.recordvalidationservice, 'resolve');
    expectSaved(await amend(existingOid, { title: 'Preserved after vocabulary deletion' }));
    expect((await read(existingOid)).metadata.digitalFormatEstimates).to.deep.equal(verified);
    expect((await validation.firstCall.returnValue).diagnostics).to.deep.include({
      code: 'record-validation-checkbox-vocabulary-missing',
      severity: 'warning',
      field: 'digitalFormatEstimates',
      message: 'The checkbox vocabulary is missing. Retained answers must match the stored record.',
    });
    validation.restore();

    expectSaved(await update(existingOid, { title: 'Omitted from a merge' }, { operation: 'draft', merge: 'true' }));
    expect((await read(existingOid)).metadata.digitalFormatEstimates).to.deep.equal(verified);

    expectRejected(await amend(existingOid, {
      digitalFormatEstimates: [...verified, { value: 'other', details: { volume: '4 TB', description: 'Exports' } }],
    }), '@validator-error-checkbox-details-option');
    expectRejected(await amend(existingOid, {
      digitalFormatEstimates: [{ value: 'tabulated', details: { volume: '4 TB' } }, verified[1]],
    }), '@validator-error-checkbox-details-field');
    expectRejected(await amend(existingOid, {}, true), 'record-validation-configuration-failed');
    expect((await read(existingOid)).workflow.stage).to.equal('draft');
    expect((await read(existingOid)).metadata.digitalFormatEstimates).to.deep.equal(verified);

    expectSaved(await amend(existingOid, { digitalFormatEstimates: storedFormats }));
    expect((await read(existingOid)).metadata.digitalFormatEstimates).to.deep.equal(storedFormats);
    expectSaved(await update(existingOid, { title: 'Omitted from a replacement' }));
    expect((await read(existingOid)).metadata).not.to.have.property('digitalFormatEstimates');
    expectSaved(await amend(existingOid, { digitalFormatEstimates: [] }));
    expect((await read(existingOid)).metadata.digitalFormatEstimates).to.deep.equal([]);

    expectRejected(await create({ title: 'Missing reference on create' }), 'record-validation-configuration-failed');
    missing.restore();
    sinon.stub(VocabularyService, 'getEntries').callsFake(async (branding, ref, options) => {
      const result = await getEntries(branding, ref, options);
      return ref === vocabulary && result ? { ...result, entries: [...result.entries, result.entries[0]] } : result;
    });
    expectRejected(await amend(existingOid, { title: 'Malformed vocabulary' }), 'record-validation-configuration-failed');
  });

  it('shows stored checkbox details on authorized inline Edit and deferred View when the lookup fails', async function () {
    const session = await loginSession();
    const headers = {
      'X-Source': 'jsclient',
      'X-ReDBox-Api-Version': '2.0',
      'X-CSRF-Token': await csrfToken(session),
    };
    const created = await session.post(`${savePath}/checkbox-details-demo`)
      .set(headers).query({ operation: 'draft' })
      .send({ title: 'Read without the checkbox vocabulary', digitalFormatEstimates: storedFormats });
    expectSaved(created);
    const oid: string = created.body.data.redboxOid;
    oids.push(oid);
    const saved = [{
      value: 'legacy-media',
      details: { volume: '1 TB', legacyNotes: 'Archival notes', privateReference: 'Hidden answer' },
    }];
    await Record.updateOne({ redboxOid: oid }).set({
      metadata: {
        ...created.body.data.metadata,
        digitalFormatEstimates: saved,
        restrictedFormats: [{ value: 'image', details: { volume: 'Role restricted answer' } }],
      },
    });

    const findFormats = (form: any) => {
      const root = form.componentDefinitions[0].component.config;
      return (root.tabs ?? root.panels)[1].component.config.componentDefinitions;
    };
    const getForm = FormsService.getForm.bind(FormsService);
    let authored: Awaited<ReturnType<typeof FormsService.getForm>>;
    let addStrictDropdown = false;
    sinon.stub(FormsService, 'getForm').callsFake(async (...args) => {
      const form = await getForm(...args);
      if (args[4]?.redboxOid !== oid || !form?.configuration) return form;
      authored = structuredClone(form);
      const fields = findFormats(authored.configuration);
      fields[0].component.config.inlineVocab = args[2];
      fields.push({
        ...structuredClone(fields[0]), name: 'restrictedFormats',
        constraints: { authorization: { allowRoles: ['RoleAbsentFromThisSession'] } },
      });
      if (addStrictDropdown) {
        fields.push({
          name: 'strictVocabulary',
          component: { class: 'DropdownInputComponent', config: { inlineVocab: true, vocabRef: vocabulary } },
        });
      }
      return authored;
    });

    const route = `/default/rdmp/record/form/auto/${oid}`;
    const compiledItems = `/default/rdmp/dynamicAsset/formCompiledItems/checkbox-details-demo/${oid}`;
    const getEntries = VocabularyService.getEntries.bind(VocabularyService);
    const lookup = sinon.stub(VocabularyService, 'getEntries');
    for (const fail of [
      () => Promise.reject(new Error('Synthetic rejected vocabulary lookup')),
      () => Promise.resolve(null),
    ]) {
      lookup.callsFake((branding, ref, options) => ref === vocabulary ? fail() : getEntries(branding, ref, options));
      const edit = await session.get(route).set(headers).query({ edit: 'true' }).expect(200);
      const editFields = findFormats(edit.body.data);
      expect(editFields).to.have.length(1);
      expect(editFields[0].component.config).to.include({ inlineVocab: true, vocabRef: vocabulary });
      expect(editFields[0].component.config).not.to.have.property('options');
      expect(editFields[0].model.config.value).to.deep.equal(saved);
      await session.get(compiledItems).set(headers).query({ edit: 'true' }).expect(200);

      const view = await session.get(route).set(headers).query({ edit: 'false' }).expect(200);
      const viewFields = findFormats(view.body.data);
      expect(viewFields).to.have.length(1);
      expect(viewFields[0].component.class).to.equal('ContentComponent');
      expect(viewFields[0].component.config.content[0]).to.deep.include({
        label: 'legacy-media',
        displayDetails: [
          { name: 'volume', label: 'Estimated volume', answer: '1 TB' },
          { name: 'legacyNotes', label: 'legacyNotes', answer: 'Archival notes' },
        ],
      });
      await session.get(compiledItems).set(headers).expect(200);
    }

    const viewFrame = authored!.configuration!;
    await assert.rejects(FormsService.buildClientFormConfig(viewFrame, 'view', ['Admin'],
      { digitalFormatEstimates: saved }, {}, 'default', {}, {
        brand: BrandingService.getDefault(),
        user: { roles: [] },
        record: await sails.services.recordsservice.getMeta(oid),
      }, true), /was not found/);
    const newFrame = structuredClone(viewFrame);
    findFormats(newFrame)[0].component.config.inlineVocab = true;
    await assert.rejects(FormsService.buildClientFormConfig(newFrame, 'edit', ['Admin'], null, {}, 'default'),
      /was not found/);

    addStrictDropdown = true;
    await session.get(route).set(headers).query({ edit: 'false' }).expect(500);
    addStrictDropdown = false;
    lookup.callsFake(async (branding, ref, options) => {
      const result = await getEntries(branding, ref, options);
      return ref === vocabulary && result ? { ...result, entries: [...result.entries, result.entries[0]] } : result;
    });
    await session.get(route).set(headers).query({ edit: 'false' }).expect(500);
  });
});
