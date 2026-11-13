import { expect } from 'chai';
import * as sinon from 'sinon';
import axios from 'axios';
import { of } from 'rxjs';
import type { Response } from 'express';
import type { BuildResponseType } from '../../src/model';
import { Controllers } from '../../src/controllers/webservice/ReportingController';
import { Services } from '../../src/services/SolrSearchService';
import { solr, SOLR_EXACT_ACL_FIELDS, SOLR_EXACT_ACL_VERSION } from '../../src/config/solr.config';
import { ReportingError } from '../../src/reporting/types';
import { reportingApiRoutes } from '../../src/api-routes/groups/reporting';
import { validateApiRouteRequest } from '../../src/api-routes/validation';
import { principal } from './fixtures';

class TestController extends Controllers.Reporting {
  response!: BuildResponseType;
  protected override sendResp(_req: Sails.Req, res: Sails.Res, response?: BuildResponseType): Response {
    this.response = response!;
    return res;
  }
}
describe('Reporting REST and Solr adapters', () => {
  const names = ['User', 'UsersService', 'BrandingService', 'ReportingService'];
  let originals: Map<string, unknown>;
  let oldConfig: typeof sails.config;
  const execute = sinon.stub();
  const schema = sinon.stub();
  beforeEach(() => {
    originals = new Map(names.map(name => [name, Reflect.get(globalThis, name)]));
    oldConfig = sails.config;
    execute.reset();
    execute.resolves({ count: 10 });
    schema.reset();
    schema.resolves({ fields: [] });
    Reflect.set(globalThis, 'User', {
      findOne: sinon.stub().returns({ populate: sinon.stub().resolves(principal.user) }),
    });
    Reflect.set(globalThis, 'UsersService', { getEffectiveUser: sinon.stub().returns(of(principal.user)) });
    Reflect.set(globalThis, 'BrandingService', { getBrand: sinon.stub().returns(principal.brand) });
    Reflect.set(globalThis, 'ReportingService', { execute, getReportingSchema: schema });
  });
  afterEach(() => {
    sinon.restore();
    sails.config = oldConfig;
    for (const [name, value] of originals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
  });
  class ReadySolrService extends Services.SolrSearchService {
    public async verifyReportingSchema(): Promise<void> {
      Reflect.set(this, 'waitForSolr', async () => undefined);
      Reflect.set(this, 'getSchema', async () => ({
        schema: {
          fields: [
            ...sails.config.solr.cores.default.schema['add-field'],
            ...structuredClone(SOLR_EXACT_ACL_FIELDS),
            sails.config.solr.cores.default.initSchemaFlag,
          ],
          fieldTypes: [{ name: 'string', class: 'solr.StrField' }],
          dynamicFields: sails.config.solr.cores.default.schema['add-dynamic-field'],
          copyFields: sails.config.solr.cores.default.schema['add-copy-field'],
        },
      }));
      await this.buildSchema();
    }
  }
  async function readySolr(): Promise<ReadySolrService> {
    const service = new ReadySolrService();
    await service.verifyReportingSchema();
    return service;
  }
  const request = (body: unknown = { operation: 'count', recordType: 'rdmp' }) =>
    ({
      user: { id: principal.user.id },
      options: { locals: { branding: 'a' } },
      apiRequest: { body, params: { recordType: 'rdmp' } },
    }) as unknown as Sails.Req;
  it('refreshes the authenticated identity and invokes the shared reporting service', async () => {
    const controller = new TestController();
    const req = request();
    await controller.query(req, {} as Sails.Res);
    expect(execute.firstCall.args[0]).to.deep.equal(principal);
    expect(execute.firstCall.args[1]).to.deep.equal(req.apiRequest!.body);
    expect(execute.firstCall.args[2]).to.deep.equal({ channel: 'rest' });
    expect(controller.response.data).to.deep.equal({ count: 10 });
    expect(controller.response.headers?.['Cache-control']).to.include('no-cache');
    await controller.schema(req, {} as Sails.Res);
    expect(schema.firstCall.args[1]).to.deep.equal({ recordType: 'rdmp' });
  });
  it('does not execute without authentication and sanitizes errors', async () => {
    const controller = new TestController();
    const req = request();
    Reflect.deleteProperty(req, 'user');
    await controller.query(req, {} as Sails.Res);
    expect(controller.response.status).to.equal(401);
    expect(execute.called).to.equal(false);
    execute.rejects(new ReportingError('FORBIDDEN'));
    await controller.query(request(), {} as Sails.Res);
    expect(controller.response.status).to.equal(403);
    execute.rejects(new Error('private database details'));
    await controller.query(request(), {} as Sails.Res);
    expect(controller.response.status).to.equal(503);
    expect(JSON.stringify(controller.response)).not.to.include('database');
  });
  it('uses strict route contracts to reject caller identities and raw queries', () => {
    const route = reportingApiRoutes[1];
    for (const body of [
      { operation: 'count', recordType: 'rdmp', brand: 'other' },
      { operation: 'count', recordType: 'rdmp', pipeline: [{ $where: 'x' }] },
    ]) {
      const result = validateApiRouteRequest(request(body), route);
      expect(result.valid).to.equal(false);
    }
  });
  it('quotes hostile text as a literal phrase and selects only bounded IDs with tenant and ACL filters', async () => {
    sails.config = { ...sails.config, solr: structuredClone(solr) };
    const get = sinon.stub(axios, 'get').resolves({
      data: {
        response: {
          docs: [
            { storage_id: ['mongo-internal-id'], redboxOid: 'record-1' },
            { storage_id: ['another-internal-id'], redboxOid: ['record-2'] },
            { storage_id: ['internal-id-without-public-oid'] },
          ],
        },
      },
    });
    const service = await readySolr();
    expect(
      await service.searchReportingText(principal, 'default', 'rdmp', 'machine learning" OR *:*', 0, 21)
    ).to.deep.equal(['record-1', 'record-2']);
    const options = get.firstCall.args[1];
    const params = options!.params as URLSearchParams;
    expect(params.get('q')).to.equal('full_text:"machine learning\\" OR *:*"');
    expect(params.get('fl')).to.equal('redboxOid');
    expect(params.get('rows')).to.equal('21');
    // Mongo's unique storage ID keeps timestamp ties stable across offset pages.
    expect(params.get('sort')).to.equal('date_object_modified desc,storage_id asc');
    expect(params.getAll('fq')).to.include('metaMetadata_brandId:"brand-a"');
    expect(params.get('rbAclVersion')).to.equal(SOLR_EXACT_ACL_VERSION);
    expect(params.get('rbAclUser')).to.equal(principal.user.username);
    expect(params.get('rbAclRole0')).to.equal('Reporter');
    expect(params.getAll('fq').at(-1)).to.include('f=redbox_acl2_view_roles v=$rbAclRole0');
    try {
      await service.searchReportingText(principal, 'default', 'rdmp', 'text', 0, 1000);
      throw new Error('Expected limit');
    } catch (error) {
      expect(error).to.be.instanceOf(ReportingError);
    }
    expect(get.calledOnce).to.equal(true);
  });
  for (const partialResults of [true, 'true', 'omitted']) {
    it(`rejects incomplete Solr reporting pages when partialResults is ${JSON.stringify(partialResults)}`, async () => {
      sails.config = { ...sails.config, solr: structuredClone(solr) };
      const get = sinon.stub(axios, 'get').resolves({
        data: {
          responseHeader: { partialResults, details: 'private Solr query details' },
          response: { numFound: 42, docs: [{ redboxOid: 'incomplete-record' }] },
        },
      });
      const service = await readySolr();
      let failure: unknown;
      try {
        await service.searchReportingText(principal, 'default', 'rdmp', 'text', 0, 21);
      } catch (error) {
        failure = error;
      }
      expect(get.calledOnce).to.equal(true);
      expect(failure).to.be.instanceOf(ReportingError);
      expect(failure).to.have.property('code', 'UNAVAILABLE');
      expect(failure).to.have.property('message', 'UNAVAILABLE');
      expect(JSON.stringify(failure)).not.to.include('private');
    });
  }
  it('accepts a complete Solr reporting page with an explicit false partial-results flag', async () => {
    sails.config = { ...sails.config, solr: structuredClone(solr) };
    sinon.stub(axios, 'get').resolves({
      data: {
        responseHeader: { partialResults: false },
        response: { numFound: 1, docs: [{ redboxOid: 'complete-record' }] },
      },
    });
    const service = await readySolr();
    expect(await service.searchReportingText(principal, 'default', 'rdmp', 'text', 0, 21)).to.deep.equal([
      'complete-record',
    ]);
  });
});
