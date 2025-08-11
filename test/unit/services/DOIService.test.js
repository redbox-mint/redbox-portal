describe('The DOI Service', function () {
  before(function (done) {
    if (
      !sails.config.datacite.username ||
      !sails.config.datacite.password ||
      !sails.config.datacite.doiPrefix ||
      process.env.SKIP_DOI_TESTS === 'true'
    ) {
      this.skip();
    } else {
      done();
    }
  });

  let createdDoi = null
  let oid = "xxxxxxxxx";
  let record = {
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

  it("Should create a DOI", function (done) {
    this.timeout(25000);
    sails.services.doiservice.publishDoi(oid, record, 'draft').then(result => {
      sails.log.debug("DOI result: ")
      sails.log.debug(result)
      expect(result).to.not.be.null;
      createdDoi = result
      done()
    }).catch(error => {
      fail("Exception thrown");
      sails.log.error(error);
      done();
    });
  });

  it("Should update a DOI", function (done) {
    this.timeout(25000);
    record.metadata.citation_doi = createdDoi
    sails.services.doiservice.publishDoi(oid, record, 'draft', 'update').then(result => {
      sails.log.debug("DOI result: ")
      sails.log.debug(result)
      expect(result).to.not.be.null;
      done()
    }).catch(error => {
      fail("Exception thrown");
      sails.log.error(error);
      done();
    });
  });


  it("Should delete a DOI", function (done) {
    this.timeout(25000);
    sails.log.debug("Deleting the created DOI: " + createdDoi)
    sails.services.doiservice.deleteDoi(createdDoi).then(result => {
      expect(result).to.eq(true)
      done()
    }).catch(error => {
      fail("Exception thrown");
      sails.log.error(error);
      done();
    });
  });

  it("Should create a draft DOI", function (done) {
    this.timeout(25000);
    sails.services.doiservice.publishDoi(oid, record, 'draft').then(result => {
      sails.log.debug("DOI result: ")
      sails.log.debug(result)
      expect(result).to.not.be.null;
      createdDoi = result
      done()
    }).catch(error => {
      fail("Exception thrown");
      sails.log.error(error);
      done();
    });
  });

  it("Should register a DOI", function (done) {
    this.timeout(25000);
    sails.log.debug("Registering the created DOI: " + createdDoi)
    sails.services.doiservice.changeDoiState(createdDoi, 'register').then(result => {
      expect(result).to.eq(true)
      done()
    }).catch(error => {
      fail("Exception thrown");
      sails.log.error(error);
      done();
    });
  });

  it("Should publish a DOI", function (done) {
    this.timeout(25000);
    sails.log.debug("Publishing the registered DOI: " + createdDoi)
    sails.services.doiservice.changeDoiState(createdDoi, 'publish').then(result => {
      expect(result).to.eq(true)
      done()
    }).catch(error => {
      fail("Exception thrown");
      sails.log.error(error);
      done();
    });
  });

  it("Should hide a DOI", function (done) {
    this.timeout(25000);
    sails.log.debug("Hiding the published DOI: " + createdDoi)
    sails.services.doiservice.changeDoiState(createdDoi, 'hide').then(result => {
      expect(result).to.eq(true)
      done()
    }).catch(error => {
      fail("Exception thrown");
      sails.log.error(error);
      done();
    });
  });

});
