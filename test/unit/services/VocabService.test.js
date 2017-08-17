describe('The VocabService', function () {
  before(function (done) {
    done();
  });

  it('should return vocabs', function (done) {
    VocabService.getVocab('anzsrc-for').subscribe(function(data) {
      expect(data).to.have.lengthOf.at.least(2);
      done();
    });
  });

});
