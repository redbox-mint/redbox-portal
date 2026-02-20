let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { HomePanelConfig, DEFAULT_HOME_PANEL_CONFIG, HOME_PANEL_CONFIG_SCHEMA } from '../../src/configmodels/HomePanelConfig';

describe('HomePanelConfig', function() {
  it('should have default empty panels', function() {
    const config = new HomePanelConfig();
    expect(config.panels).to.be.an('array').that.is.empty;
  });

  it('should have getFieldOrder', function() {
    const order = HomePanelConfig.getFieldOrder();
    expect(order).to.deep.equal(['panels']);
  });

  it('should have default config export', function() {
    expect(DEFAULT_HOME_PANEL_CONFIG.panels).to.be.an('array');
    expect(DEFAULT_HOME_PANEL_CONFIG.panels.length).to.be.greaterThan(0);
  });

  it('should export schema', function() {
    expect(HOME_PANEL_CONFIG_SCHEMA).to.have.property('type', 'object');
  });
});
