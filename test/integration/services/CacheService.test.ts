describe('The CacheService', function () {
  before(function (done) {
    CacheService.set('fresh', 'data');
    done();
  });

  it('should return non-null fresh data, null on non-existent data', function (done) {
     CacheService.get('fresh').subscribe(function(data) {
       expect(data).to.equal('data');
       CacheService.get('nothere').subscribe(function(nullData) {
         expect(nullData).to.be.null;
         done();
       });
     });
  });

});
