let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { WebAnalytics, WEB_ANALYTICS_SCHEMA } from '../../src/configmodels/WebAnalytics';

describe('WebAnalytics', function() {
  it('should have defaults', function() {
    const config = new WebAnalytics();
    expect(config.enabled).to.be.false;
    expect(config.provider).to.equal('googleAnalytics');
    expect(config.trackingId).to.equal('');
  });

  it('should have getFieldOrder', function() {
    const order = WebAnalytics.getFieldOrder();
    expect(order).to.deep.equal(["enabled", "provider", "trackingId"]);
  });

  it('should expose a schema with the supported providers', function() {
    expect(WEB_ANALYTICS_SCHEMA).to.have.nested.property('properties.provider.enum');
    expect(WEB_ANALYTICS_SCHEMA.properties.provider.enum).to.deep.equal(['googleAnalytics', 'googleTagManager']);
    expect(WEB_ANALYTICS_SCHEMA.required).to.include('enabled');
    expect(WEB_ANALYTICS_SCHEMA.required).to.include('provider');
  });
});
