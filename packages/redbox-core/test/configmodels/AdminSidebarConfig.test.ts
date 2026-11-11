let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { AdminSidebarConfig, DEFAULT_ADMIN_SIDEBAR_CONFIG, ADMIN_SIDEBAR_CONFIG_SCHEMA } from '../../src/configmodels/AdminSidebarConfig';

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
});
