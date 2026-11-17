import assert from 'node:assert/strict';
import { consoleLogger, FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { migrateFormConfigVerify } from '../../src/visitor/visitor-helpers';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { VocabInlineFormConfigVisitor } from '../../src/visitor/vocab-inline.visitor';
import { MigrationV4ToV5FormConfigVisitor } from '../../src/visitor/migrate-config-v4-v5.visitor';

/** Dev-tools imports the verifier without lifting Sails or installing service globals. */
describe('offline form configuration verification', () => {
  const globals = [
    'sails',
    'BrandingService',
    'FormVocabularyService',
    'NamedQueryService',
    'RecordGraphqlService',
    'VocabularyService',
  ];
  let previous: Map<string, PropertyDescriptor | undefined>;
  let warnings: string[];
  const logger = {
    ...consoleLogger,
    warn: (message: unknown) => {
      warnings.push(String(message));
    },
  };
  const frame = (): FormConfigFrame =>
    JSON.parse(
      JSON.stringify({
        name: 'offline',
        componentDefinitions: [
          {
            name: 'party',
            component: { class: 'TypeaheadInputComponent', config: { sourceType: 'namedQuery', queryId: 'party' } },
            model: { class: 'TypeaheadInputModel', config: {} },
          },
        ],
      })
    );

  beforeEach(() => {
    warnings = [];
    previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const key of globals) Reflect.deleteProperty(globalThis, key);
  });
  afterEach(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  it('accepts a JSON named-query typeahead without runtime globals and warns that compatibility is unverified', async () => {
    assert.ok(globals.every(key => !Reflect.has(globalThis, key)));
    const result = await migrateFormConfigVerify(frame(), logger);
    assert.equal(result.componentDefinitions[0].component.class, 'TypeaheadInputComponent');
    assert.ok(warnings.some(message => message.includes('compatibility is unverified in offline config tooling')));
  });
  it('verifies the real v4 query-vocabulary migration without runtime globals', async () => {
    const migrated = await new MigrationV4ToV5FormConfigVisitor(logger).start({
      data: {
        name: 'v4-query',
        fields: [
          {
            class: 'VocabField',
            compClass: 'VocabFieldComponent',
            definition: { name: 'party', sourceType: 'query', vocabQueryId: 'party' },
          },
        ],
      },
    });
    const result = await migrateFormConfigVerify(migrated, logger);
    const component = result.componentDefinitions[0].component;
    if (component.class !== 'TypeaheadInputComponent') throw new Error('Expected migrated typeahead');
    assert.equal(component.config?.sourceType, 'namedQuery');
    assert.ok(component.config && 'queryId' in component.config);
    assert.equal(component.config.queryId, 'party');
    assert.ok(warnings.some(message => message.includes('compatibility is unverified')));
  });
  it('does not call partial service globals in an offline process', async () => {
    let calls = 0;
    Object.assign(globalThis, {
      sails: { config: { auth: { defaultBrand: 'default', defaultPortal: 'rdmp' } } },
      BrandingService: {
        getBrand: () => {
          calls += 1;
          throw new Error('Offline');
        },
      },
      FormVocabularyService: {
        inspectNamedQueryLookup: async () => {
          calls += 1;
          return [];
        },
      },
    });
    assert.ok(!Reflect.has(globalThis, 'NamedQueryService') && !Reflect.has(globalThis, 'RecordGraphqlService'));
    await migrateFormConfigVerify(frame(), logger);
    assert.equal(calls, 0);
    assert.ok(warnings.some(message => message.includes('offline config tooling')));
  });
  it('does not inspect a service registry without runtime auth configuration', async () => {
    let calls = 0;
    const unexpected = () => {
      calls += 1;
      return undefined;
    };
    Object.assign(globalThis, {
      sails: { config: {} },
      BrandingService: { getBrand: unexpected },
      FormVocabularyService: {
        inspectNamedQueryLookup: async () => {
          calls += 1;
          return [];
        },
      },
      NamedQueryService: { getNamedQueryConfig: unexpected },
      RecordGraphqlService: { getBootstrapReadSchema: unexpected },
    });
    await migrateFormConfigVerify(frame(), logger);
    assert.equal(calls, 0);
    assert.ok(warnings.some(message => message.includes('offline config tooling')));
  });
  it('hydrates ordinary inline vocabulary with explicit branding when auth/defaultPortal is absent', async () => {
    let calls = 0;
    Object.assign(globalThis, {
      sails: { config: {} },
      VocabularyService: {
        getEntries: async () => {
          calls += 1;
          return { entries: [{ label: 'Open', value: 'open' }] };
        },
      },
    });
    const form = await new ConstructFormConfigVisitor(logger).start({
      data: {
        name: 'inline',
        componentDefinitions: [
          {
            name: 'status',
            component: { class: 'DropdownInputComponent', config: { inlineVocab: true, vocabRef: 'status' } },
          },
        ],
      },
      formMode: 'edit',
    });
    await new VocabInlineFormConfigVisitor(logger).resolveVocabs(form, 'default');
    assert.equal(calls, 1);
    const component = form.componentDefinitions[0].component;
    if (component.class !== 'DropdownInputComponent') throw new Error('Expected dropdown');
    assert.equal(component.config?.options?.[0].label, 'Open');
    assert.equal(component.config?.options?.[0].value, 'open');
  });
  it('treats unavailable inspection as nonfatal even when a tooling scope was explicitly supplied', async () => {
    await migrateFormConfigVerify(frame(), logger, { branding: 'default', portal: 'rdmp' });
    assert.ok(warnings.some(message => message.includes('LOOKUP_CONFIG_UNAVAILABLE')));
  });
});
