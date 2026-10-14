let expect: Chai.ExpectStatic;
import { brandingConfigurationDefaults } from '../../src/config/brandingConfigurationDefaults.config';

describe('brandingConfigurationDefaults', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  it('keeps the core menu to home and admin only', function () {
    expect(brandingConfigurationDefaults.menu?.items.map(item => item.id)).to.deep.equal([
      'home-auth',
      'admin',
      'home-anon',
    ]);
  });

  it('does not provide core home panels', function () {
    expect(brandingConfigurationDefaults.homePanels).to.deep.equal({ panels: [] });
  });

  it('exposes a canonical doiPublishing default for runtime use', async function () {
    const doiPublishing = brandingConfigurationDefaults.doiPublishing;

    expect(doiPublishing).to.exist;
    expect(doiPublishing?.enabled).to.equal(true);
    expect(doiPublishing?.defaultProfile).to.equal('');
    expect(doiPublishing?.connection.baseUrl).to.equal('https://api.test.datacite.org');
    expect(doiPublishing?.profiles).to.deep.equal({});
  });

  it('exposes a canonical oniPublishing default for runtime use', function () {
    const oniPublishing = brandingConfigurationDefaults.oniPublishing;

    expect(oniPublishing).to.exist;
    expect(oniPublishing?.enabled).to.equal(true);
    expect(oniPublishing?.defaultSite).to.equal('public');
    expect(oniPublishing?.sites.public.storage.driver).to.equal('flydrive');
    expect(oniPublishing?.writeBack.citationUrlPath).to.equal('metadata.citation_url');
  });
});
