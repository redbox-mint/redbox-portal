import assert from 'node:assert/strict';
import { pageCsp, type CspConfig } from '../../src/pages/csp';

const base = { pathname: '/test', appUrl: 'https://portal.example.edu', environment: 'development' };
function csp(configuration?: CspConfig, extra: Partial<Parameters<typeof pageCsp>[0]> = {}) {
  return pageCsp({ ...base, configuration, ...extra });
}
describe('explicit page Content Security Policy', () => {
  it('emits Content-Security-Policy by default', () => assert.equal(csp()!.headerName, 'Content-Security-Policy'));
  it('generates a cryptographic nonce in script-src', () => {
    assert.match(csp()!.headerValue, /script-src 'nonce-[A-Za-z0-9+/=]+'/);
  });
  it('returns the same nonce for the renderer and header', () => {
    const result = csp()!;
    assert(result.nonce.length > 0);
    assert(result.headerValue.includes(`'nonce-${result.nonce}'`));
  });
  it('emits no policy when explicitly disabled', () => assert.equal(csp({ enabled: false }), undefined));
  it('supports report-only without an enforced header', () => {
    assert.equal(csp({ reportOnly: true })!.headerName, 'Content-Security-Policy-Report-Only');
  });
  it('merges custom directive keys', () => {
    const result = csp({ directives: { 'img-src': ["'self'", 'https://images.example.com'] } })!;
    assert(result.headerValue.includes("img-src 'self' https://images.example.com"));
    assert(result.headerValue.includes("default-src 'self'"));
  });
  it('includes explicit extra directives', () => {
    assert(csp({ extras: ['block-all-mixed-content'] })!.headerValue.includes('block-all-mixed-content'));
  });
  it('omits upgrade-insecure-requests for a development HTTP appUrl', () => {
    assert(
      !csp(undefined, { appUrl: 'http://redbox-portal.local:1500' })!.headerValue.includes('upgrade-insecure-requests')
    );
  });
  it('retains upgrade-insecure-requests for an HTTPS appUrl', () => {
    assert(csp()!.headerValue.includes('upgrade-insecure-requests'));
  });
  it('retains upgrade-insecure-requests for a malformed appUrl', () => {
    assert(csp(undefined, { appUrl: 'not a valid URL' })!.headerValue.includes('upgrade-insecure-requests'));
  });
  it('retains upgrade-insecure-requests for HTTP in production', () => {
    assert(
      csp(undefined, { appUrl: 'http://portal.example.edu', environment: 'production' })!.headerValue.includes(
        'upgrade-insecure-requests'
      )
    );
  });
  it('retains restrictive default directives', () => {
    const value = csp()!.headerValue;
    for (const expected of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'"])
      assert(value.includes(expected));
  });
  it('includes a nonce in style-src', () => assert.match(csp()!.headerValue, /style-src 'nonce-/));
  it('accepts the selected explicit CSP configuration independently of its former config location', () => {
    const selected = { reportOnly: true };
    assert.equal(csp(selected)!.headerName, 'Content-Security-Policy-Report-Only');
  });
  it('does not depend on mutable request options and returns a fresh nonce per call', () => {
    assert.notEqual(csp()!.nonce, csp()!.nonce);
  });
  it('includes upgrade-insecure-requests by default', () =>
    assert(csp()!.headerValue.includes('upgrade-insecure-requests')));
  it('relaxes Redoc styles, image and worker directives without nonces', () => {
    const value = csp(undefined, { pathname: '/default/rdmp/admin/api-docs' })!.headerValue;
    for (const expected of ['style-src', "'unsafe-inline'", 'worker-src', 'blob:', 'img-src', 'https://cdn.redoc.ly'])
      assert(value.includes(expected));
    assert(!value.includes('nonce-'));
  });
  it('ends the header with a semicolon', () => assert(csp()!.headerValue.endsWith(';')));
  it('emits no empty policy when all configured directives and extras are empty', () => {
    const directives = Object.fromEntries(
      [
        'default-src',
        'script-src',
        'worker-src',
        'object-src',
        'manifest-src',
        'style-src',
        'font-src',
        'frame-ancestors',
        'form-action',
        'base-uri',
      ].map(key => [key, []])
    );
    assert.equal(csp({ addNonceTo: [], directives, extras: [] }), undefined);
  });
  describe('brand-selected analytics', () => {
    it('allow-lists Google Analytics without strict-dynamic', () => {
      const value = csp(undefined, {
        analytics: { enabled: true, provider: 'googleAnalytics', trackingId: 'G-ABC123' },
      })!.headerValue;
      for (const expected of [
        'https://www.googletagmanager.com',
        'https://*.google-analytics.com',
        'https://*.analytics.google.com',
      ])
        assert(value.includes(expected));
      assert(!value.includes("'strict-dynamic'"));
    });
    it('allow-lists Google Tag Manager scripts and frames without strict-dynamic', () => {
      const value = csp(undefined, {
        analytics: { enabled: true, provider: 'googleTagManager', trackingId: 'GTM-XYZ' },
      })!.headerValue;
      const script = value.match(/script-src[^;]*/)![0],
        frame = value.match(/frame-src[^;]*/)![0];
      assert(script.includes("'self'"));
      assert(script.includes('https://www.googletagmanager.com'));
      assert(!script.includes("'strict-dynamic'"));
      assert(frame.includes('https://www.googletagmanager.com'));
    });
    for (const [reason, analytics] of [
      ['disabled', { enabled: false, provider: 'googleAnalytics', trackingId: 'G-ABC123' }],
      ['empty tracking ID', { enabled: true, provider: 'googleAnalytics', trackingId: '  ' }],
      ['invalid tracking ID', { enabled: true, provider: 'googleAnalytics', trackingId: 'G-ABC<script>' }],
      ['unsupported provider', { enabled: true, provider: 'unsupported', trackingId: 'VALID-123' }],
    ] as const)
      it(`does not allow-list analytics with ${reason}`, () => {
        const value = csp(undefined, { analytics })!.headerValue;
        assert(!value.includes('google-analytics.com'));
        assert(!value.includes('googletagmanager.com'));
      });
    it('needs no branding service global', () => assert(csp()!.headerValue.includes("default-src 'self'")));
    it('retains the base policy with an absent selected analytics configuration', () => {
      assert(csp(undefined, { analytics: undefined })!.headerValue.includes("default-src 'self'"));
    });
    it('emits CSP without any dynamic configuration callback', () => assert(csp()!.headerValue.length > 0));
  });
  it('permits Redoc 3 icon fonts only on the API docs page', () => {
    const fonts = (value: string) => value.split(';').find(part => part.trim().startsWith('font-src '))!;
    assert(fonts(csp(undefined, { pathname: '/default/rdmp/admin/api-docs' })!.headerValue).includes('data:'));
    assert(!fonts(csp()!.headerValue).includes('data:'));
  });
});
