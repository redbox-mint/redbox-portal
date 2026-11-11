import { Controllers } from '../../src/controllers/BrandingController';
import { Controllers as WorkspaceControllers } from '../../src/controllers/WorkspaceTypesController';
import { static_assets } from '../../src/config/static_assets.config';
import { setupServiceTestGlobals, cleanupServiceTestGlobals } from '../services/testHelper';

let expect: Chai.ExpectStatic;

describe('Branding logo delivery', () => {
  before(async () => { ({ expect } = await import('chai')); });
  beforeEach(() => {
    setupServiceTestGlobals({ config: { appPath: '/portal', static_assets: { ...static_assets } } });
  });
  afterEach(() => {
    cleanupServiceTestGlobals();
    delete (global as any).BrandingConfig;
    delete (global as any).BrandingLogoService;
    delete (global as any).BrandingService;
    delete (global as any).WorkspaceTypesService;
    delete (global as any).StorageManagerService;
  });

  async function render(logo?: object, bytes: Buffer | null = null) {
    (global as any).BrandingConfig = { findOne: async () => ({ name: 'default', logo }) };
    (global as any).BrandingLogoService = { getBinaryAsync: async () => bytes };
    const result = { type: '', file: '', body: null as Buffer | null, headers: {} as Record<string, string> };
    const res = {
      contentType: (value: string) => { result.type = value; },
      sendFile: (file: string) => { result.file = file; },
      set: (key: string, value: string) => { result.headers[key] = value; },
      send: (body: Buffer) => { result.body = body; },
    };
    await new Controllers.Branding().renderImage({ param: () => 'default', headers: {} } as any, res as any);
    return result;
  }

  it('serves the SVG with its MIME type through the unchanged branding endpoint', async () => {
    const result = await render();
    expect(result.file).to.equal('/portal/assets/images/logo.svg');
    expect(result.type).to.equal('image/svg+xml');
  });

  it('retains deployment-specific static artwork and its MIME type', async () => {
    (global as any).sails.config.static_assets = { logoName: 'institution.png', imageType: 'image/png' };
    const result = await render();
    expect(result.file).to.equal('/portal/assets/images/institution.png');
    expect(result.type).to.equal('image/png');
  });

  it('retains uploaded logos, MIME types and cache policy', async () => {
    for (const contentType of ['image/png', 'image/svg+xml']) {
      const bytes = Buffer.from('stored custom artwork');
      const result = await render({ storageKey: 'custom-logo', contentType }, bytes);
      expect(result.body).to.equal(bytes);
      expect(result.file).to.equal('');
      expect(result.type).to.equal(contentType);
      expect(result.headers['Cache-Control']).to.equal('public, max-age=3600');
      expect(result.headers.ETag).to.match(/^W\/"logo-/);
    }
  });

  it('falls back to the vector default if uploaded bytes are unavailable', async () => {
    const result = await render({ storageKey: 'missing-logo', contentType: 'image/png' });
    expect(result.file).to.equal('/portal/assets/images/logo.svg');
    expect(result.type).to.equal('image/svg+xml');
  });

  it('keeps legacy uploaded PNGs without MIME metadata independent of the SVG default', async () => {
    const bytes = Buffer.from('legacy PNG bytes');
    const result = await render({ gridFsId: 'legacy-logo' }, bytes);
    expect(result.body).to.equal(bytes);
    expect(result.type).to.equal('image/png');
  });

  it('keeps workspace uploads without MIME metadata independent of the SVG default', async () => {
    const bytes = Buffer.from('legacy workspace PNG bytes');
    (global as any).BrandingService = { getBrand: () => ({ id: 'default' }) };
    (global as any).WorkspaceTypesService = {
      getOne: () => ({ subscribe: (next: (row: object) => unknown) => next({ logo: 'legacy-workspace-logo' }) }),
    };
    (global as any).StorageManagerService = {
      primaryDisk: () => ({ getBytes: async () => bytes, getMetaData: async () => null }),
    };
    let type: string;
    let body: Buffer;
    await new WorkspaceControllers.WorkspaceTypes().renderImage({ param: () => 'rdmp', session: {} } as any, {
      contentType: (value: string) => { type = value; },
      send: (value: Buffer) => { body = value; },
    } as any);
    expect(type).to.equal('image/png');
    expect(body).to.deep.equal(bytes);
  });
});
