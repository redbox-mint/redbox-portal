import assert from 'node:assert/strict';
import { pageInputFixture } from '../helpers/pageInputFixture';
import { preparePage } from '../../src/http/express/pages';

describe('explicit page translation context', () => {
  it('selects the session language and binds translations to the current brand', async () => {
    const f = await pageInputFixture();
    f.req.session.langCode = 'de';
    const page = await preparePage(f.req, f.res, f.input);
    assert.equal(page.locals.lang, 'de');
    assert.equal(page.t('title'), 'title');
    assert(f.translate.calledWithExactly(f.brand.name, 'de', 'title', undefined));
  });
  it('waits for asynchronous language loading before preparing translated locals', async () => {
    const f = await pageInputFixture();
    const loaded = Promise.withResolvers<{ code: string; displayName: string }[]>();
    f.languages.returns(loaded.promise);
    let completed = false;
    const work = preparePage(f.req, f.res, f.input).then(value => {
      completed = true;
      return value;
    });
    await Promise.resolve();
    assert(!completed);
    loaded.resolve([{ code: 'de', displayName: 'Deutsch' }]);
    const page = await work;
    assert(completed);
    assert.equal(page.locals.lang, 'de');
  });
});
