let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
const fs = require('fs');
const path = require('path');
import { setupServiceTestGlobals, cleanupServiceTestGlobals } from '../services/testHelper';
import { Controllers } from '../../src/controllers/BrandingController';

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

function buildWoff2(compressedSize = 64): Buffer {
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
  const fontData = Buffer.alloc(compressedSize, 0xa5);
  const header = Buffer.alloc(48);
  header.writeUInt32BE(0x774f4632, 0);
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt32BE(48 + dirBytes.length + compressedSize, 8);
  header.writeUInt16BE(tables.length, 12);
  return Buffer.concat([header, Buffer.from(dirBytes), fontData]);
}

class FakeDisk {
  objects = new Map<string, Buffer>();
  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
  async getBytes(key: string): Promise<Uint8Array> {
    const bytes = this.objects.get(key);
    if (!bytes) throw Object.assign(new Error('NoSuchKey'), { code: 'NoSuchKey' });
    return bytes;
  }
  async getMetaData(key: string): Promise<{ contentLength: number; etag: string; lastModified: Date }> {
    const bytes = this.objects.get(key);
    if (!bytes) throw Object.assign(new Error('NoSuchKey'), { code: 'NoSuchKey' });
    return { contentLength: bytes.length, etag: 'etag', lastModified: new Date() };
  }
  async put(key: string, contents: Uint8Array): Promise<void> {
    this.objects.set(key, Buffer.from(contents));
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
  async listAll(): Promise<{ paginationToken?: string; objects: Iterable<unknown> }> {
    return { objects: [], paginationToken: undefined };
  }
}

function fakeReq(
  params: Record<string, string>,
  headers: Record<string, string> = {},
  method = 'GET'
): Record<string, unknown> {
  return {
    param: (name: string) => params[name],
    headers,
    method,
  };
}

function fakeRes(): {
  headers: Record<string, string>;
  statusCode: number;
  body: unknown;
  ended: boolean;
  res: Record<string, unknown>;
} {
  const captured = {
    headers: {} as Record<string, string>,
    statusCode: 200,
    body: undefined as unknown,
    ended: false,
    res: {} as Record<string, unknown>,
  };
  captured.res = {
    set: (key: string, value: string) => {
      captured.headers[key] = value;
    },
    removeHeader: () => undefined,
    status: (code: number) => {
      captured.statusCode = code;
      return captured.res;
    },
    send: (body: unknown) => {
      captured.body = body;
      captured.ended = true;
      return captured.res;
    },
    end: () => {
      captured.ended = true;
      return captured.res;
    },
  };
  return captured;
}

const LAYOUTS = ['views/default/default/layout.ejs', 'views/default/default/record/layout.ejs', 'views/layout.ejs'];
const PARTIALS = [
  'views/default/default/homepage.ejs',
  'views/default/default/getAdvice.ejs',
  'views/default/default/listWorkspaces.ejs',
  'views/default/default/availableServicesList.ejs',
  'views/default/rdmp/dashboard.ejs',
];

function repoPath(...segments: string[]): string {
  return path.join(__dirname, '..', '..', '..', '..', ...segments);
}

describe('Branding public font delivery and layouts', function () {
  let disk: FakeDisk;
  let controller: Controllers.Branding;
  let updateCalls: Array<Record<string, unknown>>;
  const brandRow = { id: 'brand-1', name: 'default', css: 'body { color: red; }', hash: 'stale-hash', variables: {} };
  let faceSha = '';

  beforeEach(async function () {
    setupServiceTestGlobals({
      config: { appPath: '/app', http: { rootContext: '' }, branding: {} },
      log: {
        verbose: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });
    (global as unknown as Record<string, unknown>)._ = require('lodash');
    disk = new FakeDisk();
    (global as unknown as Record<string, unknown>).StorageManagerService = { primaryDisk: () => disk };
    const themeCss = require('../../src/services/BrandingThemeCssService');
    (global as unknown as Record<string, unknown>).BrandingThemeCssService = new themeCss.Services.BrandingThemeCss();
    const typeface = require('../../src/services/BrandingTypefaceService');
    (global as unknown as Record<string, unknown>).BrandingTypefaceService = new typeface.Services.BrandingTypeface();
    const brandingService = require('../../src/services/BrandingService');
    (global as unknown as Record<string, unknown>).BrandingService = new brandingService.Services.Branding();
    updateCalls = [];
    (global as unknown as Record<string, unknown>).BrandingConfig = {
      findOne: async (criteria: Record<string, unknown>) => (criteria.name === 'default' ? { ...brandRow } : null),
      update: async (criteria: unknown, values: unknown) => {
        updateCalls.push({ criteria, values } as Record<string, unknown>);
        return [];
      },
    };
    controller = new Controllers.Branding();
    const face = await (
      global as unknown as {
        BrandingTypefaceService: { inspectAndStoreFace(input: Record<string, unknown>): Promise<{ sha256: string }> };
      }
    ).BrandingTypefaceService.inspectAndStoreFace({
      brandingId: 'brand-1',
      slot: 'regular',
      bytes: buildWoff2(),
      originalFilename: 'r.woff2',
    });
    faceSha = face.sha256;
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as unknown as Record<string, unknown>).StorageManagerService;
    delete (global as unknown as Record<string, unknown>).BrandingThemeCssService;
    delete (global as unknown as Record<string, unknown>).BrandingTypefaceService;
    delete (global as unknown as Record<string, unknown>).BrandingService;
    delete (global as unknown as Record<string, unknown>).BrandingConfig;
  });

  it('serves public font bytes with immutable same-origin headers', async function () {
    const req = fakeReq({ branding: 'default', sha256: `${faceSha}.woff2` });
    const captured = fakeRes();
    await controller.renderFont(req as unknown as Sails.Req, captured.res as unknown as Sails.Res);
    expect(captured.statusCode).to.equal(200);
    expect(captured.headers['Content-Type']).to.equal('font/woff2');
    expect(captured.headers['ETag']).to.equal(`"${faceSha}"`);
    expect(captured.headers['Cache-Control']).to.equal('public, max-age=31536000, immutable');
    expect(captured.headers['X-Content-Type-Options']).to.equal('nosniff');
    expect(captured.headers['Content-Length']).to.equal(String((captured.body as Buffer).length));
    expect(Buffer.isBuffer(captured.body)).to.equal(true);
  });

  it('answers HEAD with headers and no body, and 304 on matching ETag', async function () {
    const headReq = fakeReq({ branding: 'default', sha256: faceSha }, {}, 'HEAD');
    const head = fakeRes();
    await controller.renderFont(headReq as unknown as Sails.Req, head.res as unknown as Sails.Res);
    expect(head.statusCode).to.equal(200);
    expect(head.body).to.equal(undefined);
    expect(head.headers['ETag']).to.equal(`"${faceSha}"`);
    const cachedReq = fakeReq({ branding: 'default', sha256: faceSha }, { 'if-none-match': `"${faceSha}"` });
    const cached = fakeRes();
    await controller.renderFont(cachedReq as unknown as Sails.Req, cached.res as unknown as Sails.Res);
    expect(cached.statusCode).to.equal(304);
  });

  it('returns 404 without substitution for bad hash, unknown brand, absent, and corrupt objects', async function () {
    const badHash = fakeRes();
    await controller.renderFont(
      fakeReq({ branding: 'default', sha256: 'not-a-hash' }) as unknown as Sails.Req,
      badHash.res as unknown as Sails.Res
    );
    expect(badHash.statusCode).to.equal(404);
    const unknownBrand = fakeRes();
    await controller.renderFont(
      fakeReq({ branding: 'nope', sha256: `${faceSha}.woff2` }) as unknown as Sails.Req,
      unknownBrand.res as unknown as Sails.Res
    );
    expect(unknownBrand.statusCode).to.equal(404);
    const absent = fakeRes();
    await controller.renderFont(
      fakeReq({ branding: 'default', sha256: `${'a'.repeat(64)}.woff2` }) as unknown as Sails.Req,
      absent.res as unknown as Sails.Res
    );
    expect(absent.statusCode).to.equal(404);
    expect(absent.body).to.not.contain('woff2');
    disk.objects.set(`branding-fonts/brand-1/${faceSha}.woff2`, Buffer.from('tampered'));
    const corrupt = fakeRes();
    await controller.renderFont(
      fakeReq({ branding: 'default', sha256: faceSha }) as unknown as Sails.Req,
      corrupt.res as unknown as Sails.Res
    );
    expect(corrupt.statusCode).to.equal(404);
  });

  it('derives the theme ETag without rewriting publication state', async function () {
    const req = fakeReq({});
    const captured = fakeRes();
    await controller.renderCss(req as unknown as Sails.Req, captured.res as unknown as Sails.Res);
    expect(captured.statusCode).to.equal(200);
    expect(captured.headers['ETag']).to.match(/^W\/".+"$/);
    expect(captured.headers['Cache-Control']).to.equal('public, max-age=300, must-revalidate');
    expect(updateCalls).to.have.lengthOf(0);
  });

  it('serves immutable theme CSS when the request pins the current publication hash', async function () {
    const versioned = fakeRes();
    await controller.renderCss(
      fakeReq({ branding: 'default', v: 'stale-hash' }) as unknown as Sails.Req,
      versioned.res as unknown as Sails.Res
    );
    expect(versioned.statusCode).to.equal(200);
    expect(versioned.headers['Cache-Control']).to.equal('public, max-age=31536000, immutable');
    const stale = fakeRes();
    await controller.renderCss(
      fakeReq({ branding: 'default', v: 'outdated-hash' }) as unknown as Sails.Req,
      stale.res as unknown as Sails.Res
    );
    expect(stale.statusCode).to.equal(200);
    expect(stale.headers['Cache-Control']).to.equal('public, max-age=300, must-revalidate');
  });

  it('creates public preview tokens bound to the current draft revision', async function () {
    const branding = require('../../src/services/BrandingService');
    (global as unknown as Record<string, unknown>).BrandingService = new branding.Services.Branding();
    (global as unknown as Record<string, unknown>).BrandingThemeCssService =
      new (require('../../src/services/BrandingThemeCssService').Services.BrandingThemeCss)();
    const cacheEntries: Array<Record<string, unknown>> = [];
    (global as unknown as Record<string, unknown>).CacheEntry = {
      create: async (values: Record<string, unknown>) => {
        cacheEntries.push(values);
        return values;
      },
    };
    const req = fakeReq({ branding: 'default', portal: 'rdmp' });
    const captured = fakeRes();
    const jsonBody: Array<unknown> = [];
    (captured.res as Record<string, unknown>).json = (body: unknown) => {
      jsonBody.push(body);
      return captured.res;
    };
    await controller.createPreview(req as unknown as Sails.Req, captured.res as unknown as Sails.Res);
    expect(jsonBody).to.have.lengthOf(1);
    expect((jsonBody[0] as { token?: string }).token).to.match(/^[0-9a-f]{32}$/);
    expect(cacheEntries).to.have.lengthOf(1);
    expect((cacheEntries[0].data as { revision?: number }).revision).to.equal(0);
  });

  it('exposes active custom state and Regular preload URLs from the brand cache', function () {
    const branding = require('../../src/services/BrandingService');
    const service = new branding.Services.Branding();
    expect(service.hasActiveCustomTypeface('default')).to.equal(false);
    expect(service.getActiveTypefaceFontInfo('default')).to.equal(null);
    service.brandings = [
      { id: 'brand-1', name: 'default', typeface: { mode: 'custom', faces: { regular: { sha256: faceSha } } } },
    ];
    expect(service.hasActiveCustomTypeface('default')).to.equal(true);
    expect(service.getActiveTypefaceFontInfo('default')).to.deep.equal({
      regularUrl: `/fonts/branding/default/${faceSha}.woff2`,
    });
    expect(service.hasActiveCustomTypeface('unknown')).to.equal(false);
  });

  it('conditions Google fonts on Default Typography with a single Regular preload', function () {
    for (const file of LAYOUTS) {
      const content = fs.readFileSync(repoPath(file), 'utf8');
      expect(content, file).to.contain('getActiveTypefaceFontInfo');
      expect(content, file).to.contain('fonts.googleapis.com');
      const googleIndex = content.indexOf('fonts.googleapis.com');
      const ifIndex = content.indexOf('if (__brandTypefaceFont)');
      const elseIndex = content.indexOf('} else {', ifIndex);
      expect(ifIndex, `${file} conditional`).to.be.greaterThan(-1);
      expect(googleIndex, `${file} google links in else branch`).to.be.greaterThan(elseIndex);
      const preloads =
        content.match(/rel="preload"[\s\S]*?as="font"[\s\S]*?type="font\/woff2"[\s\S]*?crossorigin/g) || [];
      expect(preloads.length, `${file} preloads`).to.equal(1);
    }
    for (const file of PARTIALS) {
      const content = fs.readFileSync(repoPath(file), 'utf8');
      expect(content, file).to.contain('hasActiveCustomTypeface');
      expect(content, file).to.contain('fonts.googleapis.com');
    }
    const remaining = [...LAYOUTS, ...PARTIALS];
    void remaining;
  });

  it('keeps hook CSS after the generated theme stylesheet', function () {
    const content = fs.readFileSync(repoPath('views/default/default/layout.ejs'), 'utf8');
    expect(content.indexOf('styles/theme.css')).to.be.lessThan(content.indexOf('head-extra'));
  });

  it('versions theme stylesheet URLs by publication hash in every layout', function () {
    for (const file of LAYOUTS) {
      const content = fs.readFileSync(repoPath(file), 'utf8');
      expect(content, `${file} version logic`).to.contain('__themeCssVer');
      expect(content, `${file} version query`).to.contain('styles/theme.css<%=');
      expect(content, `${file} hash source`).to.contain('.hash');
    }
  });

  it('recognises public font paths as static assets with same-origin font CSP', function () {
    const httpConfig = require('../../src/config/http.config');
    const sha = 'a'.repeat(64);
    expect(httpConfig.isImmutableAssetPath(`/fonts/branding/default/${sha}.woff2`)).to.equal(true);
    const { csp } = require('../../src/config/csp.config');
    expect(csp.directives['font-src']).to.include("'self'");
  });

  it('keeps embedded Angular apps from pinning a hardcoded body font', function () {
    // An app bundle loads after theme.css, so a hardcoded body font-family
    // would permanently beat the generated brand variable (see T13 report).
    const appsRoot = repoPath('angular', 'projects', 'researchdatabox');
    const apps = fs.readdirSync(appsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory());
    expect(apps.length).to.be.greaterThan(0);
    for (const app of apps) {
      const stylesPath = path.join(appsRoot, app.name, 'src', 'styles.scss');
      if (!fs.existsSync(stylesPath)) {
        continue;
      }
      const styles = fs.readFileSync(stylesPath, 'utf8');
      const bodyBlocks = styles.match(/(?:^|\n)\s*(?:body|html)\s*\{[^}]*\}/g) || [];
      for (const block of bodyBlocks) {
        if (block.includes('font-family')) {
          expect(block, `${app.name}/styles.scss body/html font`).to.contain('var(--rb-brand-font-family');
        }
      }
    }
    const brandingStyles = fs.readFileSync(path.join(appsRoot, 'branding', 'src', 'styles.scss'), 'utf8');
    expect(brandingStyles).to.contain('var(--rb-brand-font-family, Arial, Helvetica, sans-serif)');
  });
});
