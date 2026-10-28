import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Module, { createRequire } from 'node:module';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { firstValueFrom } from 'rxjs';
import { Services as EmailServices } from '../../src/services/EmailService';
import { Services as AdminServices } from '../../src/services/EmailTemplateAdminService';
import { Services as SanitizerServices } from '../../src/services/DomSanitizerService';
import { dompurify } from '../../src/config/dompurify.config';
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
    delete (global as any).EmailService;
    delete (global as any).BrandingConfig;
    delete (global as any).DomSanitizerService;
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
    (global as any).EmailService = email;
    const admin = new AdminServices.EmailTemplateAdmin();
    const sanitizer = new SanitizerServices.DomSanitizer();
    mockSails.config.dompurify = dompurify;
    (global as any).BrandingConfig = { findOne: async ({ id }: any) => ({ id }) };
    (global as any).DomSanitizerService = sanitizer;
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
      const context = await email.buildPreviewContext(id, data, 'a');
      const preview = await admin.preview('a', id, { subject, body, format: 'html' }, JSON.stringify(context));
      assert.deepEqual(preview.diagnostics, []);
      assert.equal(preview.subject, supplied.subject);
      assert.equal(preview.html, sanitizer.sanitizeEmail(String(supplied.body)).sanitized);
    }
  });

  (scuRepo && scuFixture ? it : it.skip)('renders every SCU hook body and configured subject with hook-injected view data for both sources', async () => {
    const fixture = JSON.parse(readFileSync(scuFixture!, 'utf8'));
    const liveConfig = require(join(scuRepo!, 'src/config/emailnotification.ts')).emailnotification;

    const templates = readdirSync(join(scuRepo!, 'views/emailTemplates')).filter(file => file.endsWith('.hbs')).map(file => ({
      id: file.slice(0, -4), body: readFileSync(join(scuRepo!, 'views/emailTemplates', file), 'utf8'),
      subject: liveConfig.templates[file.slice(0, -4)].subject,
    }));
    assert.ok(templates.length > 0);
    // Execute SCU's actual source/exports. Substitute only its core base import
    // so the private hook inherits this checkout's source rather than a stale installed dist.
    const hookPath = join(scuRepo!, 'src/api/services/EmailService.ts');
    const hookModule = new Module(hookPath, module);
    const hookRequire = createRequire(hookPath);
    hookModule.require = ((name: string) => name === '@researchdatabox/redbox-core/dist/services/EmailService'
      ? { Services: EmailServices } : hookRequire(name)) as NodeJS.Require;
    const compiled = transpileModule(readFileSync(hookPath, 'utf8'), { compilerOptions: {
      module: ModuleKind.CommonJS, target: ScriptTarget.ES2024, esModuleInterop: true,
    } });
    (hookModule as any)._compile(compiled.outputText, hookPath);
    const email = hookModule.exports;
    const data = { record: fixture.record, oid: fixture.record.oid };
    (global as any).EmailService = email;
    const admin = new AdminServices.EmailTemplateAdmin();
    const sanitizer = new SanitizerServices.DomSanitizer();
    mockSails.config.dompurify = dompurify;
    (global as any).BrandingConfig = { findOne: async ({ id }: any) => ({ id }) };
    (global as any).DomSanitizerService = sanitizer;
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
      const context = await email.buildPreviewContext(template.id, data, 'a');
      assert.ok(context.scuEmail, 'The real SCU display function must run through the async preview hook seam');
      const preview = await admin.preview('a', template.id, { subject: template.subject, body: template.body, format: 'html' }, JSON.stringify(context));
      assert.deepEqual(preview.diagnostics, []);
      assert.equal(preview.subject, supplied.subject);
      assert.equal(preview.html, sanitizer.sanitizeEmail(String(supplied.body)).sanitized);
    }
  });
});
