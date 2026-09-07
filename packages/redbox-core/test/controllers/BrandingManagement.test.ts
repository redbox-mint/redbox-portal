let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
const sinon = require('sinon');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Controllers: RestControllers } = require('../../src/controllers/webservice/BrandingController');
const { Controllers: AjaxControllers } = require('../../src/controllers/BrandingAppController');
import { brandingApiRoutes } from '../../src/api-routes/groups/branding';
const { validateApiRouteFiles } = require('../../src/api-routes/validation');
const { brandingFaceUploadRoute } = require('../../src/api-routes/groups/branding');
const { routes } = require('../../src/config/routes.config');
import { auth } from '../../src/config/auth.config';

function encodeBase128(value: number): number[] {
  if (value === 0) return [0];
  const groups: number[] = [];
  let rest = value;
  while (rest > 0) {
    groups.unshift(rest % 128);
    rest = Math.floor(rest / 128);
  }
  for (let i = 0; i < groups.length - 1; i += 1) {
    groups[i] |= 0x80;
  }
  return groups;
}

function buildWoff2(): Buffer {
  const tables = [
    { tagIndex: 1, origLength: 54 },
    { tagIndex: 5, origLength: 128 },
    { tagIndex: 10, transformVersion: 3, origLength: 256 },
    { tagIndex: 11, transformVersion: 3, origLength: 32 },
  ];
  const dirBytes: number[] = [];
  for (const table of tables) {
    const transform = table.transformVersion ?? 0;
    dirBytes.push(((transform << 6) & 0xc0) | (table.tagIndex & 0x3f));
    for (const b of encodeBase128(table.origLength)) dirBytes.push(b);
  }
  const fontData = Buffer.alloc(64, 0xa5);
  const header = Buffer.alloc(48);
  header.writeUInt32BE(0x774f4632, 0);
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt32BE(48 + dirBytes.length + 64, 8);
  header.writeUInt16BE(tables.length, 12);
  return Buffer.concat([header, Buffer.from(dirBytes), fontData]);
}

const ADMIN_STATE = {
  branding: { id: 'brand-1', name: 'default' },
  active: { version: 1, hash: 'h', variables: {}, typeface: { mode: 'default', faces: {} } },
  draft: {
    revision: 2,
    variables: {},
    typeface: { mode: 'default', faces: {} },
    dirty: { colours: false, typeface: false },
  },
  versions: [],
  limits: { faceMaxBytes: 1, familyMaxBytes: 2, historyMaxVersions: 3 },
  healthWarnings: [],
};

function stubBrandingService(sandbox: sinon.SinonSandbox): Record<string, sinon.SinonStub> {
  const stubs: Record<string, sinon.SinonStub> = {};
  const methods = [
    'getAdminState',
    'saveDraft',
    'uploadTypefaceFace',
    'removeTypefaceFace',
    'useDefaultTypography',
    'revertTypefaceDraft',
    'preview',
    'listVersions',
    'previewVersion',
    'publish',
    'restore',
  ];
  for (const method of methods) {
    stubs[method] = sandbox.stub().resolves(ADMIN_STATE);
  }
  stubs.preview.resolves({ token: 't', url: 'u', hash: 'h', revision: 2 });
  stubs.previewVersion.resolves({ token: 't', url: 'u', hash: 'h' });
  stubs.listVersions.resolves([]);
  stubs.publish.resolves({ state: ADMIN_STATE, version: 1, hash: 'h' });
  stubs.restore.resolves({ state: ADMIN_STATE, version: 2, hash: 'h2' });
  (global as unknown as Record<string, unknown>).BrandingService = stubs;
  return stubs;
}

function restReq(
  apiRequest: { params: Record<string, unknown>; body?: unknown },
  user: unknown = { id: 'u1' }
): Record<string, unknown> {
  return {
    apiRequest: { query: {}, files: {}, ...apiRequest },
    user,
    body: (apiRequest.body ?? {}) as Record<string, unknown>,
    method: 'POST',
    headers: {},
  };
}

