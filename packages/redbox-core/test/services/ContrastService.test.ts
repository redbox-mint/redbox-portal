let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { Services } from '../../src/services/ContrastService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

describe('ContrastService', function() {
  let service: Services.Contrast;

  beforeEach(function() {
    setupServiceTestGlobals();
    service = new Services.Contrast();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
  });

  describe('getLuminance', function() {
    it('should calculate luminance for black', function() {
      expect(service.getLuminance('#000000')).to.equal(0);
    });

    it('should calculate luminance for white', function() {
      expect(service.getLuminance('#ffffff')).to.equal(1);
    });

    it('should calculate luminance for a color', function() {
      // Red #ff0000
      // 0.2126 * 1 + 0 + 0 = 0.2126
      expect(service.getLuminance('#ff0000')).to.be.closeTo(0.2126, 0.0001);
    });
  });

  describe('calculateRatio', function() {
    it('should calculate ratio for black and white', function() {
      expect(service.calculateRatio('#000000', '#ffffff')).to.equal(21);
    });

    it('should calculate ratio for same colors', function() {
      expect(service.calculateRatio('#ffffff', '#ffffff')).to.equal(1);
    });
  });

  describe('validate', function() {
    it('should return valid if all pairs pass', function() {
      const vars = {
        'primary-text-color': '#000000',
        'primary-color': '#ffffff',
        'secondary-text-color': '#000000',
        'secondary-color': '#ffffff',
        'accent-text-color': '#000000',
        'accent-color': '#ffffff',
        'body-text-color': '#000000',
        'surface-color': '#ffffff',
        'heading-text-color': '#000000'
      };
      const result = service.validate(vars);
      expect(result.valid).to.be.true;
      expect(result.violations).to.be.empty;
    });

    it('should return violations if pairs fail', function() {
      const vars = {
        'primary-text-color': '#777777', // Low contrast on white
        'primary-color': '#ffffff'
      };
      const result = service.validate(vars);
      expect(result.valid).to.be.false;
      expect(result.violations).to.have.length.greaterThan(0);
      expect(result.violations[0].pair).to.equal('primary-text-on-primary-bg');
    });
  });

  describe('suggestCompliant', function() {
    it('should return original if compliant', function() {
      const result = service.suggestCompliant('#000000', '#ffffff');
      expect(result.suggested).to.equal('#000000');
      expect(result.adjustments).to.equal(0);
    });

    it('should suggest darker color for light background', function() {
      const result = service.suggestCompliant('#cccccc', '#ffffff'); // Light grey on white
      expect(result.suggested).to.not.equal('#cccccc');
      const ratio = service.calculateRatio(result.suggested, '#ffffff');
      expect(ratio).to.be.at.least(4.5);
    });

    it('should suggest lighter color for dark background', function() {
      const result = service.suggestCompliant('#333333', '#000000'); // Dark grey on black
      expect(result.suggested).to.not.equal('#333333');
      const ratio = service.calculateRatio(result.suggested, '#000000');
      expect(ratio).to.be.at.least(4.5);
    });
  });
});
