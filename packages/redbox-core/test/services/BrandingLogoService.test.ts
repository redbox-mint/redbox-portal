let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import crypto from 'crypto';
import * as sinon from 'sinon';
import { Services } from '../../src/services/BrandingLogoService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('BrandingLogoService', function () {
  let service: Services.BrandingLogo;
  let mockSails: any;
  let mockPrimaryDisk: any;

  beforeEach(function () {
    mockSails = createMockSails();
    setupServiceTestGlobals(mockSails);

    mockPrimaryDisk = {
      put: sinon.stub().resolves(),
      getBytes: sinon.stub().resolves(Buffer.from('stored-binary')),
      delete: sinon.stub().resolves(),
    };

    (global as any).StorageManagerService = {
      primaryDisk: sinon.stub().returns(mockPrimaryDisk),
    };

    (global as any).BrandingConfig = {
      findOne: sinon.stub(),
      update: sinon.stub(),
    };

    (global as any).DomSanitizerService = {
      sanitize: sinon.stub(),
    };

    service = new Services.BrandingLogo();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).BrandingConfig;
    delete (global as any).DomSanitizerService;
    delete (global as any).StorageManagerService;
    sinon.restore();
  });

  describe('sanitizeAndValidate', function () {
    it('should error on empty buffer', async function () {
      const result = await service.sanitizeAndValidate(Buffer.from(''), 'image/png');
      expect(result.ok).to.be.false;
      expect(result.errors).to.include('empty');
    });

    it('should error on unsupported type', async function () {
      const result = await service.sanitizeAndValidate(Buffer.from('data'), 'application/pdf');
      expect(result.ok).to.be.false;
      expect(result.errors).to.include('unsupported-type');
    });

    it('should validate valid png', async function () {
      const result = await service.sanitizeAndValidate(Buffer.from('fake-image-data'), 'image/png');
      expect(result.ok).to.be.true;
      expect(result.finalContentType).to.equal('image/png');
    });

    it('should sanitize svg', async function () {
      (global as any).DomSanitizerService.sanitize.resolves({ safe: true, sanitized: '<svg>safe</svg>', warnings: [] });
      const result = await service.sanitizeAndValidate(Buffer.from('<svg>bad</svg>'), 'image/svg+xml');
      expect(result.ok).to.be.true;
      expect(result.sanitizedBuffer!.toString()).to.equal('<svg>safe</svg>');
    });
  });

  describe('putLogo', function () {
    it('stores immutable brand-scoped logo bytes without changing published metadata', async function () {
      const image = await service.storeDraftImage('brand1', 'logo', Buffer.from('data'), 'image/png');
      expect(image.storageKey).to.match(/^branding-images\/brand1\/logo\/[a-f0-9-]+\.png$/);
      expect(mockPrimaryDisk.put.firstCall.args[0]).to.equal(image.storageKey);
      expect((global as any).BrandingConfig.update.called).to.be.false;
    });

    it('should read logo bytes from the primary disk and cache them', async function () {
      const firstRead = await service.getBinaryAsync('brand/portal/images/logo.png');
      const secondRead = await service.getBinaryAsync('brand/portal/images/logo.png');

      expect(firstRead?.toString()).to.equal('stored-binary');
      expect(secondRead?.toString()).to.equal('stored-binary');
      expect(mockPrimaryDisk.getBytes.calledOnce).to.be.true;
    });

    it('should reload a cached binary when the expected hash changes', async function () {
      const oldBinary = Buffer.from('old-binary');
      const newBinary = Buffer.from('new-binary');
      const oldHash = crypto.createHash('sha256').update(oldBinary).digest('hex');
      const newHash = crypto.createHash('sha256').update(newBinary).digest('hex');
      mockPrimaryDisk.getBytes.onFirstCall().resolves(oldBinary);
      mockPrimaryDisk.getBytes.onSecondCall().resolves(newBinary);

      const firstRead = await service.getBinaryAsync('brand/portal/images/favicon.png', oldHash);
      const secondRead = await service.getBinaryAsync('brand/portal/images/favicon.png', newHash);

      expect(firstRead?.toString()).to.equal('old-binary');
      expect(secondRead?.toString()).to.equal('new-binary');
      expect(mockPrimaryDisk.getBytes.calledTwice).to.be.true;
    });

    it('should not serve storage bytes that do not match the expected hash', async function () {
      const expectedHash = crypto.createHash('sha256').update('new-binary').digest('hex');
      mockPrimaryDisk.getBytes.resolves(Buffer.from('old-binary'));

      const result = await service.getBinaryAsync('brand/portal/images/favicon.png', expectedHash);

      expect(result).to.be.null;
      expect(
        mockSails.log.warn.calledWith(
          'BrandingLogoService.getBinaryAsync hash mismatch for brand/portal/images/favicon.png'
        )
      ).to.be.true;
    });

    it('should retry current favicon metadata when a superseded object disappears', async function () {
      const oldBuffer = Buffer.from('old-binary');
      const currentBuffer = Buffer.from('current-binary');
      const oldHash = crypto.createHash('sha256').update(oldBuffer).digest('hex');
      const currentHash = crypto.createHash('sha256').update(currentBuffer).digest('hex');
      (global as any).BrandingConfig.findOne.onFirstCall().resolves({
        favicon: { storageKey: 'favicon-old.png', sha256: oldHash },
      });
      (global as any).BrandingConfig.findOne.onSecondCall().resolves({
        favicon: { storageKey: 'favicon-current.png', sha256: currentHash, contentType: 'image/png' },
      });
      mockPrimaryDisk.getBytes.onFirstCall().rejects({ code: 'ENOENT' });
      mockPrimaryDisk.getBytes.onSecondCall().resolves(currentBuffer);

      const result = await service.getCurrentFaviconBinary('brand');

      expect(result?.buffer.toString()).to.equal('current-binary');
      expect(result?.favicon.storageKey).to.equal('favicon-current.png');
      expect((global as any).BrandingConfig.findOne.calledTwice).to.be.true;
    });
  });

  describe('draft favicon storage', function () {
    it('uses distinct immutable keys and retains PNG/ICO support', async function () {
      const first = await service.storeDraftImage('brand1', 'favicon', Buffer.from('data'), 'image/png');
      const second = await service.storeDraftImage('brand1', 'favicon', Buffer.from('data'), 'image/png');
      const ico = await service.storeDraftImage('brand1', 'favicon', Buffer.from('ico'), 'image/x-icon');
      expect(first.sha256).to.equal(second.sha256);
      expect(first.storageKey).to.not.equal(second.storageKey);
      expect(ico.storageKey).to.match(/\.ico$/);
      expect((global as any).BrandingConfig.update.called).to.be.false;
      expect(mockPrimaryDisk.delete.called).to.be.false;
    });
    it('keeps favicon type and size limits', async function () {
      mockSails.config.branding = { faviconMaxBytes: 10 };
      for (const [bytes, type, error] of [
        [Buffer.from('data'), 'image/jpeg', 'unsupported-type'],
        [Buffer.alloc(20), 'image/png', 'too-large'],
      ] as const) {
        let failure: any;
        try {
          await service.storeDraftImage('brand1', 'favicon', bytes, type);
        } catch (e) {
          failure = e;
        }
        expect(failure.message).to.contain(error);
      }
      expect(mockPrimaryDisk.put.called).to.be.false;
    });
    it('keeps SVG sanitisation for both image kinds', async function () {
      (global as any).DomSanitizerService.sanitize.resolves({ safe: true, sanitized: '<svg>safe</svg>', warnings: [] });
      for (const kind of ['logo', 'favicon'] as const) {
        await service.storeDraftImage('brand1', kind, Buffer.from('<svg>bad</svg>'), 'image/svg+xml');
      }
      expect(mockPrimaryDisk.put.firstCall.args[1].toString()).to.equal('<svg>safe</svg>');
    });
  });
  it('reconciles only old unreferenced images and preserves active, draft and history references', async function () {
    const keys = ['active', 'draft', 'history', 'orphan', 'young'].map(
      (_, index) => `branding-images/brand1/logo/${index + 1}.png`
    );
    mockPrimaryDisk.listAll = sinon.stub().resolves({ objects: keys.map(key => ({ key })) });
    mockPrimaryDisk.getMetaData = async (key: string) => ({ lastModified: new Date(key === keys[4] ? 950 : 0) });
    (global as any).BrandingConfig.findOne.resolves({
      logo: { storageKey: keys[0] },
      draftImages: { favicon: { storageKey: keys[1] } },
    });
    (global as any).BrandingConfigHistory = {
      find: sinon.stub().resolves([{ images: { logo: { storageKey: keys[2] } } }]),
    };
    const result = await service.reconcileAssets({ now: 1000, graceMs: 100 });
    expect(result.deleted).to.equal(1);
    expect(mockPrimaryDisk.delete.calledOnceWithExactly(keys[3])).to.equal(true);
    delete (global as any).BrandingConfigHistory;
  });
});
