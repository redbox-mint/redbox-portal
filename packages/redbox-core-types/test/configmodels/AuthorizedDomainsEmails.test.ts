let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { AuthorizedDomainsEmails } from '../../src/configmodels/AuthorizedDomainsEmails';

describe('AuthorizedDomainsEmails', function() {
  it('should have defaults', function() {
    const config = new AuthorizedDomainsEmails();
    expect(config.enabled).to.be.false;
    expect(config.domainsAaf).to.be.empty;
    expect(config.emailsAaf).to.be.empty;
  });

  it('should have getFieldOrder', function() {
    const order = AuthorizedDomainsEmails.getFieldOrder();
    expect(order).to.include('enabled');
    expect(order).to.include('domainsAaf');
  });
});
