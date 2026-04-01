let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('DomSanitizerService', function() {
  let mockSails: any;
  let DomSanitizerService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        record: {
          form: {
            svgMaxBytes: 1048576 // 1MB
          }
        },
        dompurify: {
          defaultProfile: 'svg',
          globalSettings: {},
          profiles: {
            svg: {
              USE_PROFILES: { svg: true, svgFilters: true },
              ALLOWED_TAGS: ['svg', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline', 'ellipse', 'g', 'defs', 'use', 'text', 'tspan'],
              ALLOWED_ATTR: ['viewBox', 'd', 'fill', 'stroke', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'transform', 'id', 'class']
            },
            html: {
              USE_PROFILES: { html: true }
            },
            minimal: {
              ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p']
            }
          }
        }
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        silly: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      }
    });

    setupServiceTestGlobals(mockSails);

    // Import after mocks are set up
    const { Services } = require('../../src/services/DomSanitizerService');
    DomSanitizerService = new Services.DomSanitizer();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  describe('sanitize', function() {
    it('should sanitize a valid simple SVG', function() {
      const svg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';
      
      const result = DomSanitizerService.sanitize(svg);
      
      expect(result).to.have.property('safe', true);
      expect(result).to.have.property('sanitized');
      expect(result.sanitized).to.include('svg');
      expect(result.sanitized).to.include('circle');
      expect(result.errors).to.be.an('array').that.is.empty;
    });

    it('should reject non-string input', function() {
      const result = DomSanitizerService.sanitize(null as any);
      
      expect(result.safe).to.be.false;
      expect(result.errors).to.include('not-a-string');
    });

    it('should reject SVG that is too large', function() {
      const largeSvg = '<svg>' + 'x'.repeat(2000000) + '</svg>';
      
      const result = DomSanitizerService.sanitize(largeSvg);
      
      expect(result.safe).to.be.false;
      expect(result.errors).to.include('too-large');
    });

    it('should detect missing svg root element', function() {
      const html = '<div>Not an SVG</div>';
      
      const result = DomSanitizerService.sanitize(html);
      
      expect(result.errors).to.include('missing-svg-root');
    });

    it('should remove script elements', function() {
      const svg = '<svg><script>alert("xss")</script><circle cx="50" cy="50" r="40"/></svg>';
      
      const result = DomSanitizerService.sanitize(svg);
      
      expect(result.errors).to.include('script-element');
      expect(result.sanitized).not.to.include('script');
      expect(result.sanitized).not.to.include('alert');
    });

    it('should detect foreignObject elements', function() {
      const svg = '<svg><foreignObject><body><script>alert("xss")</script></body></foreignObject></svg>';
      
      const result = DomSanitizerService.sanitize(svg);
      
      expect(result.errors).to.include('foreign-object');
    });

    it('should detect javascript protocol in href', function() {
      const svg = '<svg><a href="javascript:alert(1)"><circle cx="50" cy="50" r="40"/></a></svg>';
      
      const result = DomSanitizerService.sanitize(svg);
      
      expect(result.errors).to.include('javascript-protocol');
    });

    it('should detect data URLs', function() {
      const svg = '<svg><image href="data:image/svg+xml,<svg onload=alert(1)>"/></svg>';
      
      const result = DomSanitizerService.sanitize(svg);
      
      expect(result.errors).to.include('data-url-embed');
    });

    it('should detect CDATA sections', function() {
      const svg = '<svg><![CDATA[ some content ]]></svg>';
      
      const result = DomSanitizerService.sanitize(svg);
      
      expect(result.errors).to.include('cdata-section');
    });

    it('should detect control characters', function() {
      const svg = '<svg>\x00\x01</svg>';
      
      const result = DomSanitizerService.sanitize(svg);
      
      expect(result.errors).to.include('contains-control-characters');
    });

    it('should provide size info in result', function() {
      const svg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
      
      const result = DomSanitizerService.sanitize(svg);
      
      expect(result.info).to.have.property('originalBytes');
      expect(result.info).to.have.property('sanitizedBytes');
      expect(result.info.originalBytes).to.be.greaterThan(0);
    });
  });

  describe('sanitizeWithProfile', function() {
    it('should sanitize content with html profile', function() {
      const html = '<p><b>Bold</b> and <script>evil</script></p>';
      
      const result = DomSanitizerService.sanitizeWithProfile(html, 'html');
      
      expect(result).to.include('<p>');
      expect(result).to.include('<b>');
      expect(result).not.to.include('script');
    });

    it('should throw for non-string input', function() {
      expect(() => DomSanitizerService.sanitizeWithProfile(123 as any, 'html')).to.throw('Content must be a string');
    });

    it('should use default profile when specified profile not found', function() {
      const svg = '<svg><circle cx="50" cy="50" r="40"/></svg>';
      
      // Should not throw, will fall back to default profile
      const result = DomSanitizerService.sanitizeWithProfile(svg, 'nonexistent-profile');
      
      expect(result).to.be.a('string');
    });
  });

  describe('getMaxBytes', function() {
    it('should return configured max bytes', function() {
      const maxBytes = DomSanitizerService.getMaxBytes();
      
      expect(maxBytes).to.equal(1048576);
    });

    it('should return default when not configured', function() {
      delete mockSails.config.record.form.svgMaxBytes;
      
      const maxBytes = DomSanitizerService.getMaxBytes();
      
      expect(maxBytes).to.equal(1048576); // Default 1MB
    });
  });

  describe('security scenarios', function() {
    it('should handle vbscript protocol', function() {
      const svg = '<svg><a href="vbscript:msgbox(1)"><circle/></a></svg>';
      
      const result = DomSanitizerService.sanitize(svg);
      
      expect(result.errors).to.include('vbscript-protocol');
    });

    it('should detect external references', function() {
      const svg = '<svg><image href="https://evil.com/tracker.gif"/></svg>';
      
      const result = DomSanitizerService.sanitize(svg);
      
      expect(result.errors).to.include('external-ref');
    });

    it('should handle xlink:href attributes', function() {
      const svg = '<svg><use xlink:href="javascript:alert(1)"/></svg>';
      
      const result = DomSanitizerService.sanitize(svg);
      
      expect(result.errors).to.include('javascript-protocol');
    });

    it('should handle excessive nesting to prevent billion laughs', function() {
      // Create deeply nested structure
      let nestedSvg = '<svg>';
      for (let i = 0; i < 1100; i++) {
        nestedSvg += '<g>';
      }
      for (let i = 0; i < 1100; i++) {
        nestedSvg += '</g>';
      }
      nestedSvg += '</svg>';
      
      const result = DomSanitizerService.sanitize(nestedSvg);
      
      expect(result.errors).to.include('excessive-nesting');
    });
  });
});
