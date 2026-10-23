import assert from 'node:assert/strict';
import { getReferenceRepositories } from '@researchdatabox/redbox-core';
describe('reference persistence', () => {
  it('reads bootstrapped forms through Prisma', async () => {
    const forms = getReferenceRepositories().forms;
    const brand = BrandingService.getDefault();
    const existing = (await forms.list(brand.id))[0];
    assert(existing);
    assert.equal((await forms.findByName(existing.name, brand.id))?.id, existing.id);
  });
});
