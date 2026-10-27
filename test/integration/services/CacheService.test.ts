const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
describe('The CacheService', function () {
  before(function (done) {
    fixture.services.CacheService.set('fresh', 'data');
    done();
  });

  it('should return non-null fresh data, null on non-existent data', function (done) {
     fixture.services.CacheService.get('fresh').subscribe(function(data) {
       expect(data).to.equal('data');
       fixture.services.CacheService.get('nothere').subscribe(function(nullData) {
         expect(nullData).to.be.null;
         done();
       });
     });
  });

  it('persists best-effort creates and updates for a separate cache instance', async function () {
    const { getCacheEntryRepository } = require('@researchdatabox/redbox-core');
    const CacheModule = require('@researchdatabox/redbox-core/dist/services/CacheService');
    const { firstValueFrom } = require('rxjs');
    const repository = getCacheEntryRepository(fixture.owner);
    const name = 'p2-service-persistence';
    async function waitForData(expected: unknown) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const row = await repository.findByName(name);
        if (row && row.data === expected) return row;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('Best-effort cache write did not complete during the test');
    }
    const readers = [];
    try {
      expect(fixture.services.CacheService.set(name, 'first')).to.equal(undefined);
      await waitForData('first');
      const reader = new CacheModule.Services.Cache({ entries: () => repository, config: fixture.config, log: fixture.log });
      readers.push(reader);
      await reader.bootstrap();
      expect(await firstValueFrom(reader.get(name))).to.equal('first');
      expect(fixture.services.CacheService.set(name, false)).to.equal(undefined);
      await waitForData(false);
      const falsyReader = new CacheModule.Services.Cache({ entries: () => repository, config: fixture.config, log: fixture.log });
      readers.push(falsyReader);
      await falsyReader.bootstrap();
      expect(await firstValueFrom(falsyReader.get(name))).to.equal(false);
      fixture.services.CacheService.set(name, null, 0);
      const row = await waitForData(null);
      expect(typeof row.id).to.equal('string');
      expect(typeof row.ts_added).to.equal('number');
    } finally {
      for (const reader of readers) reader.cache?.close();
      const row = await repository.findByName(name);
      if (row) await repository.deleteById(row.id);
    }
  });

});
