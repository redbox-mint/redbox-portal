let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { RBValidationError } from '../../src/model/RBValidationError';

describe('RBValidationError', function() {
  describe('constructor', function() {
    it('should create instance with defaults', function() {
      const err = new RBValidationError();
      expect(err).to.be.instanceOf(Error);
      expect(err.name).to.equal('RBValidationError');
      expect(err.displayErrors).to.be.empty;
    });

    it('should store displayErrors', function() {
      const displayErrors = [{ title: 'Error' }];
      const err = new RBValidationError({ displayErrors });
      expect(err.displayErrors).to.deep.equal(displayErrors);
    });
  });

  describe('isRBValidationError', function() {
    it('should return true for RBValidationError instance', function() {
      const err = new RBValidationError();
      expect(RBValidationError.isRBValidationError(err)).to.be.true;
    });

    it('should return true for Error with correct name', function() {
      const err = new Error('Test');
      err.name = 'RBValidationError';
      expect(RBValidationError.isRBValidationError(err)).to.be.true;
    });

    it('should return false for standard Error', function() {
      const err = new Error('Test');
      expect(RBValidationError.isRBValidationError(err)).to.be.false;
    });
  });

  describe('collectErrors', function() {
    it('should collect recursive errors', function() {
      const cause = new Error('Cause');
      const err = new Error('Main');
      (err as any).cause = cause;
      
      const result = RBValidationError.collectErrors([err], []);
      
      expect(result.errors).to.have.length(2);
      expect(result.errors[0]).to.equal(err);
      expect(result.errors[1]).to.equal(cause);
    });

    it('should collect display errors', function() {
      const rbErr = new RBValidationError({
        displayErrors: [{ title: 'RB Error' }]
      });
      
      const result = RBValidationError.collectErrors([rbErr], [{ title: 'Initial' }]);
      
      expect(result.displayErrors).to.have.length(2);
      expect(result.displayErrors[0].title).to.equal('Initial');
      expect(result.displayErrors[1].title).to.equal('RB Error');
    });
  });

  describe('displayMessage', function() {
    it('should format display message', function() {
      const tStub = { t: (key: string) => key };
      const displayErrors = [{ title: 'Error Title', detail: 'Error Detail' }];
      
      const result = RBValidationError.displayMessage({
        t: tStub as any,
        displayErrors
      });
      
      expect(result).to.equal('Error Title: Error Detail.');
    });

    it('should return empty string if no errors and empty default logic', function() {
      const tStub = { t: (key: string) => key };
      
      const result = RBValidationError.displayMessage({
        t: tStub as any,
        defaultMessage: 'Default'
      });
      
      // Based on implementation, it returns empty string because collectErrors returns []
      expect(result).to.equal('');
    });

    it('should throw if t not provided', function() {
      expect(() => RBValidationError.displayMessage({})).to.throw('Must provide TranslationService');
    });
  });
});
