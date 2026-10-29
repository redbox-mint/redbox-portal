import { generateSampleContext } from '../../../../angular/projects/researchdatabox/email-templates/src/app/context-sample';
import { flattenContextFields } from '../../../../angular/projects/researchdatabox/email-templates/src/app/schema-fields';
import { buildFieldTree } from '../../../../angular/projects/researchdatabox/email-templates/src/app/field-tree';
import { completionItems, completionQuery } from '../../../../angular/projects/researchdatabox/email-templates/src/app/template-completion';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { of } from 'rxjs';
import * as sinon from 'sinon';
import {
  emailSchemaTargets,
  emailFormMetadataSchema,
  emailContextSchema,
  curatedEmailContextSchema,
  MAX_EMAIL_SCHEMA_BYTES,
} from '../../src/utilities/EmailContextSchema';
import { validateEmailTemplate } from '../../src/services/EmailTemplateService';
import type { EmailTemplateAsts } from '../../src/services/EmailTemplateService';
import { Services as FormServices } from '../../src/services/FormsService';
import { Services as AdminServices } from '../../src/services/EmailTemplateAdminService';
import { lintEmailTemplateSchema } from '../../src/utilities/EmailTemplateSchemaLint';
import {
  issueEmailPreviewFrame,
  readEmailPreviewFrame,
  EMAIL_PREVIEW_CSP,
  EMAIL_PREVIEW_TTL_MS,
} from '../../src/utilities/EmailPreviewFrame';
import { handlebarsInstance, parseEmailContextJson } from '@researchdatabox/sails-ng-common';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

