import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firstValueFrom } from 'rxjs';
import { Services as EmailServices } from '../../src/services/EmailService';
import { validateEmailTemplate } from '../../src/services/EmailTemplateService';
import { emailnotification } from '../../src/config/emailnotification.config';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

// Synthetic record covering the fields the bundled core templates read.
const person = (name: string) => ({ text_full_name: name, email: `${name.toLowerCase()}@example.edu` });
const record = {
  oid: 'record-123',
  dateCreated: '2026-01-01T00:00:00.000Z',
  lastSaveDate: '2026-02-01T00:00:00.000Z',
  workflow: { stage: 'draft', stageLabel: 'Draft' },
  metaMetadata: { type: 'rdmp', brandId: 'a', createdBy: 'researcher' },
  metadata: {
    title: 'Representative project',
    dataowner_name: 'Data Owner',
    contributor_ci: person('Investigator'),
    contributor_data_manager: person('Manager'),
    contributor_supervisor: person('Supervisor'),
    creators: [person('Researcher')],
  },
};

// Optional private-hook check. Hook templates are not copied into this public
// repository: point SCU_EMAIL_REPO at a local hook checkout and SCU_EMAIL_FIXTURE
// at a local JSON file providing { record } shaped for that hook's templates.
const scuRepo = process.env.SCU_EMAIL_REPO;
const scuFixture = process.env.SCU_EMAIL_FIXTURE;

describe('Email template compatibility', () => {
  let directory: string;
  let mockSails: any;
  let previousSails: unknown;
  beforeEach(() => {
    previousSails = (global as any).sails;
    directory = mkdtempSync(join(tmpdir(), 'email-compatibility-'));
    mockSails = createMockSails({ config: {
      appUrl: 'https://portal.example.edu',
      emailnotification: { ...emailnotification, settings: { ...emailnotification.settings, templateDir: directory,
        additionalContextRoots: ['scuEmail'] } },
    } });
    setupServiceTestGlobals(mockSails);
  });
  afterEach(() => {
    cleanupServiceTestGlobals();
    // --spec runs this suite before the configured default suites. Preserve
    // their bootstrap global instead of making later config tests order-dependent.
    if (previousSails !== undefined) (global as any).sails = previousSails;
    delete (global as any).EmailTemplateService;
    rmSync(directory, { recursive: true, force: true });
  });

  it('renders all 7 core bodies and selected subjects as supplied files and DB overrides', async () => {
    const sourceDir = join(__dirname, '../../../../views/emailTemplates');
    mockSails.config.emailnotification.settings.templateDir = sourceDir;
    const data = { name: 'Researcher', data: 'Test payload', oid: 'record-123', record,
      kind: 'failure', title: 'Integration alert', summary: 'An integration alert', severity: 'error', brandId: 'a',
      integrationName: 'Example', integrationAction: 'sync', status: 'failed', redboxOid: 'record-123',
      traceId: 'trace', spanId: 'span', timestamp: '2026-10-01', startedAt: '2026-10-01' };
    const files = readdirSync(sourceDir).filter(file => file.endsWith('.hbs'));
    assert.equal(files.length, 7, 'Update the compatibility expectation when adding templates.');
    const email = new EmailServices.Email();
    for (const file of files) {
      const id = file.slice(0, -4);
      const body = readFileSync(join(sourceDir, file), 'utf8');
      const subject = emailnotification.templates[id]?.subject ?? emailnotification.defaults.subject;
      validateEmailTemplate({ body, subject, format: 'html' });
      const supplied = await firstValueFrom(email.buildFromTemplate(id, data, {}));
      assert.equal(supplied.status, 200, `${file}: ${supplied.ex}`);
      assert.ok(String(supplied.body).length > 0);
      (global as any).EmailTemplateService = { resolve: async () => ({ body, subject, format: 'html', source: 'override' }) };
      const override = await firstValueFrom(email.buildFromTemplate(id, data, { brandId: 'a' }));
      assert.equal(override.status, 200, `${file} override: ${override.ex}`);
      assert.equal(override.body, supplied.body);
      assert.equal(override.subject, supplied.subject);
    }
  });

  (scuRepo && scuFixture ? it : it.skip)('renders every SCU hook body and configured subject with hook-injected view data for both sources', async () => {
    const fixture = JSON.parse(readFileSync(scuFixture!, 'utf8'));
    const liveConfig = require(join(scuRepo!, 'src/config/emailnotification.ts')).emailnotification;
    const viewData = require(join(scuRepo!, 'src/scu/notifications/view-data.ts')).buildScuEmailViewData;
    const templates = readdirSync(join(scuRepo!, 'views/emailTemplates')).filter(file => file.endsWith('.hbs')).map(file => ({
      id: file.slice(0, -4), body: readFileSync(join(scuRepo!, 'views/emailTemplates', file), 'utf8'),
      subject: liveConfig.templates[file.slice(0, -4)].subject,
    }));
    assert.ok(templates.length > 0);
    class HookEmail extends EmailServices.Email {
      override async buildFromTemplateAsync(name: string, data: Record<string, unknown> = {}, response: Record<string, unknown> = {}) {
        return super.buildFromTemplateAsync(name, { ...data, scuEmail: viewData(data) }, response);
      }
    }
    const email = new HookEmail();
    const data = { record: fixture.record, oid: fixture.record.oid };
    mockSails.config.emailnotification.templates = Object.fromEntries(templates.map((template: any) =>
      [template.id, { subject: template.subject, template: template.id }]));
    for (const template of templates) {
      writeFileSync(join(directory, `${template.id}.hbs`), template.body);
      validateEmailTemplate({ ...template, format: 'html' });
      const supplied = await firstValueFrom(email.buildFromTemplate(template.id, data, {}));
      assert.equal(supplied.status, 200, `${template.id}: ${supplied.ex}`);
      assert.ok(String(supplied.body).length > 0);
      assert.ok(String(supplied.subject).length > 0);
      (global as any).EmailTemplateService = { resolve: async () => ({ ...template, format: 'html', source: 'override' }) };
      const override = await firstValueFrom(email.buildFromTemplate(template.id, data, { brandId: 'a' }));
      assert.equal(override.status, 200, `${template.id} override: ${override.ex}`);
      assert.equal(override.body, supplied.body);
      assert.equal(override.subject, supplied.subject);
    }
  });
});
