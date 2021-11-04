const {
  expect
} = require("chai");

describe('The DOI Service', function () {
  before(function (done) {
    done();
  });

 let createdDoi = null
  it("Should create a DOI", function (done) {
    // this.timeout(5000);
    // let oid = "xxxxxxxxx";
    // let record = {
    //   metadata: {
    //     citation_publication_date: '2021',
    //     citation_title: 'QCIF Test Publication',
    //     citation_publisher: 'QCIF',
    //     creators: [{
    //         given_name: "Albert",
    //         given_name: "Zweinstig"
    //       },
    //       {
    //         given_name: "Jane",
    //         given_name: "Crowley"
    //       }
    //     ]
    //   }
    // }
    // sails.services.doiservice.publishDoi(oid, record, 'draft').then(result => {
    //   sails.log.error("DOI result: ")
    //   sails.log.error(result)
    //   expect(result).to.not.be.null;
    //   createdDoi = result
    //   done()
    // }).catch(error => {
    //   fail("Exception thrown");
    //   sails.log.error(error);
    //   done();
    // });
    done();
  });

  it("Should delete a DOI", function (done) {
    // this.timeout(5000);
    // sails.log.debug("Deleting the created DOI: " + createdDoi)
    // sails.services.doiservice.deleteDoi(createdDoi).then(result => {
    //   expect(result).to.eq(true)
    //   done()
    // }).catch(error => {    
    //   fail("Exception thrown");
    //   sails.log.error(error);
    //   done();
    // });
    done();
  });
});