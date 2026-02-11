import {
  CheckboxInputFormComponentDefinitionOutline,
  ConstructFormConfigVisitor,
  DropdownInputFormComponentDefinitionOutline,
  FormConfigFrame,
  GroupFieldComponentName,
  GroupFormComponentDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
  VocabInlineFormConfigVisitor,
} from '../../src';
import { logger } from './helpers';

let expect: Chai.ExpectStatic;
import('chai').then((mod) => expect = mod.expect);

describe('Vocab Inline Visitor', () => {
  beforeEach(() => {
    (global as any).sails = { config: { auth: { defaultBrand: 'default' } } };
    (global as any).VocabularyService = {
      getEntries: async () => ({ entries: [{ label: 'Open', value: 'open' }, { label: 'Closed', value: 'closed' }] }),
    };
  });

  afterEach(() => {
    delete (global as any).sails;
    delete (global as any).VocabularyService;
  });

  it('inlines vocab options when inlineVocab is true', async () => {
    const input: FormConfigFrame = {
      name: 'test',
      componentDefinitions: [
        {
          name: 'access_type',
          component: {
            class: 'DropdownInputComponent',
            config: {
              options: [],
              vocabRef: 'access-rights',
              inlineVocab: true,
            },
          },
        },
      ],
    };

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({ data: input, formMode: 'edit' });

    const visitor = new VocabInlineFormConfigVisitor(logger);
    await visitor.resolveVocabs(constructed);

    const dropdown = constructed.componentDefinitions?.[0] as DropdownInputFormComponentDefinitionOutline;
    const options = dropdown?.component?.config?.options as Array<{ label: string; value: string }>;
    expect(options).to.have.length(2);
    expect(options[0]?.label).to.equal('Open');
  });

  it('does not inline when inlineVocab is false', async () => {
    const getEntries = async () => ({ entries: [{ label: 'Open', value: 'open' }] });
    (global as any).VocabularyService = { getEntries };

    const input: FormConfigFrame = {
      name: 'test',
      componentDefinitions: [
        {
          name: 'access_type',
          component: {
            class: 'RadioInputComponent',
            config: {
              options: [{ label: 'Local', value: 'local' }],
              vocabRef: 'access-rights',
              inlineVocab: false,
            },
          },
        },
      ],
    };

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({ data: input, formMode: 'edit' });

    const visitor = new VocabInlineFormConfigVisitor(logger);
    await visitor.resolveVocabs(constructed);

    const radio = constructed.componentDefinitions?.[0] as RadioInputFormComponentDefinitionOutline;
    const options = radio?.component?.config?.options as Array<{ label: string; value: string }>;
    expect(options).to.have.length(1);
    expect(options[0]?.label).to.equal('Local');
  });

  it('handles nested components and missing vocab response', async () => {
    (global as any).VocabularyService = {
      getEntries: async () => null,
    };

    const input: FormConfigFrame = {
      name: 'test',
      componentDefinitions: [
        {
          name: 'group',
          component: {
            class: GroupFieldComponentName,
            config: {
              componentDefinitions: [
                {
                  name: 'status',
                  component: {
                    class: 'CheckboxInputComponent',
                    config: {
                      options: [],
                      vocabRef: 'status',
                      inlineVocab: true,
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const constructor = new ConstructFormConfigVisitor(logger);
    const constructed = constructor.start({ data: input, formMode: 'edit' });

    const visitor = new VocabInlineFormConfigVisitor(logger);
    await visitor.resolveVocabs(constructed);

    const group = constructed.componentDefinitions?.[0] as GroupFormComponentDefinitionOutline;
    const nested = group?.component?.config?.componentDefinitions?.[0] as CheckboxInputFormComponentDefinitionOutline;
    const options = nested?.component?.config?.options as Array<{ label: string; value: string }>;
    expect(options).to.have.length(0);
  });
});
