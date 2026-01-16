import { expect } from 'chai';
import { Services } from '../../src/services/FormRecordConsistencyService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

describe('FormRecordConsistencyService', function() {
  let service: Services.FormRecordConsistency;

  beforeEach(function() {
    setupServiceTestGlobals();
    service = new Services.FormRecordConsistency();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
  });

  describe('compareRecords', function() {
    it('should detect changes', function() {
      const original = { a: 1 };
      const changed = { a: 2 };
      const changes = service.compareRecords(original, changed);
      
      expect(changes).to.have.length(1);
      expect(changes[0]).to.deep.include({
        kind: 'change',
        path: ['a'],
        original: 1,
        changed: 2
      });
    });

    it('should detect additions', function() {
      const original = { a: 1 };
      const changed = { a: 1, b: 2 };
      const changes = service.compareRecords(original, changed);
      
      expect(changes).to.have.length(1);
      expect(changes[0]).to.deep.include({
        kind: 'add',
        path: ['b'],
        changed: 2
      });
    });

    it('should detect deletions', function() {
      const original = { a: 1, b: 2 };
      const changed = { a: 1 };
      const changes = service.compareRecords(original, changed);
      
      expect(changes).to.have.length(1);
      expect(changes[0]).to.deep.include({
        kind: 'delete',
        path: ['b'],
        original: 2
      });
    });
  });
});
