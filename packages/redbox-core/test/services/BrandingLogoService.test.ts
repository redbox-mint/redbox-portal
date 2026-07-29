let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import crypto from 'crypto';
import * as sinon from 'sinon';
import { Services } from '../../src/services/BrandingLogoService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('BrandingLogoService', function() {
  let service: Services.BrandingLogo;
  let mockSails: any;
  let mockPrimaryDisk: any;

  beforeEach(function() {
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
      update: sinon.stub()
    };

    (global as any).DomSanitizerService = {
      sanitize: sinon.stub()
    };

    service = new Services.BrandingLogo();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).BrandingConfig;
    delete (global as any).DomSanitizerService;
    delete (global as any).StorageManagerService;
    sinon.restore();
  });

  describe('sanitizeAndValidate', function() {
    it('should error on empty buffer', async function() {
      const result = await service.sanitizeAndValidate(Buffer.from(''), 'image/png');
      expect(result.ok).to.be.false;
      expect(result.errors).to.include('empty');
    });

    it('should error on unsupported type', async function() {
      const result = await service.sanitizeAndValidate(Buffer.from('data'), 'application/pdf');
      expect(result.ok).to.be.false;
      expect(result.errors).to.include('unsupported-type');
    });

    it('should validate valid png', async function() {
      const result = await service.sanitizeAndValidate(Buffer.from('fake-image-data'), 'image/png');
      expect(result.ok).to.be.true;
      expect(result.finalContentType).to.equal('image/png');
    });

    it('should sanitize svg', async function() {
      (global as any).DomSanitizerService.sanitize.resolves({ safe: true, sanitized: '<svg>safe</svg>', warnings: [] });
      const result = await service.sanitizeAndValidate(Buffer.from('<svg>bad</svg>'), 'image/svg+xml');
      expect(result.ok).to.be.true;
      expect(result.sanitizedBuffer!.toString()).to.equal('<svg>safe</svg>');
    });
  });

  describe('putLogo', function() {
    it('should throw if brand not found', async function() {
      (global as any).BrandingConfig.findOne.resolves(null);
      try {
        await service.putLogo({ branding: 'brand', portal: 'portal', fileBuffer: Buffer.from('data'), contentType: 'image/png' });
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect(e instanceof Error ? e.message : String(e)).to.equal('branding-not-found');
      }
    });

    it('should store logo and update config', async function() {
      const brand = { id: 'brand1' };
      (global as any).BrandingConfig.findOne.resolves(brand);
      (global as any).BrandingConfig.update.resolves([]);
      
      const result = await service.putLogo({ branding: 'brand', portal: 'portal', fileBuffer: Buffer.from('data'), contentType: 'image/png' });
      
      expect(result.contentType).to.equal('image/png');
      expect(result.storageKey).to.equal('brand/portal/images/logo.png');
      expect(mockPrimaryDisk.put.calledOnce).to.be.true;
      expect(mockPrimaryDisk.put.firstCall.args[0]).to.equal('brand/portal/images/logo.png');
      expect(mockPrimaryDisk.put.firstCall.args[2]).to.deep.equal({ contentType: 'image/png' });
      expect((global as any).BrandingConfig.update.calledOnce).to.be.true;
      expect((global as any).BrandingConfig.update.firstCall.args[1].logo).to.include({
        gridFsId: 'brand/portal/images/logo.png',
        storageKey: 'brand/portal/images/logo.png',
        contentType: 'image/png',
      });
      
      // Should be cached
      const cached = service.getBinary(result.gridFsId);
      expect(cached).to.not.be.null;
    });

    it('should read logo bytes from the primary disk and cache them', async function() {
      const firstRead = await service.getBinaryAsync('brand/portal/images/logo.png');
      const secondRead = await service.getBinaryAsync('brand/portal/images/logo.png');

      expect(firstRead?.toString()).to.equal('stored-binary');
      expect(secondRead?.toString()).to.equal('stored-binary');
      expect(mockPrimaryDisk.getBytes.calledOnce).to.be.true;
    });

    it('should reload a cached binary when the expected hash changes', async function() {
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

    it('should not serve storage bytes that do not match the expected hash', async function() {
      const expectedHash = crypto.createHash('sha256').update('new-binary').digest('hex');
      mockPrimaryDisk.getBytes.resolves(Buffer.from('old-binary'));

      const result = await service.getBinaryAsync('brand/portal/images/favicon.png', expectedHash);

      expect(result).to.be.null;
      expect(mockSails.log.warn.calledWith(
        'BrandingLogoService.getBinaryAsync hash mismatch for brand/portal/images/favicon.png'
      )).to.be.true;
    });
  });

  describe('putFavicon', function() {
    it('should throw if brand not found', async function() {
      (global as any).BrandingConfig.findOne.resolves(null);
      try {
        await service.putFavicon({ branding: 'brand', portal: 'portal', fileBuffer: Buffer.from('data'), contentType: 'image/png' });
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect(e instanceof Error ? e.message : String(e)).to.equal('branding-not-found');
      }
    });

    it('should store a PNG favicon and update config', async function() {
      const brand = { id: 'brand1' };
      (global as any).BrandingConfig.findOne.resolves(brand);
      (global as any).BrandingConfig.update.resolves([]);

      const result = await service.putFavicon({ branding: 'brand', portal: 'portal', fileBuffer: Buffer.from('data'), contentType: 'image/png' });
      const expectedHash = crypto.createHash('sha256').update('data').digest('hex');
      const expectedStorageKey = `brand/portal/images/favicon-${expectedHash}.png`;

      expect(result.contentType).to.equal('image/png');
      expect(result.storageKey).to.equal(expectedStorageKey);
      expect(mockPrimaryDisk.put.firstCall.args[0]).to.equal(expectedStorageKey);
      expect((global as any).BrandingConfig.update.firstCall.args[1].favicon).to.include({
        storageKey: expectedStorageKey,
        contentType: 'image/png',
      });
    });

    it('should clean up a superseded favicon after the reader cache TTL', async function() {
      const clock = sinon.useFakeTimers();
      const previousStorageKey = 'brand/portal/images/favicon-previous.png';
      (global as any).BrandingConfig.findOne.onFirstCall().resolves({
        id: 'brand1',
        favicon: { storageKey: previousStorageKey },
      });
      (global as any).BrandingConfig.findOne.onSecondCall().resolves({
        id: 'brand1',
        favicon: { storageKey: 'brand/portal/images/favicon-current.png' },
      });
      (global as any).BrandingConfig.update.resolves([]);

      await service.putFavicon({
        branding: 'brand',
        portal: 'portal',
        fileBuffer: Buffer.from('replacement'),
        contentType: 'image/png',
      });

      expect((global as any).BrandingConfig.update.calledOnce).to.be.true;
      expect(mockPrimaryDisk.delete.called).to.be.false;

      await clock.tickAsync(24 * 60 * 60 * 1000);
      expect(mockPrimaryDisk.delete.calledOnceWithExactly(previousStorageKey)).to.be.true;
    });

    it('should not delete a superseded favicon that becomes active again before cleanup', async function() {
      const clock = sinon.useFakeTimers();
      const previousStorageKey = 'brand/portal/images/favicon-previous.png';
      (global as any).BrandingConfig.findOne.resolves({
        id: 'brand1',
        favicon: { storageKey: previousStorageKey },
      });
      (global as any).BrandingConfig.update.resolves([]);

      await service.putFavicon({
        branding: 'brand',
        portal: 'portal',
        fileBuffer: Buffer.from('replacement'),
        contentType: 'image/png',
      });
      await clock.tickAsync(24 * 60 * 60 * 1000);

      expect((global as any).BrandingConfig.findOne.calledTwice).to.be.true;
      expect(mockPrimaryDisk.delete.called).to.be.false;
    });

    it('should accept an ICO favicon', async function() {
      const brand = { id: 'brand1' };
      (global as any).BrandingConfig.findOne.resolves(brand);
      (global as any).BrandingConfig.update.resolves([]);

      const result = await service.putFavicon({ branding: 'brand', portal: 'portal', fileBuffer: Buffer.from('icodata'), contentType: 'image/x-icon' });
      const expectedHash = crypto.createHash('sha256').update('icodata').digest('hex');

      expect(result.contentType).to.equal('image/x-icon');
      expect(result.storageKey).to.equal(`brand/portal/images/favicon-${expectedHash}.ico`);
    });

    it('should not overwrite the active favicon before its metadata update succeeds', async function() {
      const previousStorageKey = 'brand/portal/images/favicon-previous.png';
      (global as any).BrandingConfig.findOne.resolves({
        id: 'brand1',
        favicon: { storageKey: previousStorageKey, sha256: 'previous' }
      });
      (global as any).BrandingConfig.update.rejects(new Error('database unavailable'));

      try {
        await service.putFavicon({
          branding: 'brand',
          portal: 'portal',
          fileBuffer: Buffer.from('replacement'),
          contentType: 'image/png'
        });
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : String(error)).to.equal('database unavailable');
      }

      expect(mockPrimaryDisk.put.calledOnce).to.be.true;
      expect(mockPrimaryDisk.put.firstCall.args[0]).to.not.equal(previousStorageKey);
      expect(mockPrimaryDisk.delete.called).to.be.false;
    });

    it('should reject an unsupported favicon content type', async function() {
      const brand = { id: 'brand1' };
      (global as any).BrandingConfig.findOne.resolves(brand);
      try {
        await service.putFavicon({ branding: 'brand', portal: 'portal', fileBuffer: Buffer.from('data'), contentType: 'image/jpeg' });
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect(e instanceof Error ? e.message : String(e)).to.match(/favicon-invalid: .*unsupported-type/);
      }
    });

    it('should reject an oversized favicon', async function() {
      const brand = { id: 'brand1' };
      (global as any).BrandingConfig.findOne.resolves(brand);
      mockSails.config.branding = { faviconMaxBytes: 10 };
      try {
        await service.putFavicon({ branding: 'brand', portal: 'portal', fileBuffer: Buffer.alloc(20, 0), contentType: 'image/png' });
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect(e instanceof Error ? e.message : String(e)).to.match(/favicon-invalid: .*too-large/);
      }
    });
  });
});
