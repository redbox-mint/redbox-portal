let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import type { ILogger } from '../../src/Logger';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';

describe('ConstructFormConfigVisitor default value translation', () => {
  const logger: ILogger = {
    silly: () => undefined,
    verbose: () => undefined,
    trace: () => undefined,
    debug: () => undefined,
    log: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    crit: () => undefined,
    fatal: () => undefined,
    silent: () => undefined,
    blank: () => undefined,
  };

  const translations: Record<string, string> = {
    '@dataPublication-citation-publisher-default': 'Western Sydney University',
    '@dataPublication-accessRights-prefLabel-default': 'Copyright Western Sydney University',
    '@grant-name-default': 'Default grant name',
  };
  // i18next returns the key itself when the key is unknown.
  const translate = (key: string): string => translations[key] ?? key;

  function buildForm(): FormConfigFrame {
    return {
      name: 'test',
      componentDefinitions: [
        {
          name: 'publisher',
          component: { class: 'SimpleInputComponent', config: {} },
          model: {
            class: 'SimpleInputModel',
            config: { defaultValue: '@dataPublication-citation-publisher-default' }
          }
        },
        {
          name: 'accessRights',
          component: { class: 'TextAreaComponent', config: { rows: 3, cols: 40 } },
          model: {
            class: 'TextAreaModel',
            config: { defaultValue: '@dataPublication-accessRights-prefLabel-default' }
          }
        },
        {
          name: 'naturalLanguageDefault',
          component: { class: 'SimpleInputComponent', config: {} },
          model: {
            class: 'SimpleInputModel',
            config: { defaultValue: 'Some literal default text' }
          }
        },
        {
          name: 'unknownCodeDefault',
          component: { class: 'SimpleInputComponent', config: {} },
          model: {
            class: 'SimpleInputModel',
            config: { defaultValue: '@no-such-translation-key' }
          }
        },
        {
          name: 'objectDefault',
          component: { class: 'GroupComponent', config: { componentDefinitions: [] } },
          model: {
            class: 'GroupModel',
            config: {
              defaultValue: {
                publisher: '@dataPublication-citation-publisher-default',
                nested: { rights: '@dataPublication-accessRights-prefLabel-default' }
              }
            }
          }
        }
      ]
    };
  }

  it('resolves translation codes used as model default values', async () => {
    const constructor = new ConstructFormConfigVisitor(logger as any);
    const constructed = await constructor.start({ data: buildForm(), formMode: 'edit', translate });

    const valueAt = (index: number) =>
      (constructed.componentDefinitions?.[index] as { model?: { config?: { value?: unknown } } })?.model?.config?.value;

    expect(valueAt(0)).to.equal('Western Sydney University');
    expect(valueAt(1)).to.equal('Copyright Western Sydney University');
    // Natural language defaults must be left exactly as authored.
    expect(valueAt(2)).to.equal('Some literal default text');
    // An unknown code resolves to itself rather than becoming empty.
    expect(valueAt(3)).to.equal('@no-such-translation-key');
    expect(valueAt(4)).to.deep.equal({
      publisher: 'Western Sydney University',
      nested: { rights: 'Copyright Western Sydney University' }
    });
  });

  it('leaves default values untouched when no translator is supplied', async () => {
    const constructor = new ConstructFormConfigVisitor(logger as any);
    const constructed = await constructor.start({ data: buildForm(), formMode: 'edit' });

    const publisher = (constructed.componentDefinitions?.[0] as { model?: { config?: { value?: unknown } } })?.model?.config?.value;
    expect(publisher).to.equal('@dataPublication-citation-publisher-default');
  });

  it('does not translate record values, only form config defaults', async () => {
    const constructor = new ConstructFormConfigVisitor(logger as any);
    const constructed = await constructor.start({
      data: buildForm(),
      formMode: 'edit',
      // A record holding text that looks like a code must be preserved verbatim.
      record: { publisher: '@dataPublication-citation-publisher-default' },
      translate,
    });

    const publisher = (constructed.componentDefinitions?.[0] as { model?: { config?: { value?: unknown } } })?.model?.config?.value;
    expect(publisher).to.equal('@dataPublication-citation-publisher-default');
  });

  it('resolves translation codes in a repeatable elementTemplate newEntryValue', async () => {
    const input: FormConfigFrame = {
      name: 'test',
      componentDefinitions: [
        {
          name: 'grants',
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: {
                name: '',
                component: { class: 'SimpleInputComponent', config: {} },
                model: { class: 'SimpleInputModel', config: { newEntryValue: '@grant-name-default' } },
                layout: { class: 'RepeatableElementLayout' }
              }
            }
          },
          model: { class: 'RepeatableModel', config: {} }
        }
      ]
    };

    const constructor = new ConstructFormConfigVisitor(logger as any);
    const constructed = await constructor.start({ data: input, formMode: 'edit', translate });

    const repeatable = constructed.componentDefinitions?.[0] as {
      component?: { config?: { elementTemplate?: { model?: { config?: { newEntryValue?: unknown } } } } };
    };
    expect(repeatable.component?.config?.elementTemplate?.model?.config?.newEntryValue).to.equal('Default grant name');
  });
});
