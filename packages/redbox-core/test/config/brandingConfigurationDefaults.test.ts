let expect: Chai.ExpectStatic;
import { brandingConfigurationDefaults } from '../../src/config/brandingConfigurationDefaults.config';

describe('brandingConfigurationDefaults', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  it('exposes a canonical doiPublishing default for runtime use', async function () {
    const doiPublishing = brandingConfigurationDefaults.doiPublishing;

    expect(doiPublishing).to.exist;
    expect(doiPublishing?.enabled).to.equal(true);
    expect(doiPublishing?.defaultProfile).to.equal('');
    expect(doiPublishing?.connection.baseUrl).to.equal('https://api.test.datacite.org');
    expect(doiPublishing?.profiles).to.deep.equal({});
  });
});
