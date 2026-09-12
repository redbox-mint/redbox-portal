import { expect, test } from '../fixtures/test';

test('CSRF mutation protection rejects a missing token and accepts a real token', async ({
  adminPage,
  records,
}) => {
  const request = adminPage.context().request;
  const endpoint = '/default/rdmp/api/records/metadata/e2e-initialisation-modes';
  const withoutToken = await request.post(endpoint, { data: { title: 'CSRF rejection' } });
  expect(withoutToken.status(), 'a protected mutation without CSRF must be rejected').toBe(403);

  const record = await records.create('e2e-initialisation-modes', { title: 'CSRF accepted', translated: 'Authenticated mutation' });
  expect((await records.read(record.oid)).body).toMatchObject({ title: 'CSRF accepted' });
});
