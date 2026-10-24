import fs from 'node:fs';
import path from 'node:path';

import * as sinon from 'sinon';

import { BrandingDelivery } from '../../src/http/express/brandingDelivery';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { auth } from '../../src/config/auth.config';
import { pageRoutes } from '../../src/http/express/pages';
import { brandingDeliveryRoutes } from '../../src/http/express/pageAssets';
import { createSinonStubLogger } from '../logger.test';

describe('admin API docs', function () {
  let expect: Chai.ExpectStatic;
  let controller: BrandingDelivery;
  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(function () {
    controller = new BrandingDelivery({ apiConfiguration: { auth }, log: nothingLogger } as any);
  });
  afterEach(() => sinon.restore());

  it('wires the branded admin docs routes to the expected controllers', function () {
    expect(pageRoutes.find(route => route.path === '/:branding/:portal/admin/api-docs')).to.deep.include({
      controller: 'RenderViewController',
      action: 'render',
      view: 'admin/api-docs',
    });
    expect(
      brandingDeliveryRoutes.find(route => route.path === '/:branding/:portal/admin/api-docs/openapi.json')
    ).to.deep.include({
      controller: 'BrandingController',
      action: 'renderSwaggerJSON',
      method: 'get',
    });
  });

  it('grants admin read access to the docs page and its openapi payload', function () {
    const docsRule = auth.rules.find(rule => rule.path === '/:branding/:portal/admin/api-docs');
    const docsPayloadRule = auth.rules.find(rule => rule.path === '/:branding/:portal/admin/api-docs(/*)');

    expect(docsRule).to.deep.equal({
      path: '/:branding/:portal/admin/api-docs',
      role: 'Admin',
      can_read: true,
    });
    expect(docsPayloadRule).to.deep.equal({
      path: '/:branding/:portal/admin/api-docs(/*)',
      role: 'Admin',
      can_read: true,
    });
  });

  it('renders the branded OpenAPI document as JSON', async function () {
    this.timeout(20_000);
    const req = { params: { branding: 'default', portal: 'rdmp' }, headers: {} };
    const res = {
      contentType: sinon.stub(),
      send: sinon.stub().returnsThis(),
    } as any;

    await controller.renderSwaggerJSON(req, res);

    expect((res as any).contentType.calledOnceWithExactly('application/json')).to.equal(true);
    const doc = JSON.parse(String((res as any).send.firstCall.args[0]));
    expect(doc.paths).to.have.property('/default/rdmp/api/users');
    expect(doc.paths).to.not.have.property('/{branding}/{portal}/api/users');
  });

  it('keeps the EJS view self-contained and local to the portal', function () {
    const viewPath = path.resolve(__dirname, '../../../../views/default/default/admin/api-docs.ejs');
    const contents = fs.readFileSync(viewPath, 'utf8');

    expect(contents).to.include('<!doctype html>');
    expect(contents).to.include('/default/default/js/admin-api-docs-init.js');
    expect(contents).to.include('/default/default/js/admin-api-docs-bootstrap.js');
    expect(contents).to.include('/admin/api-docs/openapi.json');
    expect(contents).to.include('/default/default/js/redoc.standalone.js');
    expect(contents).to.not.include('cdn.redoc.ly');
  });

  it('copies the redoc bundle into the webpack public output', function () {
    const webpackConfigPath = path.resolve(__dirname, '../../../../packages/redbox-core/src/config/webpack.config.ts');
    const contents = fs.readFileSync(webpackConfigPath, 'utf8');

    expect(contents).to.include("from: './node_modules/redoc/bundles/redoc.standalone.js'");
    expect(contents).to.include("to: './default/default/js/'");
  });
});
