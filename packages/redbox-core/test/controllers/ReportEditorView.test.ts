import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'ejs';

describe('Report editor view permissions', () => {
  const template = readFileSync(resolve(__dirname, '../../../../views/default/default/admin/reports.ejs'), 'utf8');
  const view = (admin: boolean, reportAuthor: boolean, queryAuthor: boolean) =>
    render(template, {
      isAdmin: admin,
      req: { session: { branding: 'default' }, user: { roles: [] }, isAuthenticated: () => true },
      BrandingService: {
        getBrand: () => ({ name: 'default' }),
        getBrandAndPortalPath: () => '/default/rdmp',
        getRootContext: () => '',
      },
      PathRulesService: {
        getRulesFromPath: (path: string) => [{ path }],
        canRead: (rules: Array<{ path: string }>) =>
          rules[0].path.includes('/api/report-config') ? reportAuthor : queryAuthor,
      },
      CacheService: { getNgAppFileHash: () => '' },
      TranslationService: { t: (key: string) => key },
      include: () => '',
      branding: 'default',
      portal: 'rdmp',
      reports: [{ name: 'existing', title: 'Existing report' }],
    });
  it('opens the full editor for a report-only author without exposing the named-query link', () => {
    const html = view(false, true, false);
    assert.match(html, /<report-config /);
    assert.match(html, /is-admin="false" can-manage-named-queries="false"/);
    assert.match(html, /angular\/report-config\/browser\/main/);
  });
  it('retains the report list for a reader without configuration permission', () => {
    const html = view(false, false, false);
    assert.doesNotMatch(html, /<report-config |angular\/report-config/);
    assert.match(html, /admin\/report\/existing/);
  });
  it('retains the administrator workspace and query management link', () => {
    assert.match(view(true, true, true), /is-admin="true" can-manage-named-queries="true"/);
  });
});
