import sinon from 'sinon';
import * as runtime from '../../src/persistence/cache/runtime';
import type { CacheEntryRepository } from '../../src/persistence/cache/CacheEntryRepository';

/** Service tests replace the ReDBox seam, never a Waterline query builder. */
export function stubCacheEntryRepository() {
  const repository = {
    findByName: sinon.stub().resolves(null),
    create: sinon.stub().resolves(),
    updateByName: sinon.stub().resolves(),
    deleteById: sinon.stub().resolves(),
  } satisfies CacheEntryRepository;
  sinon.stub(runtime, 'getCacheEntryRepository').returns(repository);
  return repository;
}
