let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import {
    CheckboxTreeFormComponentDefinitionOutline,
    DropdownInputFormComponentDefinitionOutline,
    FormConfigFrame,
    GroupFieldComponentName,
    RadioInputFormComponentDefinitionOutline
} from '@researchdatabox/sails-ng-common';
import type { ILogger } from '../../src/Logger';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { VocabInlineFormConfigVisitor } from '../../src/visitor/vocab-inline.visitor';

describe('VocabInlineFormConfigVisitor', () => {
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

    beforeEach(() => {
        (globalThis as any).sails = { config: { auth: { defaultBrand: 'default' } } };
        (globalThis as any).VocabularyService = {
            getEntries: async () => ({ entries: [{ label: 'Open', value: 'open' }, { label: 'Closed', value: 'closed' }] })
        };
    });

    afterEach(() => {
        delete (globalThis as any).sails;
        delete (globalThis as any).VocabularyService;
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

        const constructor = new ConstructFormConfigVisitor(logger as any);
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
        (globalThis as any).VocabularyService = { getEntries };

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

        const constructor = new ConstructFormConfigVisitor(logger as any);
        const constructed = constructor.start({ data: input, formMode: 'edit' });

        const visitor = new VocabInlineFormConfigVisitor(logger);
        await visitor.resolveVocabs(constructed);

        const radio = constructed.componentDefinitions?.[0] as RadioInputFormComponentDefinitionOutline;
        const options = radio?.component?.config?.options as Array<{ label: string; value: string }>;
        expect(options).to.have.length(1);
        expect(options[0]?.label).to.equal('Local');
    });

    it('throws when inline vocab slug cannot be resolved', async () => {
        (globalThis as any).VocabularyService = {
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

        const constructor = new ConstructFormConfigVisitor(logger as any);
        const constructed = constructor.start({ data: input, formMode: 'edit' });

        const visitor = new VocabInlineFormConfigVisitor(logger);
        let thrown: unknown = null;
        try {
            await visitor.resolveVocabs(constructed);
        } catch (error) {
            thrown = error;
        }
        expect(thrown).to.be.instanceOf(Error);
        expect((thrown as Error).message).to.contain("Inline vocabulary 'status' was not found");
    });


    it('inlines checkbox tree vocab by paging all entries and building nested treeData', async () => {
        (globalThis as any).VocabularyService = {
            getEntries: async (_branding: string, _vocabRef: string, options?: { limit?: number; offset?: number }) => {
                if ((options?.offset ?? 0) === 0) {
                    return {
                        entries: [
                            { id: 'e1', label: 'Mathematical Sciences', value: '01', identifier: '01', parent: null },
                            { id: 'e2', label: 'Physical Sciences', value: '02', identifier: '02', parent: null },
                        ],
                        meta: { total: 3 },
                    };
                }
                return {
                    entries: [{ id: 'e3', label: 'Pure Mathematics', value: '0101', identifier: '0101', parent: 'e1' }],
                    meta: { total: 3 },
                };
            },
        };

        const input: FormConfigFrame = {
            name: 'test',
            componentDefinitions: [
                {
                    name: 'anzsrc',
                    component: {
                        class: 'CheckboxTreeComponent',
                        config: {
                            vocabRef: 'anzsrc-2020-for',
                            inlineVocab: true,
                        },
                    },
                    model: { class: 'CheckboxTreeModel', config: {} },
                },
            ],
        };

        const constructor = new ConstructFormConfigVisitor(logger as any);
        const constructed = constructor.start({ data: input, formMode: 'edit' });

        const visitor = new VocabInlineFormConfigVisitor(logger);
        await visitor.resolveVocabs(constructed, 'default');

        const tree = constructed.componentDefinitions?.[0] as CheckboxTreeFormComponentDefinitionOutline;
        const treeData = tree.component.config?.treeData ?? [];
        expect(treeData).to.have.length(2);
        expect(treeData[0]?.id).to.equal('e1');
        expect(treeData[0]?.children).to.have.length(1);
        expect(treeData[0]?.hasChildren).to.equal(true);
        expect(treeData[0]?.children?.[0]?.id).to.equal('e3');
    });

    it('treats entries with broken parent references as root nodes when inlining tree data', async () => {
        (globalThis as any).VocabularyService = {
            getEntries: async () => ({
                entries: [
                    { id: 'e1', label: 'Root', value: '01', identifier: '01', parent: null },
                    { id: 'e2', label: 'Broken Parent', value: '9999', identifier: '9999', parent: 'missing-parent' },
                ],
                meta: { total: 2 },
            }),
        };

        const input: FormConfigFrame = {
            name: 'test',
            componentDefinitions: [
                {
                    name: 'anzsrc',
                    component: {
                        class: 'CheckboxTreeComponent',
                        config: {
                            vocabRef: 'anzsrc-2020-for',
                            inlineVocab: true,
                        },
                    },
                    model: { class: 'CheckboxTreeModel', config: {} },
                },
            ],
        };

        const constructor = new ConstructFormConfigVisitor(logger as any);
        const constructed = constructor.start({ data: input, formMode: 'edit' });

        const visitor = new VocabInlineFormConfigVisitor(logger);
        await visitor.resolveVocabs(constructed, 'default');

        const tree = constructed.componentDefinitions?.[0] as CheckboxTreeFormComponentDefinitionOutline;
        const treeData = tree.component.config?.treeData ?? [];
        expect(treeData.map((node) => node.id)).to.deep.equal(['e1', 'e2']);
    });
});
