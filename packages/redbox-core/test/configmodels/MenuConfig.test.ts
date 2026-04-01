let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { MenuConfig, DEFAULT_MENU_CONFIG, MENU_CONFIG_SCHEMA } from '../../src/configmodels/MenuConfig';

describe('MenuConfig', function() {
  it('should have default showSearch=true', function() {
    const config = new MenuConfig();
    expect(config.showSearch).to.be.true;
  });

  it('should have getFieldOrder', function() {
    const order = MenuConfig.getFieldOrder();
    expect(order).to.deep.equal(['showSearch', 'items']);
  });

  it('should have default config export', function() {
    expect(DEFAULT_MENU_CONFIG.items).to.be.an('array');
    expect(DEFAULT_MENU_CONFIG.items.length).to.be.greaterThan(0);
  });

  it('should export schema', function() {
    expect(MENU_CONFIG_SCHEMA).to.have.property('type', 'object');
  });
});
