const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
describe('The DOI Service', function () {
  this.timeout(120000);
  let brand: any;

  before(function () {
    brand = fixture.services.BrandingService.getDefault();
    const doiPublishing = fixture.config.brandingConfigurationDefaults?.doiPublishing;
    const defaultProfile = doiPublishing?.defaultProfile ?? '';
    const profile = defaultProfile !== '' ? doiPublishing?.profiles?.[defaultProfile] : undefined;
    const prefix = profile?.metadata?.prefix?.defaultValue;

    if (
      doiPublishing?.enabled !== true ||
      !doiPublishing?.connection?.username ||
      !doiPublishing?.connection?.password ||
      !prefix ||
      process.env.SKIP_DOI_TESTS === 'true'
    ) {
      this.skip();
    }
  });

  let createdDoi = null
  let oid = "xxxxxxxxx";
  let record: any = {
    metaMetadata: {
      brandId: undefined,
    },
    metadata: {
      citation_publication_date: '2021',
      citation_title: 'New Test Publication',
      citation_publisher: 'Research Labs GMBH',
      creators: [{
        given_name: "Test",
        family_name: "Researcher"
      },
      {
        given_name: "Test",
        family_name: "Student"
      }
      ]
    }
  }

  beforeEach(function () {
    record.metaMetadata.brandId = brand.id;
  });

  it("Should create a DOI", async function () {
    const result = await fixture.services.DOIService.publishDoi(oid, record, 'draft');
    fixture.log.debug("DOI result: ");
    fixture.log.debug(result);
    expect(result).to.not.be.null;
    createdDoi = result;
  });

  it("Should update a DOI", async function () {
    record.metadata.citation_doi = createdDoi;
    const result = await fixture.services.DOIService.publishDoi(oid, record, 'draft', 'update');
    fixture.log.debug("DOI result: ");
    fixture.log.debug(result);
    expect(result).to.not.be.null;
  });


  it("Should delete a DOI", async function () {
    fixture.log.debug("Deleting the created DOI: " + createdDoi);
    const result = await fixture.services.DOIService.deleteDoi(brand, createdDoi);
    expect(result).to.eq(true);
  });

  it("Should create a draft DOI", async function () {
    const result = await fixture.services.DOIService.publishDoi(oid, record, 'draft');
    fixture.log.debug("DOI result: ");
    fixture.log.debug(result);
    expect(result).to.not.be.null;
    createdDoi = result;
  });

  it("Should register a DOI", async function () {
    fixture.log.debug("Registering the created DOI: " + createdDoi);
    const result = await fixture.services.DOIService.changeDoiState(brand, createdDoi, 'register', oid);
    expect(result).to.eq(true);
  });

  it("Should publish a DOI", async function () {
    fixture.log.debug("Publishing the registered DOI: " + createdDoi);
    const result = await fixture.services.DOIService.changeDoiState(brand, createdDoi, 'publish');
    expect(result).to.eq(true);
  });

  it("Should hide a DOI", async function () {
    fixture.log.debug("Hiding the published DOI: " + createdDoi);
    const result = await fixture.services.DOIService.changeDoiState(brand, createdDoi, 'hide');
    expect(result).to.eq(true);
  });

});
