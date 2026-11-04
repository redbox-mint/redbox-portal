import HttpApi from 'i18next-http-backend';
import { createInstance } from 'i18next';
import { handlebarsInstance, handlebarsPrecompile, handlebarsTemplate } from '@researchdatabox/sails-ng-common';

describe('Shared browser dependency security', () => {
  it('precompiles hostile script text without creating an inline script boundary', () => {
    const input = 'safe</script><script>window.injected=true</script><script>';
    const source = String(handlebarsPrecompile(input));
    expect(source).not.toMatch(/<\/script/i);
    const specification = new Function(`return (${source})`)();
    expect(handlebarsTemplate(specification)({})).toBe(input);
  });

  it('rejects forged AST block parameters before compiling browser code', () => {
    const handlebars = handlebarsInstance();
    const ast = handlebars.parse('{{#if ok}}yes{{/if}}');
    Object.defineProperty(Reflect.get(ast.body[0], 'program'), 'blockParams', {
      value: { length: '(window.__redboxDependencyInjected = true)' }
    });
    expect(() => handlebars.precompile(ast)).toThrow();
    expect(() => handlebars.compile(ast)({ ok: true })).toThrow();
    expect(Reflect.get(window, '__redboxDependencyInjected')).toBeUndefined();
  });

  it('loads translations using the portal path and rejects namespace URL injection', async () => {
    const urls: string[] = [];
    const backend = new HttpApi(undefined, {
      loadPath: '/default/rdmp/locales/{{lng}}/{{ns}}.json',
      request: (_options, url, _payload, callback) => {
        urls.push(String(url));
        callback(null, { status: 200, data: '{"title":"Record"}' });
      }
    });
    const i18n = createInstance();
    await i18n.use(backend).init({ lng: 'en', fallbackLng: false, ns: ['translation'] });
    expect(i18n.t('title')).toBe('Record');
    expect(urls).toEqual(['/default/rdmp/locales/en/translation.json']);
    const error = await new Promise(resolve => backend.read('en', '//attacker.example/catalog', resolve));
    expect(error).toBeTruthy();
    expect(urls.length).toBe(1);
  });

  it('rejects injected language query parameters while loading ordinary locales', async () => {
    const urls: string[] = [];
    const backend = new HttpApi(undefined, {
      loadPath: '/locales?lng={{lng}}&ns={{ns}}',
      request: (_options, url, _payload, callback) => {
        urls.push(String(url));
        callback(null, { status: 200, data: '{}' });
      }
    });
    await createInstance().use(backend).init({ lng: 'en', fallbackLng: false, ns: ['translation'] });
    const error = await new Promise(resolve => backend.read('en&admin=true', 'translation', resolve));
    expect(error).toBeTruthy();
    expect(urls.length).toBe(1);
    const url = new URL(urls[0], 'https://portal.example');
    expect(url.searchParams.get('lng')).toBe('en');
    expect(url.searchParams.has('admin')).toBeFalse();
  });
});