describe('Email schema assistance', () => {
  const brand = { id: 'a', name: 'brand-a' } as any;
  const caller = { brand, user: { id: 'admin-a', roles: [{ id: 'admin-a', name: 'Admin' }] } } as any;
  const metadata = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: {
        type: 'string',
        title: 'Title',
        description: 'Record title',
        examples: ['Research'],
        enum: ['Research'],
      },
      optional: { type: 'string' },
      authors: {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string' } }, additionalProperties: false },
      },
      details: { type: 'object', properties: { summary: { type: 'string' } }, additionalProperties: false },
    },
    required: ['title', 'authors', 'details'],
  };
  let describe: sinon.SinonStub;
  let mock: any;
  beforeEach(() => {
    mock = createMockSails({
      config: {
        emailnotification: {
          settings: {
            additionalContextRoots: ['scuEmail'],
            exposedConfigPaths: ['appUrl', 'public.support'],
          },
        },
        recordSchema: { enabled: true },
      },
    });
    setupServiceTestGlobals(mock);
    const type = { id: 'rdmp-a', name: 'rdmp', label: 'Research plan', branding: 'a' };
    (global as any).RecordTypesService = {
      getAll: sinon.stub().returns(of([type])),
      get: sinon.stub().returns(of(type)),
    };
    (global as any).WorkflowStepsService = {
      getAllForRecordTypeIncludingHidden: sinon.stub().returns(
        of([
          { name: 'draft', starting: true, config: { label: 'Draft', form: 'rdmp-draft' } },
          { name: 'published', starting: false, config: { label: 'Published' } },
        ])
      ),
    };
    (global as any).FormsService = {
      getForm: sinon.stub().resolves({
        branding: 'a',
        configuration: {
          fields: [
            { name: 'title', label: 'Title' },
            { key: 'details.summary', props: { label: 'Summary' } },
          ],
        },
      }),
      buildClientFormConfig: sinon.stub().callsFake(async (form: unknown) => form),
    };
    describe = sinon.stub().resolves({ kind: 'resolved', completeness: 'complete', document: metadata });
    mock.services.recordschemaservice = { describeStage: describe };
  });
  afterEach(() => {
    cleanupServiceTestGlobals();
    sinon.restore();
    for (const name of ['RecordTypesService', 'WorkflowStepsService', 'FormsService']) delete (global as any)[name];
  });
  const schema = () => emailContextSchema(brand, 'rdmp', caller, 'rdmp', 'draft');
  it('lists only route-brand types and their labelled workflow stages', async () => {
    (global as any).RecordTypesService.getAll.returns(
      of([
        { name: 'foreign', branding: 'b' },
        { id: 'a-rdmp', name: 'rdmp', branding: 'a' },
      ])
    );
    const result = await emailSchemaTargets(brand);
    assert.deepEqual(
      result.recordTypes.map(t => t.id),
      ['rdmp']
    );
    assert.deepEqual(result.recordTypes[0].stages[0], { id: 'draft', label: 'Draft', starting: true });
    assert.deepEqual((global as any).RecordTypesService.getAll.firstCall.args, [brand]);
  });
  it('uses describeStage with the requesting caller, internal brand and public route; keeps annotations', async () => {
    const result = await schema();
    assert.equal(result.precision, 'record-schema');
    assert.equal(result.schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.deepEqual(describe.firstCall.args[0], {
      brand: 'a',
      branding: 'brand-a',
      portal: 'rdmp',
      recordType: 'rdmp',
      targetStep: 'draft',
      caller,
    });
    assert.deepEqual(
      JSON.parse(JSON.stringify(result.schema.properties!.record.properties!.metadata.properties!.title)),
      metadata.properties.title
    );
    assert.equal(result.schema.properties!.record.properties!.authorization, undefined);
    assert.ok(result.schema.properties!.imports.properties!.record.$ref);
    assert.ok(result.schema.properties!.sailsConfig.properties!.public.properties!.support);
    assert.deepEqual(result.schema.properties!.scuEmail, {
      type: 'object',
      properties: {},
      additionalProperties: true,
    });
  });
  it('re-resolves each request so current caller and changed schemas cannot go stale', async () => {
    await schema();
    describe.resolves({ kind: 'resolved', document: { type: 'object', title: 'Changed' } });
    const result = await schema();
    assert.equal(describe.callCount, 2);
    assert.equal(result.schema.properties!.record.properties!.metadata.title, 'Changed');
  });
  for (const reason of ['disabled', 'absent', 'unavailable', 'throws']) {
    it(`falls back to brand-scoped permissive form fields when describeStage is ${reason}`, async () => {
      if (reason === 'disabled') mock.config.recordSchema.enabled = false;
      if (reason === 'absent') delete mock.services.recordschemaservice;
      if (reason === 'unavailable') describe.resolves({ kind: 'unavailable', code: 'not-resolvable' });
      if (reason === 'throws') describe.rejects(new Error('PRIVATE FORM'));
      const result = await schema();
      assert.equal(result.precision, 'form-config');
      const metadata = result.schema.properties!.record.properties!.metadata;
      assert.equal(metadata.additionalProperties, true);
      assert.equal(metadata.properties!.title.title, 'Title');
      assert.equal(metadata.properties!.details.properties!.summary.title, 'Summary');
      assert.deepEqual((global as any).FormsService.getForm.firstCall.args, [brand, 'rdmp-draft', true, 'rdmp', {}]);
      assert.deepEqual((global as any).FormsService.buildClientFormConfig.firstCall.args.slice(1), [
        'edit',
        ['Admin'],
        null,
        mock.config.reusableFormDefinitions,
        'brand-a',
        undefined,
        caller,
        false,
        { hydrateVocabulary: false },
      ]);
      if (reason === 'disabled') assert.equal(describe.callCount, 0);
    });
  }
  it('preserves all 19 namespaced SCU model names in form-config fallback and filters prototype keys', async () => {
    const form = JSON.parse(readFileSync(join(__dirname, '../fixtures/email-scu-namespaced-form.json'), 'utf8'));
    form.branding = 'a';
    form.configuration.fields.push(
      ...['__proto__', 'constructor', 'prototype', 'details.__proto__.bad'].map(name => ({ name, model: true }))
    );
    mock.config.recordSchema.enabled = false;
    (global as any).FormsService.getForm.resolves(form);
    const result = await schema();
    assert.equal(result.precision, 'form-config');
    const fields = result.schema.properties!.record.properties!.metadata.properties!;
    assert.equal(Object.keys(fields).length, 19);
    for (const field of form.configuration.fields.slice(0, 19)) {
      assert.ok(Object.hasOwn(fields, field.name));
      assert.equal(fields[field.name].title, field.label);
    }
    assert.equal(Object.hasOwn(fields, '__proto__'), false);
    const literal = '{{record.metadata.[dc:accessRights]}}';
    // Stage 2b already consumes parsed AST parts, including segment literals.
    assert.doesNotThrow(() => validateEmailTemplate({ subject: 'Subject', body: literal, format: 'html' }));
    assert.deepEqual(
      lintEmailTemplateSchema(
        { subject: 'Subject', body: literal, format: 'html' },
        result.schema,
        false,
        'form-config'
      ),
      []
    );
  });

  it('UR-B01 uses real delivered RDMP metadata groups, layout containers and repeatables', () => {
    const form = JSON.parse(readFileSync(join(__dirname, '../fixtures/email-rdmp-effective-form.json'), 'utf8'));
    const metadataSchema = emailFormMetadataSchema(form);
    const fields = metadataSchema.properties!;
    assert.ok(fields.contributor_ci.properties!.name);
    assert.ok(fields.group_1_component.properties!.text_3);
    assert.ok(fields.group_1_component.properties!.group_2_component.properties!.text_5);
    assert.equal(fields.repeatable_group_1.type, 'array');
    assert.ok(fields.repeatable_group_1.items!.properties!.text_3);
    assert.equal(fields.repeatable_textfield_1.type, 'array');
    assert.deepEqual(fields.repeatable_textfield_1.items, {});
    assert.equal(fields.file_upload_1.type, undefined); // Unknown leaf types remain permissive.
    // Exercise the actual client generator, so samples cannot mask the former wrong paths.
    const sample = generateSampleContext(curatedEmailContextSchema(metadataSchema)) as any;
    assert.equal(typeof sample.record.metadata.contributor_ci, 'object');
    assert.ok(Object.hasOwn(sample.record.metadata.contributor_ci, 'name'));
    assert.ok(Object.hasOwn(sample.record.metadata.group_1_component, 'text_3'));
    assert.ok(Object.hasOwn(sample.record.metadata.group_1_component.group_2_component, 'text_5'));
    assert.ok(Object.hasOwn(sample.record.metadata.repeatable_group_1[0], 'text_3'));
    assert.equal(sample.record.metadata.repeatable_textfield_1.length, 1);
    assert.equal(sample.record.metadata.standard_contributor_fields_group, undefined);
    assert.equal(sample.record.metadata.text_3, undefined);
    for (const wrong of [
      'standard_contributor_fields_group',
      'text_3',
      'text_5',
      'main_tab',
      'tab_1',
      'text_block',
      'save_button',
    ])
      assert.equal(Object.hasOwn(fields, wrong), false, wrong);
  });

  it('UR-B01 resolves contributor reusable replacement names through the real form builder', async () => {
    const delivered = JSON.parse(readFileSync(join(__dirname, '../fixtures/email-rdmp-effective-form.json'), 'utf8'));
    // Delivered JSON contains runtime values; source forms call these defaults.
    const asSource = (value: any): void => {
      if (!value || typeof value !== 'object') return;
      if (value.model?.config && Object.hasOwn(value.model.config, 'value')) {
        value.model.config.defaultValue = value.model.config.value;
        delete value.model.config.value;
      }
      Object.values(value).forEach(asSource);
    };
    asSource(delivered);
    const definitions =
      delivered.componentDefinitions[0].component.config.tabs[0].component.config.componentDefinitions;
    const index = definitions.findIndex((item: any) => item.name === 'contributor_ci');
    const contributor = definitions[index];
    mock.config.reusableFormDefinitions = {
      standard_contributor_fields: [{ ...contributor, name: 'standard_contributor_fields_group' }],
    };
    definitions[index] = {
      name: 'contributor_ci',
      overrides: { reusableFormName: 'standard_contributor_fields' },
      component: {
        class: 'ReusableComponent',
        config: {
          componentDefinitions: [
            {
              name: 'standard_contributor_fields_group',
              component: { class: 'GroupComponent', config: {} },
              overrides: { replaceName: 'contributor_ci' },
            },
          ],
        },
      },
    };
    mock.config.recordSchema.enabled = false;
    (global as any).FormsService.getForm.resolves({ branding: 'a', configuration: delivered });
    const forms = new FormServices.Forms();
    (global as any).FormsService.buildClientFormConfig.callsFake(forms.buildClientFormConfig.bind(forms));
    const result = await schema();
    assert.equal(result.precision, 'form-config');
    const fields = result.schema.properties!.record.properties!.metadata.properties!;
    assert.ok(fields.contributor_ci.properties!.name);
    assert.equal(Object.hasOwn(fields, 'standard_contributor_fields_group'), false);
  });

  for (const nested of [false, true]) {
    it(`discovers an accordion-only form through the real builder${nested ? ' with nested groups and repeatables' : ''}`, async () => {
      const input = (name: string) => ({ name, component: { class: 'SimpleInputComponent' } });
      const group = (name: string, children: unknown[]) => ({
        name,
        component: { class: 'GroupComponent', config: { componentDefinitions: children } },
      });
      const fields = nested
        ? [
            input('title'),
            group('details', [group('nested', [input('summary')])]),
            {
              name: 'authors',
              component: { class: 'RepeatableComponent', config: { elementTemplate: group('', [input('name')]) } },
            },
          ]
        : [input('title')];
      const form = {
        name: 'accordion-form',
        componentDefinitions: [
          {
            name: 'accordion-layout',
            component: {
              class: 'AccordionComponent',
              config: {
                panels: [
                  {
                    name: 'panel-layout',
                    component: { class: 'AccordionPanelComponent', config: { componentDefinitions: fields } },
                  },
                ],
              },
            },
          },
        ],
      };
      mock.config.recordSchema.enabled = false;
      (global as any).FormsService.getForm.resolves({ branding: 'a', configuration: form });
      const forms = new FormServices.Forms();
      (global as any).FormsService.buildClientFormConfig.callsFake(forms.buildClientFormConfig.bind(forms));
      const result = await schema();
      assert.equal(result.precision, 'form-config');
      const metadata = result.schema.properties!.record.properties!.metadata;
      assert.ok(Object.hasOwn(metadata.properties!, 'title'));
      assert.equal(Object.hasOwn(metadata.properties!, 'accordion-layout'), false);
      assert.equal(Object.hasOwn(metadata.properties!, 'panel-layout'), false);
      if (nested) {
        assert.ok(metadata.properties!.details.properties!.nested.properties!.summary);
        assert.equal(metadata.properties!.authors.type, 'array');
        assert.ok(metadata.properties!.authors.items!.properties!.name);
        const sample = generateSampleContext(result.schema) as any;
        assert.ok(Object.hasOwn(sample.record.metadata.details.nested, 'summary'));
        assert.ok(Object.hasOwn(sample.record.metadata.authors[0], 'name'));
      }
    });
  }

  it('does no vocabulary reads for a schema fallback with many inline vocabulary fields', async () => {
    const previous = (global as any).VocabularyService;
    const getEntries = sinon.stub().resolves({ entries: [], meta: { total: 0 } });
    (global as any).VocabularyService = { getEntries };
    try {
      const form = {
        name: 'vocabulary-form',
        componentDefinitions: Array.from({ length: 30 }, (_, index) => ({
          name: `field_${index}`,
          constraints: index === 29 ? { authorization: { allowRoles: ['OtherRole'] } } : undefined,
          component: { class: 'DropdownInputComponent', config: { inlineVocab: true, vocabRef: `vocab_${index}` } },
        })),
      };
      mock.config.recordSchema.enabled = false;
      (global as any).FormsService.getForm.resolves({ branding: 'a', configuration: form });
      const forms = new FormServices.Forms();
      (global as any).FormsService.buildClientFormConfig.callsFake(forms.buildClientFormConfig.bind(forms));
      for (let request = 0; request < 2; request++) {
        const result = await schema();
        assert.equal(result.precision, 'form-config');
        const fields = result.schema.properties!.record.properties!.metadata.properties!;
        assert.equal(Object.keys(fields).length, 29);
        assert.equal(Object.hasOwn(fields, 'field_29'), false);
      }
      sinon.assert.notCalled(getEntries);
      // Ordinary client construction still hydrates by default.
      await forms.buildClientFormConfig(form as any, 'edit', ['Admin'], null, {}, 'brand-a');
      assert.equal(getEntries.callCount, 30);
    } finally {
      if (previous === undefined) delete (global as any).VocabularyService;
      else (global as any).VocabularyService = previous;
    }
  });

  it('returns none without disclosing foreign forms, and rejects foreign/unknown types before schema access', async () => {
    describe.resolves({ kind: 'unavailable' });
    (global as any).FormsService.getForm.resolves({ branding: 'b', configuration: { fields: [{ name: 'SECRET' }] } });
    assert.equal((await schema()).precision, 'none');
    (global as any).RecordTypesService.get.returns(of({ name: 'rdmp', branding: 'b' }));
    await assert.rejects(schema(), { code: 'UNKNOWN_RECORD_TYPE' });
    (global as any).RecordTypesService.get.returns(of(undefined));
    await assert.rejects(schema(), { code: 'UNKNOWN_RECORD_TYPE' });
    assert.equal(describe.callCount, 1);
  });
  it('rejects malformed/unknown stages and caps the response', async () => {
    await assert.rejects(emailContextSchema(brand, 'rdmp', caller, 'rdmp', 'missing'), {
      code: 'INVALID_SCHEMA_TARGET',
    });
    await assert.rejects(emailContextSchema(brand, 'rdmp', caller, ['rdmp']), { code: 'INVALID_SCHEMA_TARGET' });
    describe.resolves({ kind: 'resolved', document: { description: 'x'.repeat(MAX_EMAIL_SCHEMA_BYTES) } });
    await assert.rejects(schema(), { code: 'LENGTH_LIMIT' });
  });
  const lint = (body: string, optional = false) =>
    lintEmailTemplateSchema(
      { subject: 'Subject', body, format: 'html' },
      curatedEmailContextSchema(metadata),
      optional
    );
  it('describes title and record URLs as optional editable strings for field discovery and sample generation', () => {
    mock.config.emailnotification.settings.additionalContextRoots.push('title');
    const schema = curatedEmailContextSchema(metadata);
    assert.deepEqual(schema.properties!.title, {
      type: 'string', description: 'Record title; shortcut for record.metadata.title',
    });
    const record = schema.properties!.record;
    assert.equal(record.additionalProperties, false);
    assert.deepEqual(record.properties!.viewUrl, {
      type: 'string', format: 'uri', description: 'Link to view this record in the portal',
    });
    assert.deepEqual(record.properties!.editUrl, {
      type: 'string', format: 'uri', description: 'Link to edit this record in the portal',
    });
    assert.deepEqual(schema.properties!.recordUrl, {});
    const fields = flattenContextFields(schema);
    for (const path of ['record.redboxOid', 'imports.record.redboxOid', 'title', 'record.viewUrl', 'record.editUrl', 'imports.record.viewUrl', 'imports.record.editUrl']) {
      const field = fields.find(field => field.path === path)!;
      assert.equal(field.type, 'string');
      assert.equal(field.required, false);
      assert.ok(field.description);
    }
    const tree = buildFieldTree(fields, []);
    const children = tree.find(node => node.path === 'record')!.children;
    assert.ok(children.some(node => node.path === 'record.viewUrl'));
    assert.ok(children.some(node => node.path === 'record.editUrl'));
    const text = '{{record.';
    const items = completionItems(completionQuery(text, text.length)!, { fields, roots: [], helpers: [] });
    assert.ok(items.some(item => item.value === 'record.viewUrl'));
    assert.ok(items.some(item => item.value === 'record.editUrl'));
    const sample = generateSampleContext(schema) as any;
    assert.equal(typeof sample.title, 'string');
    assert.equal(typeof sample.record.redboxOid, 'string');
    assert.equal(schema.properties!.record.properties!.redboxOid.description, 'Legacy alias of record.oid');
    assert.equal(sample.record.viewUrl, 'https://example.org/record');
    assert.equal(sample.record.editUrl, 'https://example.org/record');
    assert.equal(sample.recordUrl, null);
    assert.equal(Object.hasOwn(sample, 'imports'), false);
  });
  it('keeps the integration recordUrl root permissive, including additional context root configuration', () => {
    assert.deepEqual(curatedEmailContextSchema(metadata).properties!.recordUrl, {});
    assert.deepEqual(lint('{{recordUrl}} {{recordUrl.custom}}'), []);
    mock.config.emailnotification.settings.additionalContextRoots.push('recordUrl');
    assert.deepEqual(curatedEmailContextSchema(metadata).properties!.recordUrl, {
      type: 'object', properties: {}, additionalProperties: true,
    });
  });
  it('recognises title and record URL fields and only warns about unguarded use when requested', () => {
    const body = '{{title}} {{record.viewUrl}} {{record.editUrl}}';
    assert.deepEqual(lint(body), []);
    assert.deepEqual(lint(body, true).map(diagnostic => diagnostic.code), ['OPTIONAL_UNGUARDED', 'OPTIONAL_UNGUARDED', 'OPTIONAL_UNGUARDED']);
    assert.deepEqual(lint('{{#if title}}{{title}}{{/if}} {{#if record.viewUrl}}{{record.viewUrl}}{{/if}} {{#if record.editUrl}}{{record.editUrl}}{{/if}}', true), []);
    const [unknown] = lint('{{record.viewUr}}');
    assert.equal(unknown.code, 'UNKNOWN_FIELD');
    assert.equal(unknown.suggestion, 'viewUrl');
    assert.equal(lint('{{record.editUr}}')[0].suggestion, 'editUrl');
  });
  it('emits all warning codes, safe sibling suggestions and positions without source text', () => {
    const diagnostics = lint(
      'PRIVATE TEMPLATE\n{{record.metadata.titel}} {{#each record.metadata.title}}{{this}}{{/each}} {{record.metadata.details}} {{record.metadata.optional}}',
      true
    );
    assert.deepEqual(
      new Set(diagnostics.map(d => d.code)),
      new Set(['UNKNOWN_FIELD', 'EACH_NOT_ARRAY', 'PRINTS_OBJECT', 'OPTIONAL_UNGUARDED'])
    );
    assert.equal(diagnostics.find(d => d.code === 'UNKNOWN_FIELD')!.suggestion, 'title');
    assert.equal(diagnostics[0].line, 2);
    assert.ok(diagnostics.every(d => d.severity === 'warning'));
    assert.ok(!JSON.stringify(diagnostics).includes('PRIVATE'));
    assert.ok(!JSON.stringify(diagnostics).includes('titel'));
  });
  it('checks scoped each/with, parent and @root paths, and skips uncertain/custom/hook paths', () => {
    assert.equal(
      lint(
        '{{#each record.metadata.authors}}{{name}}{{this.name}}{{../record.metadata.title}}{{@root.record.metadata.title}}{{/each}}'
      ).length,
      0
    );
    assert.equal(lint('{{#with record.metadata.details}}{{summary}}{{/with}}').length, 0);
    assert.equal(lint('{{#each record.metadata.authors as |author|}}{{author.name}}{{/each}}').length, 0);
    assert.equal(lint('{{#each record.metadata.authors}}{{naem}}{{/each}}')[0].suggestion, 'name');
    assert.equal(
      lint('{{scuEmail.anything.at.all}} {{#each record.metadata.details}}{{arbitrary}}{{/each}}').length,
      0
    );
    assert.equal(lint('{{record.workflow.foo}}')[0].code, 'UNKNOWN_FIELD');
  });
  it('offers no one-click fix when normalisation changed the source positions', () => {
    // U+FB01 (one code unit) normalises to "fi" (two), shifting later columns.
    const [shifted] = lint('\uFB01 {{record.metadata.titl}}');
    assert.equal(shifted.code, 'UNKNOWN_FIELD');
    assert.equal(shifted.suggestion, undefined);
    assert.equal(shifted.segmentIndex, undefined);
    assert.equal(lint('fi {{record.metadata.titl}}')[0].suggestion, 'title');
  });
  it('reports exact failing AST-part indices in scoped, parent, alias and root paths', () => {
    const schema = curatedEmailContextSchema({
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'object', properties: { titel: { type: 'string' } }, additionalProperties: false },
      },
    });
    for (const [body, index] of [
      ['{{#with record.metadata}}{{this.titel.titel}}{{/with}}', 0],
      ['{{#with record.metadata}}{{titel.titel}}{{/with}}', 0],
      ['{{#with record.metadata as |meta|}}{{meta.titel.titel}}{{/with}}', 1],
      ['{{#with record.metadata}}{{../record.metadata.titel.titel}}{{/with}}', 2],
      ['{{#with record.metadata}}{{@root.record.metadata.titel.titel}}{{/with}}', 3],
    ] as const) {
      const diagnostics = lintEmailTemplateSchema({ subject: 'Subject', body, format: 'html' }, schema);
      const warning = diagnostics.find(d => d.code === 'UNKNOWN_FIELD')!;
      assert.equal(warning.suggestion, 'title');
      assert.equal(warning.segmentIndex, index);
      assert.ok(!JSON.stringify(diagnostics).includes('titel'));
    }
  });
  it('understands bracketed metadata segments and never guesses tied sibling suggestions', () => {
    const schema = curatedEmailContextSchema({
      type: 'object',
      additionalProperties: false,
      properties: {
        'dc:accessRights': { type: 'string' },
        cat: { type: 'string' },
        bat: { type: 'string' },
      },
    });
    const run = (body: string) => lintEmailTemplateSchema({ subject: 's', body, format: 'html' }, schema);
    assert.deepEqual(run('{{record.metadata.[dc:accessRights]}}'), []);
    const warning = run('{{record.metadata.[dc:acessRights]}}')[0];
    assert.equal(warning.suggestion, 'dc:accessRights');
    assert.equal(warning.segmentIndex, 2);
    assert.equal(run('{{record.metadata.dat}}')[0].suggestion, undefined);
  });
  it('bounds the review worst case well below one second and reports truncation without source', () => {
    const properties = Object.fromEntries(
      Array.from({ length: 1000 }, (_, i) => ['x'.repeat(90) + String(i).padStart(3, '0'), { type: 'string' }])
    );
    const schema = curatedEmailContextSchema({ type: 'object', properties, additionalProperties: false });
    const body = Array(150)
      .fill('{{record.metadata.' + 'y'.repeat(93) + '}}')
      .join('');
    const start = performance.now();
    const diagnostics = lintEmailTemplateSchema({ subject: 's', body, format: 'html' }, schema);
    assert.ok(performance.now() - start < 750, 'schema lint exceeded the 750 ms regression ceiling');
    assert.equal(diagnostics.at(-1)!.code, 'SCHEMA_LINT_TRUNCATED');
    assert.ok(diagnostics.length <= 100);
    assert.ok(diagnostics.every(d => d.severity === 'warning'));
    assert.ok(!JSON.stringify(diagnostics).includes('yyyy'));
    assert.ok(!JSON.stringify(diagnostics).includes('xxxx'));
  });
  it('skips pathological parser inputs before parsing, with a content-free warning', () => {
    const parse = sinon.spy(handlebarsInstance(), 'parse');
    const inputs = [
      '{{#if oid}}'.repeat(4000) + '{{oid}}' + '{{/if}}'.repeat(4000),
      '{{#if oid}}'.repeat(65) + '{{oid}}' + '{{/if}}'.repeat(65),
      '{{oid}}'.repeat(149796),
      '{{oid}}'.repeat(1025),
      '{{#if ' + '(if '.repeat(64) + 'oid' + ')'.repeat(64) + '}}{{oid}}{{/if}}',
      '{{#if oid}}' + '{{else if oid}}'.repeat(64) + '{{/if}}',
    ];
    const start = performance.now();
    for (const body of inputs) {
      const diagnostics = lint(body);
      assert.deepEqual(diagnostics, [
        {
          code: 'SCHEMA_LINT_TRUNCATED',
          severity: 'warning',
          reason: 'SCHEMA_LINT_TRUNCATED',
          field: 'body',
          line: 1,
          column: 1,
        },
      ]);
    }
    assert.ok(performance.now() - start < 750, 'parser pre-scan exceeded the 750 ms regression ceiling');
    // Only the small subject was parsed, never the pathological bodies.
    assert.deepEqual(
      parse.getCalls().map(call => call.args[0]),
      inputs.map(() => 'Subject')
    );
  });
  it('reuses original policy ASTs from admin validation without parsing again or leaking placeholder ASTs', () => {
    const content = { subject: '{{oid}}', body: '{{record.metadata.titel}}', format: 'html' as const };
    const parsed: EmailTemplateAsts = {};
    assert.deepEqual(new AdminServices.EmailTemplateAdmin().validate(content, parsed), []);
    const parse = sinon.spy(handlebarsInstance(), 'parse');
    const warnings = lintEmailTemplateSchema(
      content,
      curatedEmailContextSchema(metadata),
      false,
      'record-schema',
      parsed
    );
    assert.equal(warnings[0].suggestion, 'title');
    assert.equal(warnings[0].field, 'body');
    assert.equal(parsed.subject!.body[0].type, 'MustacheStatement');
    assert.equal(parsed.body!.body[0].type, 'MustacheStatement');
    sinon.assert.notCalled(parse);
  });
  it('memoises repeated sibling suggestions and applies a total budget to distinct lookups', () => {
    const properties = Object.fromEntries(
      Array.from({ length: 250 }, (_, i) => [`field${String(i).padStart(3, '0')}`, { type: 'string' }])
    );
    properties['title'] = { type: 'string' };
    const schema = curatedEmailContextSchema({ type: 'object', properties, additionalProperties: false });
    const repeated = lintEmailTemplateSchema(
      { subject: 's', body: '{{record.metadata.titel}}'.repeat(50), format: 'html' },
      schema
    );
    assert.equal(repeated.length, 50);
    assert.ok(repeated.every(d => d.suggestion === 'title'));
    const distinct = lintEmailTemplateSchema(
      {
        subject: 's',
        body: Array.from({ length: 150 }, (_, i) => `{{record.metadata.fiels${String(i).padStart(3, '0')}}}`).join(''),
        format: 'html',
      },
      schema
    );
    assert.equal(distinct.at(-1)!.code, 'SCHEMA_LINT_TRUNCATED');
  });
  it('suppresses optional hints by default and respects exact if/with guards', () => {
    assert.equal(lint('{{record.metadata.optional}}').length, 0);
    assert.equal(lint('{{#if record.metadata.optional}}{{record.metadata.optional}}{{/if}}', true).length, 0);
    assert.equal(lint('{{#with record.metadata.optional}}{{this}}{{/with}}', true).length, 0);
  });
  it('does not invent unknown-field warnings for permissive fallback metadata', () => {
    const diagnostics = lintEmailTemplateSchema(
      { subject: 'x', body: '{{record.metadata.anything}}', format: 'text' },
      curatedEmailContextSchema({ type: 'object', additionalProperties: true }),
      false,
      'form-config'
    );
    assert.equal(diagnostics.length, 0);
  });
});

