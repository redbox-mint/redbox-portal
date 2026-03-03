let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Services } from '../../src/services/BrandingLogoService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('BrandingLogoService', function() {
  let service: Services.BrandingLogo;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    // Mock getDatastore to return null so we don't try to connect to Mongo
    mockSails.getDatastore = sinon.stub().returns(null);
    setupServiceTestGlobals(mockSails);

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
      expect((global as any).BrandingConfig.update.calledOnce).to.be.true;
      
      // Should be cached
      const cached = service.getBinary(result.gridFsId);
      expect(cached).to.not.be.null;
    });
  });
});
