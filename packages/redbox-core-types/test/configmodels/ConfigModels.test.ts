import { expect } from 'chai';
import { ConfigModels } from '../../src/configmodels/ConfigModels';

describe('ConfigModels', function() {
  
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
      ConfigModels.register('newModel', { modelName: 'NewModel', class: {} });
      const info = ConfigModels.getModelInfo('newModel');
      expect(info).to.have.property('modelName', 'NewModel');
    });

    it('should override existing model if preventOverride is false', function() {
      ConfigModels.register('menu', { modelName: 'Overridden', class: {} });
      const info = ConfigModels.getModelInfo('menu');
      expect(info).to.have.property('modelName', 'Overridden');
    });

    it('should not override if preventOverride is true', function() {
      // Revert menu override first (or assume test order)
      // Since it's static, order matters.
      // I can't easily revert static state without clearing the map, which is private.
      // But I can register a new key.
      
      ConfigModels.register('uniqueKey', { modelName: 'Original', class: {} });
      ConfigModels.register('uniqueKey', { modelName: 'New', class: {} }, { preventOverride: true });
      
      const info = ConfigModels.getModelInfo('uniqueKey');
      expect(info).to.have.property('modelName', 'Original');
    });
  });
});