function captureSendResp(
  sandbox: sinon.SinonSandbox,
  controller: { sendResp: unknown }
): Array<Record<string, unknown>> {
  const sent: Array<Record<string, unknown>> = [];
  sandbox
    .stub(controller as Record<string, unknown>, 'sendResp')
    .callsFake((_req: unknown, res: unknown, build: unknown) => {
      sent.push((build ?? {}) as Record<string, unknown>);
      return res;
    });
  return sent;
}

function conflictError(): Error & { code?: string; current?: { version: number; draftRevision: number } } {
  const error = new Error('branding-conflict: stale') as Error & {
    code?: string;
    current?: { version: number; draftRevision: number };
  };
  error.code = 'branding-conflict';
  error.current = { version: 3, draftRevision: 7 };
  return error;
}

describe('Branding management controllers and contracts', function () {
  let sandbox: sinon.SinonSandbox;
  let stubs: Record<string, sinon.SinonStub>;
  let prevSails: unknown;
  let prevBrandingService: unknown;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    prevSails = (global as unknown as Record<string, unknown>).sails;
    prevBrandingService = (global as unknown as Record<string, unknown>).BrandingService;
    (global as unknown as Record<string, unknown>).sails = {
      config: { branding: {} },
      log: {
        verbose: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    };
    stubs = stubBrandingService(sandbox);
  });

  afterEach(function () {
    sandbox.restore();
    const g = global as unknown as Record<string, unknown>;
    if (prevSails === undefined) {
      delete g.sails;
    } else {
      g.sails = prevSails;
    }
    if (prevBrandingService === undefined) {
      delete g.BrandingService;
    } else {
      g.BrandingService = prevBrandingService;
    }
  });

  it('exposes every lifecycle action on both surfaces', function () {
    const rest = new RestControllers.Branding();
    const ajax = new AjaxControllers.BrandingApp();
    for (const action of [
      'config',
      'draft',
      'uploadFace',
      'deleteFace',
      'useDefault',
      'revert',
      'preview',
      'versions',
      'versionPreview',
      'publish',
      'restore',
      'rollback',
    ]) {
      expect((rest as unknown as Record<string, unknown>)._exportedMethods, `REST ${action}`).to.include(action);
      expect((ajax as unknown as Record<string, unknown>)._exportedMethods, `AJAX ${action}`).to.include(action);
    }
  });

  it('registers matching REST and AJAX routes', function () {
    const restPaths = brandingApiRoutes.map(route => `${route.method} ${route.path}`);
    for (const expected of [
      'get /:branding/:portal/api/branding/config',
      'post /:branding/:portal/api/branding/draft',
      'put /:branding/:portal/api/branding/draft/typeface/faces/:slot',
      'delete /:branding/:portal/api/branding/draft/typeface/faces/:slot',
      'post /:branding/:portal/api/branding/draft/typeface/use-default',
      'post /:branding/:portal/api/branding/draft/typeface/revert',
      'post /:branding/:portal/api/branding/preview',
      'get /:branding/:portal/api/branding/versions',
      'post /:branding/:portal/api/branding/versions/:versionId/preview',
      'post /:branding/:portal/api/branding/publish',
      'post /:branding/:portal/api/branding/restore/:versionId',
      'post /:branding/:portal/api/branding/rollback/:versionId',
    ]) {
      expect(restPaths, expected).to.include(expected);
    }
    for (const route of brandingApiRoutes) {
      expect(route.controller).to.equal('webservice/BrandingController');
    }
    for (const expected of [
      'put /:branding/:portal/app/branding/draft/typeface/faces/:slot',
      'delete /:branding/:portal/app/branding/draft/typeface/faces/:slot',
      'post /:branding/:portal/app/branding/draft/typeface/use-default',
      'post /:branding/:portal/app/branding/draft/typeface/revert',
      'get /:branding/:portal/app/branding/versions',
      'post /:branding/:portal/app/branding/versions/:versionId/preview',
      'post /:branding/:portal/app/branding/restore/:versionId',
      'post /:branding/:portal/app/branding/rollback/:versionId',
    ]) {
      expect(routes, expected).to.have.property(expected);
    }
  });

  it('keeps management routes behind the Admin boundary', function () {
    const apiRule = auth.rules.find(rule => rule.path === '/:branding/:portal/api(/*)' && rule.role === 'Admin');
    expect(apiRule?.can_update).to.equal(true);
    const appRule = auth.rules.find(
      rule => rule.path === '/:branding/:portal/app/branding(/*)' && rule.role === 'Admin'
    );
    expect(appRule?.can_update).to.equal(true);
  });

  it('serves public fonts outside the brand-scoped policy chain', function () {
    const { policies } = require('../../src/config/policies.config');
    // renderFont must skip brandingAndPortal/checkBrandingValid (which assume
    // /:branding/:portal/... URLs) and all authentication for sessionless delivery.
    expect(policies.BrandingController.renderFont).to.deep.equal(['contentSecurityPolicy']);
    // Sails skips asset-extension URLs by default; the .woff2 route must opt out.
    expect(routes['get /fonts/branding/:branding/:sha256.woff2']).to.include({
      controller: 'BrandingController',
      action: 'renderFont',
      skipAssets: false,
    });
  });

  it('derives the actor from the session and ignores body actors', async function () {
    const rest = new RestControllers.Branding();
    const sent = captureSendResp(sandbox, rest);
    const req = restReq(
      {
        params: { branding: 'default', portal: 'rdmp' },
        body: { variables: {}, expectedDraftRevision: 2, actor: { id: 'spoofed' } },
      },
      { id: 'real-user' }
    );
    await rest.draft(req as unknown as Sails.Req, {} as Sails.Res);
    expect(stubs.saveDraft.calledOnce).to.equal(true);
    expect(stubs.saveDraft.firstCall.args[0]).to.deep.equal({
      branding: 'default',
      variables: {},
      expectedDraftRevision: 2,
      actor: { id: 'real-user' },
    });
    expect(sent).to.have.lengthOf(1);
    expect(sent[0].data).to.have.property('branding');
  });

  it('maps conflicts with current counters, and validation, limit, missing, and server errors', async function () {
    const rest = new RestControllers.Branding();
    const sent = captureSendResp(sandbox, rest);
    stubs.saveDraft.rejects(conflictError());
    await rest.draft(restReq({ params: { branding: 'default' }, body: {} }) as unknown as Sails.Req, {} as Sails.Res);
    expect(sent[0].status).to.equal(409);
    expect(sent[0].data).to.deep.equal({ current: { version: 3, draftRevision: 7 } });
    const cases: Array<[unknown, number]> = [
      [Object.assign(new Error('branding-invalid: no regular'), { code: 'branding-invalid' }), 400],
      [Object.assign(new Error('typeface-variable-font'), { code: 'typeface-variable-font' }), 400],
      [Object.assign(new Error('typeface-face-too-large'), { code: 'typeface-face-too-large' }), 413],
      [Object.assign(new Error('typeface-family-too-large'), { code: 'typeface-family-too-large' }), 413],
      [new Error('branding-not-found'), 404],
      [new Error('history-not-found'), 404],
      [new Error('kaboom'), 500],
    ];
    // Service-shaped errors carry a typed code plus a `code: detail` message;
    // detail suffixes must never fall through to 500.
    const serviceShaped: Array<[string, number]> = [
      ['history-not-found: Version not found: abc', 404],
      ['branding-not-found: Brand not found: nope', 404],
      ['branding-face-not-found: No draft face in slot: bold', 404],
      ['branding-invalid: A custom typeface cannot be published without a Regular face', 400],
      ['typeface-variable-font: Variable fonts are not supported', 400],
      ['typeface-invalid-font: Invalid WOFF2 font: bad signature', 400],
      ['typeface-face-too-large: Typeface face size 99 exceeds the configured maximum 10', 413],
    ];
    for (const [message, status] of serviceShaped) {
      const code = message.split(':')[0];
      cases.push([Object.assign(new Error(message), { code }), status]);
    }
    for (const [error, status] of cases) {
      sent.length = 0;
      stubs.saveDraft.rejects(error);
      await rest.draft(restReq({ params: { branding: 'default' }, body: {} }) as unknown as Sails.Req, {} as Sails.Res);
      expect(sent[0].status, String(status)).to.equal(status);
    }
  });

  it('handles multipart upload with runtime maxima and cleans up temp files', async function () {
    const rest = new RestControllers.Branding();
    const sent = captureSendResp(sandbox, rest);
    const tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'face-')), 'face.woff2');
    fs.writeFileSync(tmpFile, buildWoff2());
    const req = restReq({ params: { branding: 'default', portal: 'rdmp', slot: 'regular' } });
    (req as Record<string, unknown>)._fileparser = true;
    (req as Record<string, unknown>).file = () => ({
      upload: (options: Record<string, unknown>, cb: (err: unknown, files: unknown[]) => void) => {
        expect(options.maxBytes).to.equal(2 * 1024 * 1024);
        cb(null, [{ fd: tmpFile, filename: 'face.woff2', type: 'application/octet-stream', size: 128 }]);
      },
    });
    (req as Record<string, unknown>).body = { expectedDraftRevision: '2' };
    stubs.uploadTypefaceFace.resolves(ADMIN_STATE);
    await rest.uploadFace(req as unknown as Sails.Req, {} as Sails.Res);
    expect(stubs.uploadTypefaceFace.calledOnce).to.equal(true);
    const args = stubs.uploadTypefaceFace.firstCall.args[0] as Record<string, unknown>;
    expect(args.slot).to.equal('regular');
    expect(args.expectedDraftRevision).to.equal(2);
    expect(Buffer.isBuffer(args.bytes)).to.equal(true);
    // Client MIME is transported but never trusted for validity (service validates structurally).
    expect(fs.existsSync(tmpFile)).to.equal(false);
    expect(sent).to.have.lengthOf(1);
    expect(sent[0].data).to.have.property('branding');
  });

  for (const surface of ['REST', 'AJAX']) {
    for (const failure of ['upload-size', 'upload-unexpected', 'service-conflict']) {
      it(`cleans up temporary files after ${surface} ${failure} errors`, async function () {
        const controller = surface === 'REST' ? new RestControllers.Branding() : new AjaxControllers.BrandingApp();
        const sent = captureSendResp(sandbox, controller);
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'face-error-'));
        const tempFile = path.join(directory, 'face.woff2');
        fs.writeFileSync(tempFile, buildWoff2());
        try {
          const params = { branding: 'default', portal: 'rdmp', slot: 'regular' };
          const req = surface === 'REST' ? restReq({ params }) : { params, headers: {}, method: 'PUT' };
          Object.assign(req, {
            _fileparser: true,
            body: { expectedDraftRevision: '2' },
            file: () => ({
              upload: (_options: unknown, cb: (error: unknown, files: unknown[]) => void) => {
                const error =
                  failure === 'upload-size'
                    ? new Error('maxBytes exceeded')
                    : failure === 'upload-unexpected'
                      ? new Error('upload failed')
                      : null;
                cb(error, [{ fd: tempFile, filename: 'face.woff2', size: 128 }]);
              },
            }),
          });
          stubs.uploadTypefaceFace.rejects(
            Object.assign(new Error('branding-conflict'), { code: 'branding-conflict' })
          );
          await controller.uploadFace(req as unknown as Sails.Req, {} as Sails.Res);
          expect(fs.existsSync(tempFile)).to.equal(false);
          expect(sent[0].status).to.equal(failure === 'upload-size' ? 413 : failure === 'service-conflict' ? 409 : 500);
          expect(stubs.uploadTypefaceFace.called).to.equal(failure === 'service-conflict');
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      });
    }
  }

  it('rejects restore across brands and aliases rollback with deprecation metadata', async function () {
    const rest = new RestControllers.Branding();
    const sent = captureSendResp(sandbox, rest);
    await rest.restore(
      restReq({
        params: { branding: 'default', versionId: 'h1' },
        body: { expectedVersion: 1, expectedDraftRevision: 2 },
      }) as unknown as Sails.Req,
      {} as Sails.Res
    );
    expect(stubs.restore.firstCall.args[0]).to.deep.equal({
      branding: 'default',
      versionId: 'h1',
      expectedVersion: 1,
      expectedDraftRevision: 2,
      actor: { id: 'u1' },
    });
    sent.length = 0;
    await rest.rollback(
      restReq({
        params: { branding: 'default', versionId: 'h1' },
        body: { expectedVersion: 1, expectedDraftRevision: 2 },
      }) as unknown as Sails.Req,
      {} as Sails.Res
    );
    expect(stubs.restore.callCount).to.equal(2);
    expect((sent[0].headers as Record<string, string>).Deprecation).to.equal('true');
    const rollbackRoute = brandingApiRoutes.find(route => route.action === 'rollback');
    expect(rollbackRoute?.summary).to.contain('Deprecated');
    expect(rollbackRoute?.description).to.contain('next major release');
  });

  it('keeps REST and AJAX responses in parity', async function () {
    const ajax = new AjaxControllers.BrandingApp();
    const sent = captureSendResp(sandbox, ajax);
    const req = {
      params: { branding: 'default', portal: 'rdmp' },
      body: { variables: { primary: '#ffffff' }, expectedDraftRevision: 4 },
      user: { id: 'u1' },
      method: 'POST',
      headers: {},
    };
    await ajax.draft(req as unknown as Sails.Req, {} as Sails.Res);
    expect(stubs.saveDraft.firstCall.args[0]).to.deep.equal({
      branding: 'default',
      variables: { primary: '#ffffff' },
      expectedDraftRevision: 4,
      actor: { id: 'u1' },
    });
    expect(sent[0].data).to.have.property('draft');
    sent.length = 0;
    const ajaxRollback = new AjaxControllers.BrandingApp();
    captureSendResp(sandbox, ajaxRollback);
    const rbReq = {
      params: { branding: 'default', versionId: 'h9' },
      body: { expectedVersion: 1, expectedDraftRevision: 2 },
      user: { id: 'u1' },
      method: 'POST',
      headers: {},
    };
    await ajaxRollback.rollback(rbReq as unknown as Sails.Req, {} as Sails.Res);
    expect(stubs.restore.firstCall.args[0].branding).to.equal('default');
  });

  it('advertises the default face maximum while accepting runtime overrides', function () {
    expect(brandingFaceUploadRoute.request?.files?.face?.maxBytes).to.equal(2 * 1024 * 1024);
    expect(brandingFaceUploadRoute.request?.files?.face?.mimeTypes).to.equal(undefined);
    const oversized = validateApiRouteFiles(brandingFaceUploadRoute, { face: [{ size: 3 * 1024 * 1024 }] });
    expect(oversized.valid).to.equal(false);
    const raised = validateApiRouteFiles(
      brandingFaceUploadRoute,
      { face: [{ size: 3 * 1024 * 1024 }] },
      { maxBytesOverrides: { face: 4 * 1024 * 1024 } }
    );
    expect(raised.valid).to.equal(true);
  });

  it('preserves branding and portal through slot/version param validation', function () {
    const { validateApiRouteRequest } = require('../../src/api-routes/validation');
    const { brandingRestoreRoute, brandingVersionPreviewRoute } = require('../../src/api-routes/groups/branding');
    const request = {
      params: { branding: 'default', portal: 'rdmp', slot: 'regular' },
      query: {},
      headers: {},
      body: {},
    } as unknown as Sails.Req;
    const upload = validateApiRouteRequest(request, brandingFaceUploadRoute, {
      files: { face: [{ size: 128 }] },
    });
    expect(upload.valid).to.equal(true);
    if (!upload.valid) {
      throw new Error('Expected face upload validation to pass');
    }
    expect(upload.params.branding).to.equal('default');
    expect(upload.params.portal).to.equal('rdmp');
    expect(upload.params.slot).to.equal('regular');
    const versioned = {
      params: { branding: 'default', portal: 'rdmp', versionId: 'h1' },
      query: {},
      headers: { 'content-type': 'application/json' },
      body: { expectedVersion: 1, expectedDraftRevision: 2 },
    } as unknown as Sails.Req;
    for (const route of [brandingRestoreRoute, brandingVersionPreviewRoute]) {
      const result = validateApiRouteRequest(versioned, route);
      expect(result.valid).to.equal(true);
      if (!result.valid) {
        throw new Error('Expected version route validation to pass');
      }
      expect(result.params.branding).to.equal('default');
      expect(result.params.versionId).to.equal('h1');
    }
  });
});
