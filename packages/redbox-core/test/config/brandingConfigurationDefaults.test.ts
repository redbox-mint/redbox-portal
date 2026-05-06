let expect: Chai.ExpectStatic;
import { brandingConfigurationDefaults } from '../../src/config/brandingConfigurationDefaults.config';
import { evaluateBinding } from '../../src/services/doi-v2/bindings';

describe('brandingConfigurationDefaults', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  it('exposes a canonical doiPublishing default for runtime use', async function () {
    const doiPublishing = brandingConfigurationDefaults.doiPublishing;

    expect(doiPublishing).to.exist;
    expect(doiPublishing?.enabled).to.equal(true);
    expect(doiPublishing?.defaultProfile).to.equal('dataPublication');
    expect(doiPublishing?.connection.baseUrl).to.equal('https://api.test.datacite.org');
    expect(doiPublishing?.profiles.dataPublication).to.exist;

    const profile = doiPublishing!.profiles.dataPublication;
    const context = {
      record: {
        metadata: {
          creators: [
            { family_name: 'Smith', given_name: 'Jane' },
            { family_name: 'Doe', given_name: 'John' }
          ],
          citation_publication_date: '2024-05-01',
          citation_title: 'Test Title',
          citation_publisher: 'Test Publisher',
          citation_doi: null
        }
      },
      oid: 'oid-1',
      profile,
      now: '2026-04-14T00:00:00.000Z',
      helpers: {
        mapSubjectEntries: () => []
      }
    };

    expect(await evaluateBinding(profile.metadata.url, context as never)).to.equal('https://redboxresearchdata.com.au/published/oid-1');
    expect(await evaluateBinding(profile.metadata.publicationYear, context as never)).to.equal('2024');
    expect(await evaluateBinding(profile.writeBack.citationString, context as never)).to.equal('Smith, Jane; Doe, John (2024): Test Title. Test Publisher. {ID_WILL_BE_HERE}');
  });
});
