let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { ConfigModels } from '../../src/configmodels/ConfigModels';

describe('ConfigModels', function() {
  class TestConfigClass {}
  
  describe('getModelInfo', function() {
    it('should return model info for known key', function() {
      const info = ConfigModels.getModelInfo('systemMessage');
      expect(info).to.have.property('modelName', 'SystemMessage');
    });

    it('should return undefined for unknown key', function() {
      const info = ConfigModels.getModelInfo('unknown');
      expect(info).to.be.undefined;
    });
  });

  describe('getConfigKeys', function() {
    it('should return array of keys', function() {
      const keys = ConfigModels.getConfigKeys();
      expect(keys).to.be.an('array');
      expect(keys).to.include('systemMessage');
      expect(keys).to.include('menu');
    });
  });

  describe('register', function() {
    it('should register new model', function() {
      ConfigModels.register('newModel', { modelName: 'NewModel', class: TestConfigClass });
      const info = ConfigModels.getModelInfo('newModel');
      expect(info).to.have.property('modelName', 'NewModel');
    });

    it('should override existing model if preventOverride is false', function() {
        const original = ConfigModels.getModelInfo('menu');
        try {
            ConfigModels.register('menu', {modelName: 'Overridden', class: TestConfigClass});
            const info = ConfigModels.getModelInfo('menu');
            expect(info).to.have.property('modelName', 'Overridden');
        } finally {
            // Restore the original model so other tests can access it.
            if (original) {
              ConfigModels.register('menu', original);
            }
        }
    });

    it('should not override if preventOverride is true', function() {
      // Revert menu override first (or assume test order)
      // Since it's static, order matters.
      // I can't easily revert static state without clearing the map, which is private.
      // But I can register a new key.
      
      ConfigModels.register('uniqueKey', { modelName: 'Original', class: TestConfigClass });
      ConfigModels.register('uniqueKey', { modelName: 'New', class: TestConfigClass }, { preventOverride: true });
      
      const info = ConfigModels.getModelInfo('uniqueKey');
      expect(info).to.have.property('modelName', 'Original');
    });
  });
});
