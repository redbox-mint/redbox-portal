
import sinon from 'sinon';
import fs from 'node:fs';

import path from 'node:path';
import { repositoryFixtures } from '../helpers/repositoryFixtures';
import { brandingInput } from '../helpers/brandingInputs';
import { createSinonStubLogger } from '../logger.test';
import { Services as Branding } from '../../src/branding/Branding';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
function buildWoff2(size = 0): Buffer {
  const bytes = fs.readFileSync(path.resolve(__dirname, '../../../../test/resources/fonts/test-font-regular.woff2'));
  return size > bytes.length ? Buffer.concat([bytes, Buffer.alloc(size - bytes.length)]) : bytes;
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
let inputs: ReturnType<typeof brandingInput>;
let service: Branding.Branding;
let updateCalls: Array<Record<string, unknown>>;
const brandRow = { id: 'brand-1', name: 'default', css: 'body { color: red; }', hash: 'stale-hash', variables: {} };
let faceSha = '';
beforeEach(async function () {
    disk = new FakeDisk();
    inputs = brandingInput(
      { config: { http: { rootContext: '' }, branding: {} }, log: createSinonStubLogger(sinon) },
      disk
    );
    service = new Branding.Branding(inputs);

    updateCalls = [];
    repositoryFixtures.BrandingConfig = {
      findOne: async (criteria: Record<string, unknown>) => (criteria.name === 'default' ? { ...brandRow } : null),
      update: async (criteria: unknown, values: unknown) => {
        updateCalls.push({ criteria, values } as Record<string, unknown>);
        return [];
      },
    };

    repositoryFixtures.BrandingConfigHistory = { find: async () => [] };

    const face = await inputs.typeface.inspectAndStoreFace({
      brandingId: 'brand-1',
      slot: 'regular',
      bytes: buildWoff2(),
      originalFilename: 'r.woff2',
    });
    faceSha = face.sha256;
  });
afterEach(function () {
    sinon.restore();
    delete repositoryFixtures.BrandingConfig;
    delete repositoryFixtures.BrandingConfigHistory;
  });
it('exposes active custom state and Regular preload URLs from the brand cache', function () {
    const service = new Branding.Branding(inputs);
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
      expect(content, file).to.contain('page.typeface');
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
      expect(content, file).to.contain('page.typeface');
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
afterEach(() => sinon.restore());
});
