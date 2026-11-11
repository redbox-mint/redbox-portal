let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { AdminSidebarConfig, DEFAULT_ADMIN_SIDEBAR_CONFIG, ADMIN_SIDEBAR_CONFIG_SCHEMA } from '../../src/configmodels/AdminSidebarConfig';
import { brandingConfigurationDefaults } from '../../src/config/brandingConfigurationDefaults.config';

describe('AdminSidebarConfig', function() {
  it('should have default empty sections', function() {
    const config = new AdminSidebarConfig();
    expect(config.sections).to.be.an('array').that.is.empty;
  });

  it('should have getFieldOrder', function() {
    const order = AdminSidebarConfig.getFieldOrder();
    expect(order).to.deep.equal(['header', 'sections', 'footerLinks']);
  });

  it('should have default config export', function() {
    expect(DEFAULT_ADMIN_SIDEBAR_CONFIG.sections).to.be.an('array');
    expect(DEFAULT_ADMIN_SIDEBAR_CONFIG.sections.length).to.be.greaterThan(0);
  });

  it('accepts the six-section defaults through the editor schema and JSON storage round trip', function() {
    const Ajv = require('ajv');
    const validate = new Ajv({ strict: false }).compile(ADMIN_SIDEBAR_CONFIG_SCHEMA);
    const saved = JSON.parse(JSON.stringify(DEFAULT_ADMIN_SIDEBAR_CONFIG));
    expect(validate(saved), JSON.stringify(validate.errors)).to.equal(true);
    expect(saved.sections).to.have.lengthOf(6);
    expect(saved.sections.flatMap((section: any) => section.items).map((item: any) => item.href))
      .to.include('/admin/appconfig/edit/raidPublishing');
  });

  it('should export schema', function() {
    expect(ADMIN_SIDEBAR_CONFIG_SCHEMA).to.have.property('type', 'object');
  });

  it('should expose SIEM in the effective branding sidebar after the sidebar editor', function() {
    const navigation = brandingConfigurationDefaults.adminSidebar.sections.find(section => section.id === 'navigation');
    const sidebarEditorIndex = navigation.items.findIndex(item => item.id === 'adminsidebar');
    const contractSiem = DEFAULT_ADMIN_SIDEBAR_CONFIG.sections
      .flatMap(section => section.items)
      .find(item => item.id === 'siem');

    expect(navigation.requiredRoles).to.deep.equal(['Admin']);
    expect(sidebarEditorIndex).to.be.at.least(0);
    expect(navigation.items[sidebarEditorIndex + 1]).to.deep.equal(contractSiem);
    expect(contractSiem).to.deep.equal({ id: 'siem', labelKey: 'menu-siemconfiguration', href: '/admin/siem' });
    expect(navigation.items.filter(item => item.id === 'siem')).to.have.length(1);
  });
});
