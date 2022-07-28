const {
  expect
} = require("chai");

describe('The Solr Indexing Service', function () {
  before(function (done) {
    done()
  })

 let createdIndex = null
  it("Should start Indexing", function (done) {
    this.timeout(5000)
    let oid = "xxxxxxxxx"
    let record = {}
    SolrSearchService.index(oid,record)
    SolrSearchService.searchAdvanced('test').then(result => {
      sails.log.debug("Index result: ")
      sails.log.debug(result)
      expect(result).to.not.be.null &&
      expect(result).to.have.property('responseHeader')
        .and.to.have.property('status')
          .and.equal(0) &&
      expect(result).to.have.property('response')
        .and.to.have.property('numFound')
          .and.equal(0)
      createdIndex = result
      done()
    }).catch(error => {
      fail("Exception thrown");
      sails.log.error(error);
      done()
    })
  })
})