describe('ET-07 preview frame capabilities', () => {
  it('binds sanitized output to brand, user and session, ignores query HTML and bounds reuse', () => {
    const token = issueEmailPreviewFrame('a', 'admin', 'session', '<p style="color:red">Rendered</p>');
    for (const args of [
      ['b', 'admin', 'session'],
      ['a', 'other', 'session'],
      ['a', 'admin', 'other'],
    ])
      assert.throws(() => readEmailPreviewFrame(token, ...(args as [string, string, string])), {
        code: 'PREVIEW_FRAME_UNAVAILABLE',
      });
    const html = readEmailPreviewFrame(token, 'a', 'admin', 'session');
    assert.ok(html.includes('style="color:red"'));
    for (let i = 0; i < 3; i++) readEmailPreviewFrame(token, 'a', 'admin', 'session');
    assert.throws(() => readEmailPreviewFrame(token, 'a', 'admin', 'session'), { code: 'PREVIEW_FRAME_UNAVAILABLE' });
    assert.ok(EMAIL_PREVIEW_CSP.includes("style-src 'unsafe-inline'"));
    assert.ok(EMAIL_PREVIEW_CSP.includes("script-src 'none'"));
    assert.ok(EMAIL_PREVIEW_CSP.endsWith('sandbox'));
  });
  it('expires without sliding extension and evicts superseded owner frames', () => {
    const now = Date.now();
    const token = issueEmailPreviewFrame('a', 'expiry', 'session', 'Safe', now);
    assert.throws(() => readEmailPreviewFrame(token, 'a', 'expiry', 'session', now + EMAIL_PREVIEW_TTL_MS), {
      code: 'PREVIEW_FRAME_UNAVAILABLE',
    });
    const first = issueEmailPreviewFrame('a', 'bounded', 'session', 'Safe');
    for (let i = 0; i < 4; i++) issueEmailPreviewFrame('a', 'bounded', 'session', 'Safe');
    assert.throws(() => readEmailPreviewFrame(first, 'a', 'bounded', 'session'), { code: 'PREVIEW_FRAME_UNAVAILABLE' });
  });
});

