import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { Controllers, mapEmailTemplateAdminError } from '../../src/controllers/EmailTemplateAdminController';
import { EmailTemplateError, EmailTemplateConflictError } from '../../src/services/EmailTemplateService';
import { routes } from '../../src/config/routes.config';
import { auth } from '../../src/config/auth.config';
import { policies } from '../../src/config/policies.config';
import { blueprints } from '../../src/config/blueprints.config';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from '../services/testHelper';

const actions = [
  'catalogue',
  'editor',
  'saveDraft',
  'discardDraft',
  'fromDefault',
  'validate',
  'preview',
  'searchRecords',
  'recordContext',
  'publish',
  'reset',
  'history',
  'historyVersion',
  'restore',
  'page',
];

describe('Email template Admin HTTP boundary', () => {
  let controller: Controllers.EmailTemplateAdmin;
  let service: any;
  let req: any;
  let res: any;
  beforeEach(() => {
    setupServiceTestGlobals(createMockSails());
    controller = new Controllers.EmailTemplateAdmin();
    const brand = { id: 'a', name: 'brand-a', roles: [{ id: 'admin-a', name: 'Admin' }] };
    (global as any).BrandingService = {
      getBrand: (name: string) =>
        name === 'brand-a' ? brand : name === 'brand-b' ? { id: 'b', name, roles: [{ id: 'admin-b' }] } : undefined,
    };
    (global as any).RolesService = { getAdmin: (value: any) => value.roles[0] };
    req = {
      params: { branding: 'brand-a', portal: 'rdmp', templateId: 'notice', oid: 'oid-a', version: '1' },
      query: {},
      body: {
        content: { subject: 'PRIVATE SUBJECT', body: 'PRIVATE BODY', format: 'text' },
        context: '{}',
        expectedDraftRevision: null,
        expectedLiveToken: null,
      },
      isAuthenticated: () => true,
      user: { id: 'editor', username: 'username', name: 'Editor Name', roles: [{ id: 'admin-a' }] },
    };
    res = {
      headersSent: false,
      set: sinon.stub().returnsThis(),
      status: sinon.stub().returnsThis(),
      json: sinon.stub().callsFake(function (this: any) {
        res.headersSent = true;
        return res;
      }),
    };
    service = {};
    for (const name of [
      'catalogue',
      'getEditorState',
      'saveDraft',
      'discardDraft',
      'startDraftFromDefault',
      'validate',
      'preview',
      'searchPreviewRecords',
      'previewContextFromRecord',
      'publish',
      'resetToDefault',
      'listHistory',
      'getHistoryVersion',
      'restoreToDraft',
    ]) {
      service[name] = sinon.stub().resolves({ ok: true });
    }
    service.validate = sinon.stub().returns([]);
    service.preview.resolves({ subject: 'Rendered', text: 'Body', sanitiserRemovals: [], diagnostics: [] });
    (global as any).EmailTemplateAdminService = service;
    (global as any).EmailTemplateService = { getDefault: sinon.stub().resolves({}) };
  });
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
    for (const name of ['BrandingService', 'RolesService', 'EmailTemplateAdminService', 'EmailTemplateService'])
      delete (global as any)[name];
  });

  for (const role of ['Researcher', 'Librarians', 'brand-b Admin', 'anonymous']) {
    for (const action of actions) {
      it(`returns 403 for ${role} on ${action}`, async () => {
        req.user.roles = [{ id: role === 'brand-b Admin' ? 'admin-b' : role }];
        if (role === 'anonymous') req.isAuthenticated = () => false;
        await (controller as any)[action](req, res);
        assert.equal(res.status.lastCall.args[0], 403);
        assert.equal(res.json.lastCall.args[0].error.code, 'FORBIDDEN');
        for (const method of Object.values(service) as sinon.SinonStub[]) assert.equal(method.callCount, 0);
      });
    }
  }
  for (const action of actions) {
    it(`denies changing the route brand before ${action} reads or writes data`, async () => {
      req.params.branding = 'brand-b';
      await (controller as any)[action](req, res);
      assert.equal(res.status.lastCall.args[0], 403);
      for (const method of Object.values(service) as sinon.SinonStub[]) assert.equal(method.callCount, 0);
    });
  }
  it('uses only route brand and authenticated actor, ignoring body/query brand and actor IDs', async () => {
    req.body.brandId = 'b';
    req.body.branding = 'brand-b';
    req.query.brandId = 'b';
    req.body.actor = { id: 'forged', name: 'Forged' };
    await controller.saveDraft(req, res);
    assert.deepEqual(service.saveDraft.firstCall.args, [
      'a',
      'notice',
      req.body.content,
      null,
      { id: 'editor', name: 'Editor Name' },
    ]);
    assert.equal(res.status.lastCall.args[0], 200);
    assert.equal(res.json.callCount, 1);
  });
  it('returns raw JSON errors with safe diagnostics and no stack, cause, subject, body or parser excerpt', async () => {
    service.getEditorState.rejects(new Error('PRIVATE SUBJECT PRIVATE BODY'));
    await controller.editor(req, res);
    assert.equal(res.status.lastCall.args[0], 500);
    assert.deepEqual(res.json.lastCall.args[0], {
      error: { code: 'PERSISTENCE', message: 'Email template storage is unavailable.' },
      diagnostics: [],
    });
    assert.equal(res.json.callCount, 1);
  });
  it('maps validation and render diagnostics to 400 without sending a second response', async () => {
    const diagnostics = [{ code: 'RENDER_FAILED', field: 'body', reason: 'RENDER_FAILED', line: 1, column: 1 }];
    service.preview.resolves({ subject: '', diagnostics });
    await controller.preview(req, res);
    assert.equal(res.status.lastCall.args[0], 400);
    assert.deepEqual(res.json.lastCall.args[0].diagnostics, diagnostics);
    assert.equal(res.json.callCount, 1);
  });
  it('includes only current counters and actors in a 409 payload', () => {
    const current = {
      live: null,
      draft: { draftRevision: 9, updatedBy: 'editor', updatedByName: 'Editor', updatedAt: '2026-10-01' },
      latestVersion: 3,
      lastChange: null,
    };
    const result = mapEmailTemplateAdminError(new EmailTemplateConflictError('a', 'notice', current));
    assert.equal(result.status, 409);
    assert.deepEqual(result.body.current, current);
  });
  for (const [code, status] of Object.entries({
    UNKNOWN_BRAND: 403,
    FORBIDDEN: 403,
    UNKNOWN_TEMPLATE: 404,
    UNKNOWN_VERSION: 404,
    MISSING_DEFAULT: 404,
    INVALID_TEMPLATE: 400,
    INVALID_CONTEXT: 400,
    RENDER_FAILED: 400,
    INCOMPLETE_TRANSITION: 400,
    LENGTH_LIMIT: 413,
    PERSISTENCE: 500,
    SANITISATION_FAILED: 500,
  })) {
    it(`maps ${code} to ${status}`, () => {
      const mapped = mapEmailTemplateAdminError(new EmailTemplateError(code as any, 'PRIVATE', new Error('PRIVATE')));
      assert.equal(mapped.status, status);
      assert.ok(!JSON.stringify(mapped).includes('PRIVATE'));
    });
  }
  it('declares every endpoint with default CSRF, Admin rules on both prefixes, and no blueprint routes', () => {
    const declared = Object.entries(routes).filter(([path]) => path.includes('/email-templates'));
    assert.equal(declared.length, 15);
    for (const [, route] of declared) assert.notEqual((route as any).csrf, false);
    assert.ok((policies.EmailTemplateAdminController as any)['*'].includes('emailTemplateAdmin'));
    assert.ok(
      auth.rules.some(rule => rule.path === '/:branding/:portal/app/email-templates(/*)' && rule.role === 'Admin')
    );
    assert.ok(
      auth.rules.some(rule => rule.path === '/:branding/:portal/admin/email-templates' && rule.role === 'Admin')
    );
    assert.deepEqual(blueprints, { actions: false, rest: false, shortcuts: false });
  });
});

describe('Email template Admin request parser limits', () => {
  it('caps streamed JSON request bytes and removes parser excerpts from malformed-body errors', async () => {
    const express = require('express');
    const supertest = require('supertest');
    const { http } = require('../../src/config/http.config');
    setupServiceTestGlobals(createMockSails());
    try {
      const app = express();
      app.use(http.middleware.myBodyParser);
      app.post('/a/rdmp/app/email-templates/templates/notice/preview', (_req: any, res: any) =>
        res.json({ parsed: true })
      );
      const url = '/a/rdmp/app/email-templates/templates/notice/preview';
      const malformed = await supertest(app)
        .post(url)
        .set('Content-Type', 'application/json')
        .send('{"PRIVATE BODY": broken}');
      assert.equal(malformed.status, 400);
      assert.ok(!JSON.stringify(malformed.body).includes('PRIVATE'));
      const oversized = await supertest(app)
        .post(url)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ context: 'x'.repeat(8 * 1024 * 1024) }));
      assert.equal(oversized.status, 413);
      assert.equal(oversized.body.error.code, 'LENGTH_LIMIT');
    } finally {
      cleanupServiceTestGlobals();
    }
  });
});
