import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers } from '../../../src/controllers/webservice/RecordController';

describe('Webservice RecordController getMeta', () => {
  let controller: Controllers.Record;
  let originalSails: any;
  let originalBrandingService: any;
  let originalUnderscore: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalUnderscore = (global as any)._;

    (global as any).sails = {
      config: {},
      services: {
        recordsservice: {
          getMeta: sinon.stub(),
          getRelatedRecords: sinon.stub(),
          hasViewAccess: sinon.stub(),
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
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any)._ = require('lodash');

    controller = new Controllers.Record();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any)._ = originalUnderscore;
  });

  it('returns metadata only when relationships are not requested', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    const req = {
      param,
      query: {},
      session: { branding: 'default' },
      user: { roles: [] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    const record = { metadata: { title: 'Test' } };
    (global as any).sails.services.recordsservice.getMeta.resolves(record);

    await controller.getMeta(req, res);

    assert.equal((global as any).sails.services.recordsservice.getMeta.calledWith('oid-1'), true);
    assert.equal((global as any).sails.services.recordsservice.getRelatedRecords.called, false);
    assert.equal(sendResp.calledOnce, true);
    assert.deepEqual(sendResp.firstCall.args[2], { data: record.metadata });
  });

  it('returns filtered relationships when requested', async () => {
    const param = sinon.stub();
    param.withArgs('oid').returns('oid-1');
    const req = {
      param,
      query: {
        include: 'relationships',
        relationshipDepth: '2',
        relationshipIds: 'rel-1, rel-2',
        recordTypes: 'dataset,publication',
        fields: 'summary',
      },
      session: { branding: 'default' },
      user: { roles: [{ name: 'Researcher' }] },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendResp = sinon.stub(controller as any, 'sendResp');
    const record = { metadata: { title: 'Test' } };
    const relationships = {
      rootOid: 'oid-1',
      relatedObjects: {
        dataset: [
          { redboxOid: 'oid-1', title: 'Root' },
          { redboxOid: 'oid-2', title: 'Visible' },
          { redboxOid: 'oid-3', title: 'Hidden' },
        ],
      },
      edges: [
        { relationId: 'rel-1', targetOid: 'oid-2' },
        { relationId: 'rel-2', targetOid: 'oid-3' },
      ],
      omittedByAccess: {},
    };

    (global as any).sails.services.recordsservice.getMeta.resolves(record);
    (global as any).sails.services.recordsservice.getRelatedRecords.resolves(relationships);
    (global as any).sails.services.recordsservice.hasViewAccess
      .withArgs(sinon.match.any, sinon.match.any, sinon.match({ redboxOid: 'oid-2', title: 'Visible' }))
      .returns(true);
    (global as any).sails.services.recordsservice.hasViewAccess
      .withArgs(sinon.match.any, sinon.match.any, sinon.match({ redboxOid: 'oid-3', title: 'Hidden' }))
      .returns(false);

    await controller.getMeta(req, res);

    assert.equal((global as any).sails.services.recordsservice.getRelatedRecords.calledOnce, true);
    assert.deepEqual((global as any).sails.services.recordsservice.getRelatedRecords.firstCall.args[2], {
      depth: 2,
      includeRelationIds: ['rel-1', 'rel-2'],
      includeRecordTypes: ['dataset', 'publication'],
      fields: 'summary',
    });
    assert.equal(sendResp.calledOnce, true);
    assert.deepEqual(sendResp.firstCall.args[2], {
      data: {
        metadata: record.metadata,
        relationships: {
          rootOid: 'oid-1',
          relatedObjects: {
            dataset: [
              { redboxOid: 'oid-1', title: 'Root' },
              { redboxOid: 'oid-2', title: 'Visible' },
            ],
          },
          edges: [
            { relationId: 'rel-1', targetOid: 'oid-2' },
          ],
          omittedByAccess: {
            'rel-2': 1,
          },
        },
      },
    });
  });
});