describe('ET-14 relaxed Context JSON', () => {
  it('normalises single quotes, identifier keys and trailing commas without evaluating code', () => {
    const result = parseEmailContextJson("{ aKey: 'aValue', nested: [1, true, null,], escaped: 'it\\'s', }");
    assert.equal(JSON.stringify(result), '{"aKey":"aValue","nested":[1,true,null],"escaped":"it\'s"}');
  });
  it('filters prototype keys at all depths, including escaped spellings', () => {
    const result = parseEmailContextJson(
      '{__proto__: {polluted: true}, record: {constructor: 1, prototype: 2, safe: 3}, "\\u005f_proto__": 5}'
    );
    assert.equal(JSON.stringify(result), '{"record":{"safe":3}}');
    assert.equal(({} as any).polluted, undefined);
  });
  for (const input of [
    '{a: alert(1)}',
    '{a: undefined}',
    '{a: NaN}',
    '{a: 01}',
    '{a: 1e999}',
    '{a: "unterminated}',
    '{a: 1,,}',
    '[]',
    '{} garbage',
    '{a: /* comment */ 1}',
  ])
    it('rejects malformed/non-data input with a content-free error', () => {
      assert.throws(() => parseEmailContextJson(input), /^Error: Invalid context JSON at offset \d+\.$/);
    });
  it('enforces byte and depth limits', () => {
    assert.throws(() => parseEmailContextJson('{a:"éé"}', 8), /size limit/);
    assert.throws(() => parseEmailContextJson('{a:'.repeat(66) + '1' + '}'.repeat(66)), /Invalid/);
  });
});
