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
    const amend = async (oid: string, updates: Record<string, unknown>, activate = false): Promise<Response> => {
      const { metadata } = await read(oid);
      return await session.put(`${savePath}/${oid}`).set(headers)
        .query(activate ? { operation: 'activate', targetStep: 'active' } : { operation: 'draft' })
        .send({ ...metadata, ...updates });
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

    // A completed lookup with no vocabulary is a broken form reference.
    sinon.stub(VocabularyService, 'getEntries').callsFake((branding, ref, options) =>
      ref === vocabulary ? Promise.resolve(null) : getEntries(branding, ref, options)
    );
    expectRejected(await create({ title: 'Missing vocabulary is a configuration error' }), 'record-validation-configuration');
  });
});
