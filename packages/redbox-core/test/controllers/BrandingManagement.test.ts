let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountBrandingOperationRoutes, brandingOperationRoutes } from '../../src/http/express/brandingOperations';
import { mountBrandingUploadRoutes, brandingUploadRoutes } from '../../src/http/express/brandingUploads';
import { StreamingMultipart } from '../../src/http/express/multipart';
import {
  brandingApiRoutes,
  brandingFaceUploadRoute,
  brandingRestoreRoute,
  brandingVersionPreviewRoute,
} from '../../src/api-routes/groups/branding';
import { validateApiRouteFiles, validateApiRouteRequest } from '../../src/api-routes/validation';
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
  return stubs;
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

describe('Owned branding management HTTP and contracts', function () {
  let sandbox: sinon.SinonSandbox;
  let stubs: Record<string, sinon.SinonStub>;
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let directory: string;
  let multipart: StreamingMultipart;
  let failStage = false;
  let faceMaxBytes = 2 * 1024 * 1024;
  const headers = { 'X-ReDBox-Api-Version': '2.0' };
  const api = '/default/portal/api/branding';
  const app = '/default/portal/app/branding';
  beforeEach(async function () {
    sandbox = sinon.createSandbox();
    stubs = stubBrandingService(sandbox);
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-branding-http-'));
    failStage = false;
    faceMaxBytes = 2 * 1024 * 1024;
    const disk = {
      async putStream(key: string, stream: NodeJS.ReadableStream) {
        await pipeline(stream, fs.createWriteStream(path.join(directory, key)));
        if (failStage) throw new Error('private staging failure');
      },
      async exists(key: string) {
        return fs.existsSync(path.join(directory, key));
      },
      async delete(key: string) {
        await fs.promises.unlink(path.join(directory, key));
      },
      async getBytes(key: string) {
        return fs.promises.readFile(path.join(directory, key));
      },
    };
    multipart = new StreamingMultipart(disk as any, {
      files: 1,
      fileSize: 4 * 1024 * 1024,
      fields: 8,
      fieldSize: 1024,
    });
    f = await httpRouteFixture((router, input) => {
      const shared = { ...input, branding: stubs as any, audit: sandbox.stub().resolves() };
      mountBrandingOperationRoutes(router, shared);
      mountBrandingUploadRoutes(router, {
        ...shared,
        logos: {} as any,
        multipart,
        staging: disk,
        get faceMaxBytes() {
          return faceMaxBytes;
        },
      });
    });
  });
  afterEach(async function () {
    await f?.close();
    await multipart?.close();
    fs.rmSync(directory, { recursive: true, force: true });
    sandbox.restore();
  });
  async function upload(base = api, size?: number) {
    const form = new FormData();
    form.set('expectedDraftRevision', '2');
    const bytes = size ? Buffer.alloc(size) : buildWoff2();
    form.set('face', new Blob([bytes]), 'face.woff2');
    const response = await fetch(f.url + base + '/draft/typeface/faces/regular', {
      method: 'PUT',
      headers,
      body: form,
    });
    const body = await response.json();
    expect(fs.readdirSync(directory), 'all staged files removed before response').to.deep.equal([]);
    return { status: response.status, body };
  }
  it('exposes every lifecycle action on both surfaces', function () {
    const owned = [...brandingOperationRoutes, ...brandingUploadRoutes];
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
      for (const surface of ['/api/branding/', '/app/branding/'])
        expect(
          owned.some(r => r.action === action && r.path.includes(surface)),
          surface + action
        ).to.equal(true);
    }
  });
  it('registers matching REST and AJAX routes', function () {
    const owned = [...brandingOperationRoutes, ...brandingUploadRoutes];
    for (const route of brandingApiRoutes) {
      expect(owned.some(r => r.method === route.method && r.path === route.path)).to.equal(true);
      if (route.action !== 'history')
        expect(
          owned.some(
            r => r.method === route.method && r.path === route.path.replace('/api/branding/', '/app/branding/')
          )
        ).to.equal(true);
    }
  });
  it('keeps management routes behind the Admin boundary', async function () {
    const apiRule = auth.rules.find(rule => rule.path === '/:branding/:portal/api(/*)' && rule.role === 'Admin');
    const appRule = auth.rules.find(
      rule => rule.path === '/:branding/:portal/app/branding(/*)' && rule.role === 'Admin'
    );
    expect(apiRule?.can_update).to.equal(true);
    expect(appRule?.can_update).to.equal(true);
    f.authenticate.resolves(f.actor);
    for (const base of [api, app]) expect((await f.request(base + '/config')).status).to.equal(403);
    expect(stubs.getAdminState.called).to.equal(false);
  });
  it('serves public fonts outside the brand-scoped policy chain', function () {
    const { policies } = require('../../src/config/policies.config');
    expect(policies.BrandingController.renderFont).to.deep.equal(['contentSecurityPolicy']);
    const { fontDeliveryRoute: route } = require('../../src/http/express/pageAssets');
    expect(route).to.include({ controller: 'BrandingController', action: 'renderFont' });
  });
  it('derives the actor from authentication and ignores body actors', async function () {
    const response = await f.request(api + '/draft', {
      method: 'POST',
      headers,
      body: { variables: {}, expectedDraftRevision: 2, actor: { id: 'spoofed' } },
    });
    expect(response.status).to.equal(200);
    expect(stubs.saveDraft.calledOnce).to.equal(true);
    const input = stubs.saveDraft.firstCall.args[0];
    expect(input).to.include({ branding: 'default', expectedDraftRevision: 2 });
    expect(input.variables).to.deep.equal({});
    expect(input.actor.id).to.equal(f.actor.id);
    expect(input.actor).not.to.have.property('password');
    expect(response.body.data).to.have.property('branding');
  });
  it('maps conflicts with current counters, and validation, limit, missing, and server errors', async function () {
    stubs.saveDraft.rejects(conflictError());
    const request = () =>
      f.request(api + '/draft', { method: 'POST', headers, body: { expectedDraftRevision: 2, variables: {} } });
    const conflict = await request();
    expect(conflict.status).to.equal(409);
    expect(conflict.body.data).to.deep.equal({ current: { version: 3, draftRevision: 7 } });
    const cases: Array<[unknown, number]> = [
      [Object.assign(new Error('branding-invalid: no regular'), { code: 'branding-invalid' }), 400],
      [Object.assign(new Error('typeface-variable-font'), { code: 'typeface-variable-font' }), 400],
      [Object.assign(new Error('typeface-face-too-large'), { code: 'typeface-face-too-large' }), 413],
      [Object.assign(new Error('typeface-family-too-large'), { code: 'typeface-family-too-large' }), 413],
      [new Error('branding-not-found'), 404],
      [new Error('history-not-found'), 404],
      [new Error('private kaboom'), 500],
    ];
    for (const [message, code] of [
      ['history-not-found: Version not found: abc', 404],
      ['branding-not-found: Brand not found: nope', 404],
      ['branding-face-not-found: No draft face in slot: bold', 404],
      ['branding-invalid: A custom typeface cannot be published without a Regular face', 400],
      ['typeface-variable-font: Variable fonts are not supported', 400],
      ['typeface-invalid-font: Invalid WOFF2 font: bad signature', 400],
      ['typeface-face-too-large: Typeface face size 99 exceeds the configured maximum 10', 413],
    ] as Array<[string, number]>)
      cases.push([Object.assign(new Error(message), { code: message.split(':')[0] }), code]);
    for (const [error, code] of cases) {
      stubs.saveDraft.rejects(error);
      const response = await request();
      expect(response.status).to.equal(code);
      if (code === 500) expect(response.text).not.to.contain('private kaboom');
    }
  });
  it('handles multipart upload with runtime maxima and cleans up temp files', async function () {
    const response = await upload();
    expect(response.status).to.equal(200);
    expect(stubs.uploadTypefaceFace.calledOnce).to.equal(true);
    const args = stubs.uploadTypefaceFace.firstCall.args[0];
    expect(args).to.include({ branding: 'default', slot: 'regular', expectedDraftRevision: 2 });
    expect(Buffer.isBuffer(args.bytes)).to.equal(true);
    expect(args.bytes).to.deep.equal(buildWoff2());
    expect(args.actor.id).to.equal(f.actor.id);
    expect(response.body.data).to.have.property('branding');
  });
  for (const surface of ['REST', 'AJAX'])
    for (const failure of ['upload-size', 'upload-unexpected', 'service-conflict']) {
      it(`cleans up temporary files after ${surface} ${failure} errors`, async function () {
        failStage = failure === 'upload-unexpected';
        stubs.uploadTypefaceFace.rejects(conflictError());
        const response = await upload(
          surface === 'REST' ? api : app,
          failure === 'upload-size' ? 4 * 1024 * 1024 + 1 : undefined
        );
        expect(response.status).to.equal(failure === 'upload-size' ? 413 : failure === 'service-conflict' ? 409 : 500);
        expect(stubs.uploadTypefaceFace.called).to.equal(failure === 'service-conflict');
      });
    }
  it('rejects restore across brands and aliases rollback with deprecation metadata', async function () {
    const body = { expectedVersion: 1, expectedDraftRevision: 2 };
    stubs.restore.rejects(
      Object.assign(new Error('history-not-found: foreign version'), { code: 'history-not-found' })
    );
    expect((await f.request(api + '/restore/h1', { method: 'POST', headers, body })).status).to.equal(404);
    expect(stubs.restore.firstCall.args[0]).to.include({ branding: 'default', versionId: 'h1', ...body });
    stubs.restore.resolves({ state: ADMIN_STATE, version: 2, hash: 'h2' });
    const response = await f.request(api + '/rollback/h1', { method: 'POST', headers, body });
    expect(response.status).to.equal(200);
    expect(stubs.restore.callCount).to.equal(2);
    expect(response.headers.get('Deprecation')).to.equal('true');
    const route = brandingApiRoutes.find(r => r.action === 'rollback');
    expect(route?.summary).to.contain('Deprecated');
    expect(route?.description).to.contain('next major release');
  });
  it('keeps REST and AJAX responses in parity', async function () {
    const body = { variables: { primary: '#ffffff' }, expectedDraftRevision: 4 };
    const rest = await f.request(api + '/draft', { method: 'POST', headers, body });
    const ajax = await f.request(app + '/draft', { method: 'POST', headers, body });
    expect(rest.status).to.equal(200);
    expect(ajax.body).to.deep.equal(rest.body);
    expect(stubs.saveDraft.secondCall.args[0]).to.deep.equal(stubs.saveDraft.firstCall.args[0]);
    const rollback = await f.request(app + '/rollback/h9', {
      method: 'POST',
      headers,
      body: { expectedVersion: 1, expectedDraftRevision: 2 },
    });
    expect(rollback.status).to.equal(200);
    expect(rollback.headers.get('Deprecation')).to.equal('true');
    expect(stubs.restore.firstCall.args[0].branding).to.equal('default');
  });
  it('advertises the default face maximum while accepting runtime overrides', async function () {
    expect(brandingFaceUploadRoute.request?.files?.face?.maxBytes).to.equal(2 * 1024 * 1024);
    expect(brandingFaceUploadRoute.request?.files?.face?.mimeTypes).to.equal(undefined);
    expect(validateApiRouteFiles(brandingFaceUploadRoute, { face: [{ size: 3 * 1024 * 1024 }] }).valid).to.equal(false);
    expect(
      validateApiRouteFiles(
        brandingFaceUploadRoute,
        { face: [{ size: 3 * 1024 * 1024 }] },
        { maxBytesOverrides: { face: 4 * 1024 * 1024 } }
      ).valid
    ).to.equal(true);
    expect((await upload(api, 3 * 1024 * 1024)).status).to.equal(413);
    faceMaxBytes = 4 * 1024 * 1024;
    expect((await upload(api, 3 * 1024 * 1024)).status).to.equal(200);
  });
  it('preserves branding and portal through slot/version param validation', function () {
    const request = {
      params: { branding: 'default', portal: 'portal', slot: 'regular' },
      query: {},
      headers: {},
      body: {},
    };
    const upload = validateApiRouteRequest(request, brandingFaceUploadRoute, { files: { face: [{ size: 128 }] } });
    expect(upload.valid).to.equal(true);
    if (!upload.valid) throw new Error('Expected upload validation');
    expect(upload.params).to.include({ branding: 'default', portal: 'portal', slot: 'regular' });
    const versioned = {
      params: { branding: 'default', portal: 'portal', versionId: 'h1' },
      query: {},
      headers: { 'content-type': 'application/json' },
      body: { expectedVersion: 1, expectedDraftRevision: 2 },
    };
    for (const route of [brandingRestoreRoute, brandingVersionPreviewRoute]) {
      const result = validateApiRouteRequest(versioned, route);
      expect(result.valid).to.equal(true);
      if (!result.valid) throw new Error('Expected version validation');
      expect(result.params).to.include({ branding: 'default', portal: 'portal', versionId: 'h1' });
    }
  });
});
