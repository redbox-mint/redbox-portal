import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import ejs from 'ejs';
import lodash from 'lodash';

describe('page client configuration bootstrap', function () {
    let expect: Chai.ExpectStatic;
    before(async () => { expect = (await import('chai')).expect; });

    const filename = path.resolve(__dirname, '../../../../views/default/default/layout/client-config.ejs');
    function render(language = 'en', additionalClientConfig = {}) {
        const config = {
            appUrl: '', vocab: {}, mint: {}, startupMinute: 'version',
            record: { transfer: { maxRecordsPerPage: 10 }, search: { maxRecordsPerPage: 10 } },
            i18n: { next: { init: { fallbackLng: 'en', backend: { loadPath: '/server-only' } } }, editor: {} },
            api: { additionalClientConfig }
        };
        const html = ejs.render(fs.readFileSync(filename, 'utf8'), {
            sails: { config }, _: lodash, req: { session: { branding: 'custom', portal: 'records' } }, lang: language,
            BrandingService: { getRootContext: () => '/portal' }
        }, { filename });
        return { page: new JSDOM(html).window.document, config };
    }

    it('round-trips hostile characters as inert attribute text without changing server translation options', () => {
        const title = '"><script>alert(1)</script>&\'quote';
        const { page, config } = render('en', { app: { title } });
        const data = JSON.parse(page.querySelector('meta')!.content);
        expect(data.app.title).to.equal(title);
        expect(data.branding).to.equal('custom');
        expect(data.portal).to.equal('records');
        expect(data.i18NextOpts.backend).to.equal(undefined);
        expect(page.querySelector('script')).to.equal(null);
        expect(config.i18n.next.init.backend.loadPath).to.equal('/server-only');
    });

    it('preloads the exact same-origin translation fetch once for English', () => {
        const { page } = render();
        const links = [...page.querySelectorAll('link')];
        expect(links.map(link => link.getAttribute('href'))).to.deep.equal(['/portal/custom/records/locales/en/translation.json']);
        expect(links[0].getAttribute('as')).to.equal('fetch');
        expect(links[0].getAttribute('crossorigin')).to.equal('anonymous');
    });

    it('does not speculate when a hook configures a custom translation backend', () => {
        const { page } = render('en', { i18NextOpts: { backend: { loadPath: '/custom/{{lng}}' } } });
        expect(page.querySelector('link')).to.equal(null);
    });
});
