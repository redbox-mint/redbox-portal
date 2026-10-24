import path from 'node:path';
import * as sinon from 'sinon';
import { httpPolicyFixture } from './httpPolicyFixture';
import { createSinonStubLogger } from '../logger.test';
import { PageArtifacts } from '../../src/pages/Artifacts';
import type { PagesHttpInput } from '../../src/http/express/pages';

/** Explicit page composition; the actual renderer/locals/navigation code runs in tests. */
export async function pageInputFixture() {
  const f = httpPolicyFixture();
  Object.assign(f.req, { query: {}, body: {}, url: f.req.originalUrl });
  await f.run('brandingandportal', 'browseractor');
  const log = createSinonStubLogger(sinon);
  const languages = sinon.stub().resolves([
    { code: 'en', displayName: 'English' },
    { code: 'de', displayName: 'Deutsch' },
  ]);
  const settings = sinon
    .stub()
    .resolves({
      menu: { items: [], showSearch: true },
      homePanels: { panels: [] },
      adminSidebar: { header: {}, sections: [], footerLinks: [] },
    });
  const translate = sinon.stub().callsFake((_brand: string, _language: string, key: string) => key);
  const input: PagesHttpInput = {
    artifacts: new PageArtifacts(
      [path.resolve(__dirname, '../../../../views')],
      [path.resolve(__dirname, '../../../../assets')]
    ),
    rootContext: '',
    origin: 'https://portal.example.edu',
    environment: 'test',
    csp: {},
    log,
    csrf: { generateToken: () => 'fixture-csrf', protect: (_req, _res, next) => next() },
    policies: {},
    policyConfiguration: {},
    forms: {} as PagesHttpInput['forms'],
    recordTypes: {} as PagesHttpInput['recordTypes'],
    dashboards: {} as PagesHttpInput['dashboards'],
    reports: {} as PagesHttpInput['reports'],
    loadRecord: async () => null,
    canCreate: async () => false,
    configModel: async () => undefined,
    settings,
    languages,
    translate,
    typeface: () => null,
    templateConfig: {},
  };
  return { ...f, input, log, languages, settings, translate };
}
