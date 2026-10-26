import assert from 'node:assert/strict';
import { pageInputFixture } from '../helpers/pageInputFixture';
import { preparePage } from '../../src/http/express/pages';

describe('page language options', () => {
  it('populates availableLanguages from the current brand snapshot', async () => {
    const f = await pageInputFixture();
    const page = await preparePage(f.req, f.res, f.input);
    assert.deepEqual(page.locals.availableLanguages, [
      { code: 'en', displayName: 'English' },
      { code: 'de', displayName: 'Deutsch' },
    ]);
    assert(f.languages.calledOnceWithExactly(f.brand));
  });
  it('filters disabled languages', async () => {
    const f = await pageInputFixture();
    f.languages.resolves([
      { code: 'en', displayName: 'English', enabled: true },
      { code: 'fr', displayName: 'Français', enabled: false },
    ]);
    f.req.query.lng = 'fr';
    const page = await preparePage(f.req, f.res, f.input);
    assert.deepEqual(page.locals.availableLanguages, [{ code: 'en', displayName: 'English' }]);
    assert.notEqual(page.locals.lang, 'fr');
  });
  it('filters the cimode test locale', async () => {
    const f = await pageInputFixture();
    f.languages.resolves([
      { code: 'en', displayName: 'English' },
      { code: 'cimode', displayName: 'CI Mode' },
    ]);
    const page = await preparePage(f.req, f.res, f.input);
    assert.deepEqual(page.locals.availableLanguages, [{ code: 'en', displayName: 'English' }]);
  });
  it('uses the locale as a display name when missing', async () => {
    const f = await pageInputFixture();
    f.languages.resolves([{ code: 'es' }]);
    const page = await preparePage(f.req, f.res, f.input);
    assert.deepEqual(page.locals.availableLanguages, [{ code: 'es', displayName: 'es' }]);
  });
  it('uses configured language options when no persisted bundles are available', async () => {
    const f = await pageInputFixture();
    f.languages.resolves([]);
    f.input.templateConfig.i18n = { next: { init: { supportedLngs: ['en', 'de'] } } } as any;
    const page = await preparePage(f.req, f.res, f.input);
    assert.deepEqual(
      (page.locals.availableLanguages as { code: string }[]).map(value => value.code),
      ['en', 'de']
    );
  });
  it('provides an English fallback and safe warning when language loading fails', async () => {
    const f = await pageInputFixture();
    f.languages.rejects(new Error('PRIVATE-language-store'));
    const page = await preparePage(f.req, f.res, f.input);
    assert.deepEqual(page.locals.availableLanguages, [{ code: 'en', displayName: 'English' }]);
    assert(f.log.warn.calledOnce);
    assert(!JSON.stringify(f.log.warn.firstCall.args).includes('PRIVATE'));
  });
  it('continues page preparation with resolved language and session state', async () => {
    const f = await pageInputFixture();
    const page = await preparePage(f.req, f.res, f.input);
    assert.equal(page.locals.lang, 'en');
    assert.equal(f.req.session.branding, f.brand.name);
    assert.equal(f.req.session.portal, 'portal');
  });
});
