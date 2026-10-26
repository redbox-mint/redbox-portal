import assert from 'node:assert/strict';
import { httpPagesFixture } from '../helpers/httpPagesFixture';

describe('Declared page titles through actual EJS rendering', () => {
  let f: Awaited<ReturnType<typeof httpPagesFixture>>;
  beforeEach(async () => {
    f = await httpPagesFixture(input => {
      input.translate = (_brand, _language, key) =>
        ({ 'default-title': 'Site', 'welcome-title': 'Welcome' })[key] ?? key;
    });
  });
  afterEach(async () => {
    await f.close();
  });
  it('formats a translated declared title', async () => {
    const response = await f.request('/default/portal/home');
    assert.equal(response.status, 200);
    assert.equal(response.text.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim(), 'Welcome | Site');
  });
  it('supports a literal declared title', async () => {
    const response = await f.request('/default/portal/getAdvice');
    assert.equal(response.status, 200);
    assert.equal(response.text.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim(), 'Get advice | Site');
  });
});
