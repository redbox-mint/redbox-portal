import path from "path";
import { logger } from "./helpers";
import {
  MigrationV4ToV5FormConfigVisitor,
  migrateDataClassification,
  migrateFormConfigFile,
  migrateFormConfigVerify,
  reusableFormDefinitions
} from "../../src";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Migrate v4 to v5 Visitor", async () => {
  const relPath = path.relative(path.join(__dirname, 'packages/sails-ng-common'), __dirname);

  describe("full migration", async () => {
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

    // Full form config migration tests
    [
      {
        "in": "support/ng19-forms-migration/inputFiles/test-only-dataRecord-1.0-draft.js",
      },
      {
        "in": "support/ng19-forms-migration/inputFiles/test-only-tab-citation-1.0.js",
      }
    ].forEach((item: { in: string}) => {
      it(`should migrate from ${item.in}`, async function () {
        const inputFile = path.resolve(relPath, item.in);

        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const actual = await migrateFormConfigFile(visitor, inputFile);
        expect(actual.migrated).to.not.be.empty;
        expect(actual.tsContent).to.not.be.empty;

        const serialised = JSON.stringify(actual);
        expect(serialised).to.not.contain('v4ClassName "ANDSVocab"');

        await migrateFormConfigVerify(actual.migrated, logger);
      });
    });

    // Data classification to question tree migration tests.
    [
      {
        "in":"support/ng19-forms-migration/inputFiles/definition.js",
      }
    ].forEach((item: { in: string }) => {
      it(`should migrate data classification from ${item.in} to question tree config`, async function () {
        const inputFile = path.resolve(relPath, item.in);

        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const actual = migrateDataClassification(visitor, inputFile);
        expect(actual.formConfig).to.not.be.empty;
        expect(actual.migratedConfig).to.not.be.empty;

        const serialised = JSON.stringify(actual);
        expect(serialised).to.not.contain('v4ClassName "ANDSVocab"');

        await migrateFormConfigVerify(actual.formConfig, logger);
      });
    });
  });

    it("maps MarkdownTextArea to RichTextEditor with markdown output format", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "rich-text-migration",
                fields: [
                    {
                        class: "MarkdownTextArea",
                        compClass: "MarkdownTextAreaComponent",
                        definition: {
                            name: "description",
                            label: "Description",
                            rows: "6"
                        }
                    }
                ]
            }
        });

        expect((migrated.componentDefinitions ?? []).length).to.be.greaterThan(0);
        const field = (migrated.componentDefinitions ?? []).find(
            (component) => component?.name === "description"
        ) ?? migrated.componentDefinitions[0];
        expect(field.component.class).to.equal("RichTextEditorComponent");
        expect(field.model?.class).to.equal("RichTextEditorModel");
        expect((field.component.config as Record<string, unknown>)?.outputFormat).to.equal("markdown");
    });

    it("normalizes legacy top-level form css classes to rb-form classes", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "legacy-css-migration",
                viewCssClasses: "row col-md-offset-1 col-md-10",
                editCssClasses: "row col-md-12",
                fields: []
            }
        });

        expect(migrated.viewCssClasses).to.equal("redbox-form form rb-form-view");
        expect(migrated.editCssClasses).to.equal("redbox-form form rb-form-edit");
    });

    it('applies checkbox tree migration edge-case fallbacks and coercions', async function () {
        const warnings: string[] = [];
        const testLogger = {
            ...logger,
            warn: (message: unknown) => warnings.push(String(message ?? ''))
        };
        const visitor = new MigrationV4ToV5FormConfigVisitor(testLogger);
        const migrated = visitor.start({
          data: {
            name: 'checkbox-tree-edge',
            fields: [
              {
                class: 'ANDSVocab',
                compClass: 'ANDSVocabComponent',
                definition: {
                  name: 'dc:subject_anzsrc:for',
                  leafOnly: 'definitely',
                  maxDepth: 'not-a-number',
                  regex: '[',
                  value: {bad: 'shape'}
                }
              }
            ]
          }
        });
        expect(migrated.componentDefinitions).to.have.length.greaterThan(0);
        const migratedField = migrated.componentDefinitions[0];
        const migratedFieldConfig = migratedField.component.config as Record<string, unknown> | undefined;
        expect(migratedField.component.class).to.equal('CheckboxTreeComponent');
        expect(migratedFieldConfig?.vocabRef).to.equal(undefined);
        expect(migratedFieldConfig?.leafOnly).to.equal(true);
        expect(migratedFieldConfig?.maxDepth).to.equal(undefined);
        expect(migratedFieldConfig?.labelTemplate).to.equal("{{default (split notation \"/\" -1) notation}} - {{label}}");
        expect(migratedField.model?.class).to.equal('CheckboxTreeModel');
        expect(Array.isArray(migratedField.model?.config?.defaultValue)).to.equal(true);
        expect((migratedField.model?.config?.defaultValue as unknown[]).length).to.equal(0);
        expect(warnings.some((msg) => msg.includes('missing vocabId/vocabRef'))).to.equal(true);
        expect(warnings.some((msg) => msg.includes("malformed 'leafOnly'"))).to.equal(true);
        expect(warnings.some((msg) => msg.includes("invalid 'maxDepth'"))).to.equal(true);
        expect(warnings.some((msg) => msg.includes('malformed regex'))).to.equal(true);
        expect(warnings.some((msg) => msg.includes('coerced non-array default value'))).to.equal(true);
  });

    it('omits boolean defaults for legacy toggle fields migrated to CheckboxInput', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: 'legacy-toggle-migration',
                fields: [
                    {
                        class: 'Toggle',
                        compClass: 'ToggleComponent',
                        definition: {
                            name: 'embargoByDate',
                            defaultValue: false,
                            label: '@dataPublication-embargoEnabled',
                            controlType: 'checkbox'
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal('CheckboxInputComponent');
        expect(migratedField.model?.class).to.equal('CheckboxInputModel');
        expect((migratedField.model?.config as Record<string, unknown>)?.defaultValue).to.equal(undefined);
    });

    it('maps LinkValueComponent to ContentComponent with a legacy-compatible link template', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: 'link-value-migration',
                fields: [
                    {
                        class: 'LinkValueComponent',
                        definition: {
                            name: 'citation_url',
                            label: '@dataPublication-citation-url',
                            help: '@dataPublication-citation-url-help',
                            type: 'text',
                            target: '_self'
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions.find((component) => component.name === 'citation_url-link-value');
        const hiddenBindingField = migrated.componentDefinitions.find((component) => component.name === 'citation_url');
        expect(migratedField).to.not.equal(undefined);
        expect(hiddenBindingField).to.not.equal(undefined);
        const migratedFieldResolved = migratedField!;
        const hiddenBindingFieldResolved = hiddenBindingField!;
        const componentConfig = migratedFieldResolved.component.config as Record<string, unknown>;
        expect(migratedFieldResolved.name).to.equal('citation_url-link-value');
        expect(migratedFieldResolved.component.class).to.equal('ContentComponent');
        expect(migratedFieldResolved.model).to.equal(undefined);
        expect(componentConfig?.label).to.equal(undefined);
        expect((migratedFieldResolved.layout?.config as Record<string, unknown>)?.label).to.equal(undefined);
        expect(componentConfig?.content).to.deep.equal({
            label: '@dataPublication-citation-url',
            valuePath: 'citation_url',
            target: '_self'
        });
        expect(componentConfig?.template).to.equal(
            '{{#if (get formData content.valuePath "")}}<li class="key-value-pair padding-bottom-10">{{#if content.label}}<span class="key">{{t content.label}}</span>{{/if}}<span class="value"><a href="{{get formData content.valuePath ""}}" target="{{default content.target "_blank"}}">{{get formData content.valuePath ""}}</a></span></li>{{/if}}'
        );
        expect(hiddenBindingFieldResolved.name).to.equal('citation_url');
        expect(hiddenBindingFieldResolved.component.class).to.equal('SimpleInputComponent');
        expect(hiddenBindingFieldResolved.constraints?.allowModes).to.deep.equal(['view']);
        expect((hiddenBindingFieldResolved.component.config as Record<string, unknown>)?.type).to.equal('hidden');
        expect((hiddenBindingFieldResolved.component.config as Record<string, unknown>)?.visible).to.equal(false);
    });

    it('defaults migrated LinkValueComponent link targets to _blank when the legacy definition omits target', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: 'link-value-default-target-migration',
                fields: [
                    {
                        class: 'LinkValueComponent',
                        definition: {
                            name: 'landing_page',
                            label: 'Landing page',
                            type: 'text'
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions.find((component) => component.name === 'landing_page-link-value');
        expect(migratedField).to.not.equal(undefined);

        const componentConfig = migratedField!.component.config as Record<string, unknown>;
        expect(componentConfig?.content).to.deep.equal({
            label: 'Landing page',
            valuePath: 'landing_page'
        });
        expect(componentConfig?.template).to.contain('target="{{default content.target "_blank"}}"');
    });

    it('maps HtmlRawComponent to ContentComponent', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: 'html-raw-migration',
                fields: [
                    {
                        class: 'HtmlRaw',
                        compClass: 'HtmlRawComponent',
                        definition: {
                            name: 'raw_html',
                            value: '@dataPublication-data-manager'
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal('ContentComponent');
        expect(migratedField.model).to.equal(undefined);
        const componentConfig = migratedField.component.config as Record<string, unknown>;
        expect(componentConfig.content).to.equal('@dataPublication-data-manager');
        expect(componentConfig.template).to.equal('<div>{{{t content}}}</div>');
    });

    it('maps legacy VocabField to TypeaheadInput with value coercion', async function () {
        const warnings: string[] = [];
        const testLogger = {
            ...logger,
            warn: (message: unknown) => warnings.push(String(message ?? ''))
        };
        const visitor = new MigrationV4ToV5FormConfigVisitor(testLogger);
        const migrated = visitor.start({
            data: {
                name: "typeahead-edge",
                fields: [
                    {
                        class: "VocabField",
                        compClass: "VocabFieldComponent",
                        definition: {
                            name: "contributor",
                            sourceType: "query",
                            vocabQueryId: "lookup-contributor",
                            titleFieldName: "displayName",
                            storeLabelOnly: false,
                            disableEditAfterSelect: true,
                            forceClone: true
                        },
                        value: "Jane Doe"
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("TypeaheadInputComponent");
        expect(migratedField.model?.class).to.equal("TypeaheadInputModel");
        const componentConfig = migratedField.component.config as Record<string, unknown>;
        expect(componentConfig.sourceType).to.equal("namedQuery");
        expect(componentConfig.queryId).to.equal("lookup-contributor");
        expect(componentConfig.labelField).to.equal("displayName");
        expect(componentConfig.valueMode).to.equal("optionObject");
        expect(componentConfig.readOnlyAfterSelect).to.equal(true);

        const modelConfig = migratedField.model?.config as Record<string, unknown>;
        expect(modelConfig).to.not.equal(undefined);
        expect(warnings.some((msg) => msg.includes("dropped legacy property 'forceClone'"))).to.equal(true);
    });

    it('migrates static typeahead options and prefers legacy options over staticOptions', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "typeahead-static-options",
                fields: [
                    {
                        class: "VocabField",
                        compClass: "VocabFieldComponent",
                        definition: {
                            name: "contributorRole",
                            sourceType: "static",
                            titleFieldName: "name",
                            valueFieldName: "id",
                            options: [
                                "Researcher",
                                { name: "Data steward", id: "steward" },
                                { label: "Librarian", value: "librarian" }
                            ],
                            staticOptions: [
                                { label: "Should not be used", value: "ignore" }
                            ]
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("TypeaheadInputComponent");
        const componentConfig = migratedField.component.config as Record<string, unknown>;
        expect(componentConfig.sourceType).to.equal("static");

        const staticOptions = componentConfig.staticOptions as Array<Record<string, unknown>>;
        expect(staticOptions).to.deep.equal([
            { label: "Researcher", value: "Researcher" },
            { label: "Data steward", value: "steward" },
            { label: "Librarian", value: "librarian" }
        ]);
    });

    it('omits legacy ParameterRetriever fields and logs the runtime-context replacement', async function () {
        const warnings: string[] = [];
        const testLogger = {
            ...logger,
            warn: (message: unknown) => warnings.push(String(message ?? ''))
        };
        const visitor = new MigrationV4ToV5FormConfigVisitor(testLogger);
        const migrated = visitor.start({
            data: {
                name: 'parameter-retriever-migration',
                fields: [
                    {
                        class: 'ParameterRetriever',
                        compClass: 'ParameterRetrieverComponent',
                        definition: {
                            name: 'parameterRetriever',
                            label: 'Legacy Param'
                        }
                    },
                    {
                        class: 'TextField',
                        definition: {
                            name: 'title',
                            label: 'Title'
                        }
                    }
                ]
            }
        });

        expect((migrated.componentDefinitions ?? []).some((component) => component?.name === 'parameterRetriever')).to.equal(false);
        expect((migrated.componentDefinitions ?? []).some((component) => component?.name === 'title')).to.equal(true);
        expect(warnings.some((msg) => msg.includes("ParameterRetriever 'parameterRetriever'"))).to.equal(true);
        expect(warnings.some((msg) => msg.includes('requestParams runtime context'))).to.equal(true);
    });

    it('maps legacy RecordMetadataRetriever subscriptions into fetch expressions and downstream listeners', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: 'record-metadata-retriever-migration',
                fields: [
                    {
                        class: 'ParameterRetriever',
                        compClass: 'ParameterRetrieverComponent',
                        definition: {
                            name: 'parameterRetriever',
                            parameterName: 'dataRecordOid'
                        }
                    },
                    {
                        class: 'RecordMetadataRetriever',
                        compClass: 'RecordMetadataRetrieverComponent',
                        definition: {
                            name: 'dataRecordGetter',
                            subscribe: {
                                parameterRetriever: {
                                    onValueUpdate: [{ action: 'publishMetadata' }]
                                },
                                dataRecord: {
                                    relatedObjectSelected: [{ action: 'publishMetadata' }]
                                }
                            }
                        }
                    },
                    {
                        class: 'TextField',
                        definition: {
                            name: 'title',
                            subscribe: {
                                dataRecordGetter: {
                                    onValueUpdate: [
                                        {
                                            action: 'utilityService.getPropertyFromObject',
                                            field: 'title'
                                        }
                                    ]
                                }
                            }
                        }
                    }
                ]
            }
        });

        const retriever = migrated.componentDefinitions.find((component) => component.name === 'dataRecordGetter');
        expect(retriever?.component.class).to.equal('RecordMetadataRetrieverComponent');
        expect(retriever?.model).to.equal(undefined);
        expect(retriever?.component?.config?.visible).to.equal(false);
        expect(retriever?.component?.config?.label).to.equal(undefined);
        expect(retriever?.layout?.config?.visible).to.equal(false);
        expect(retriever?.layout?.config?.label).to.equal(undefined);
        expect(retriever?.expressions).to.deep.include({
            name: 'fetchOnFormReady-dataRecordOid',
            description: 'Fetch metadata on form load using request params',
            config: {
                runOnFormReady: true,
                conditionKind: 'jsonata_query',
                condition: '$exists(runtimeContext.requestParams.dataRecordOid)',
                operation: 'fetchMetadata',
                hasTemplate: true,
                template: 'runtimeContext.requestParams.dataRecordOid'
            }
        });
        expect(retriever?.expressions).to.deep.include({
            name: 'fetchOnRelatedObjectSelected-dataRecord',
            description: 'Fetch metadata when dataRecord changes',
            config: {
                conditionKind: 'jsonpointer',
                runOnFormReady: false,
                condition: '/dataRecord::field.value.changed',
                operation: 'fetchMetadata',
                hasTemplate: true,
                template: '$exists(event.value.oid) ? event.value.oid : ($exists(event.value.redboxOid) ? event.value.redboxOid : event.value)'
            }
        });

        const titleField = migrated.componentDefinitions.find((component) => component.name === 'title');
        expect(titleField?.expressions).to.deep.include({
            name: 'dataRecordGetter-title-title',
            description: 'Populate title from dataRecordGetter metadata',
            config: {
                conditionKind: 'jsonpointer',
                runOnFormReady: false,
                condition: '/dataRecordGetter::field.value.changed',
                target: 'model.value',
                hasTemplate: true,
                template: 'event.value.title'
            }
        });
    });

    it('migrates legacy PDFList fields to PDFListComponent and survives visitor verification', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: 'pdf-list-migration',
                fields: [
                    {
                        class: 'PDFList',
                        compClass: 'PDFListComponent',
                        definition: {
                            name: 'planPdf',
                            startsWith: 'rdmp-pdf',
                            showVersionColumn: true,
                            versionColumnValueField: 'planVersion',
                            versionColumnLabelKey: 'Version ',
                            useVersionLabelForFileName: true,
                            downloadBtnLabel: '@download-current',
                            downloadPreviousBtnLabel: '@download-previous',
                            downloadPrefix: 'rdmp',
                            fileNameTemplate: '<%= versionLabel %>.pdf',
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        const componentConfig = migratedField.component.config as Record<string, unknown>;

        expect(migratedField.component.class).to.equal('PDFListComponent');
        expect(migratedField.model?.class).to.equal('PDFListModel');
        expect(componentConfig?.startsWith).to.equal('rdmp-pdf');
        expect(componentConfig?.showVersionColumn).to.equal(true);
        expect(componentConfig?.versionColumnValueField).to.equal('planVersion');
        expect(componentConfig?.versionColumnLabelKey).to.equal('Version ');
        expect(componentConfig?.useVersionLabelForFileName).to.equal(true);
        expect(componentConfig?.downloadBtnLabel).to.equal('@download-current');
        expect(componentConfig?.downloadPreviousBtnLabel).to.equal('@download-previous');
        expect(componentConfig?.downloadPrefix).to.equal('rdmp');
        expect(componentConfig?.fileNameTemplate).to.equal('<%= versionLabel %>.pdf');
        expect(migratedField.layout?.config?.label).to.equal(undefined);

        await migrateFormConfigVerify(migrated, logger);
    });

    it('maps legacy RecordMetadataRetriever request-param fetch expressions inside tab content containers', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: 'record-metadata-retriever-tab-migration',
                fields: [
                    {
                        class: 'TabOrAccordionContainer',
                        compClass: 'TabOrAccordionContainerComponent',
                        definition: {
                            id: 'main_tab',
                            label: 'Main tab',
                            fields: [
                                {
                                    class: 'Container',
                                    definition: {
                                        id: 'aim',
                                        label: 'Aim',
                                        fields: [
                                            {
                                                class: 'ParameterRetriever',
                                                compClass: 'ParameterRetrieverComponent',
                                                definition: {
                                                    name: 'parameterRetriever',
                                                    parameterName: 'rdmpOid'
                                                }
                                            },
                                            {
                                                class: 'TextField',
                                                definition: {
                                                    name: 'rdmp'
                                                }
                                            },
                                            {
                                                class: 'RecordMetadataRetriever',
                                                compClass: 'RecordMetadataRetrieverComponent',
                                                definition: {
                                                    name: 'rdmpGetter',
                                                    subscribe: {
                                                        parameterRetriever: {
                                                            onValueUpdate: [{ action: 'publishMetadata' }]
                                                        },
                                                        rdmp: {
                                                            relatedObjectSelected: [{ action: 'publishMetadata' }]
                                                        }
                                                    }
                                                }
                                            },
                                            {
                                                class: 'TextField',
                                                definition: {
                                                    name: 'aim_project_name',
                                                    subscribe: {
                                                        rdmpGetter: {
                                                            onValueUpdate: [
                                                                {
                                                                    action: 'utilityService.getPropertyFromObject',
                                                                    field: 'title'
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        });

        const findByName = (components: any[], name: string): any => {
            for (const component of components ?? []) {
                if (component?.name === name) {
                    return component;
                }
                const nestedTabs = component?.component?.config?.tabs ?? [];
                const nestedTabHit = findByName(nestedTabs, name);
                if (nestedTabHit) {
                    return nestedTabHit;
                }
                const nestedComponents = component?.component?.config?.componentDefinitions ?? [];
                const nestedComponentHit = findByName(nestedComponents, name);
                if (nestedComponentHit) {
                    return nestedComponentHit;
                }
            }
            return undefined;
        };

        const findPointerByName = (components: any[], name: string, parentPointer = ''): string | undefined => {
            for (const component of components ?? []) {
                const currentPointer = `${parentPointer}/${component?.name}`;
                if (component?.name === name) {
                    return currentPointer;
                }
                const nestedTabs = component?.component?.config?.tabs ?? [];
                const nestedTabHit = findPointerByName(nestedTabs, name, currentPointer);
                if (nestedTabHit) {
                    return nestedTabHit;
                }
                const nestedComponents = component?.component?.config?.componentDefinitions ?? [];
                const nestedComponentHit = findPointerByName(nestedComponents, name, currentPointer);
                if (nestedComponentHit) {
                    return nestedComponentHit;
                }
            }
            return undefined;
        };

        const retriever = findByName(migrated.componentDefinitions as any[], 'rdmpGetter');
        const targetField = findByName(migrated.componentDefinitions as any[], 'aim_project_name');
        const retrieverPointer = findPointerByName(migrated.componentDefinitions as any[], 'rdmpGetter');
        const sourcePointer = findPointerByName(migrated.componentDefinitions as any[], 'rdmp');

        expect(retriever?.component.class).to.equal('RecordMetadataRetrieverComponent');
        expect(retriever?.component?.config?.visible).to.equal(false);
        expect(retriever?.component?.config?.label).to.equal(undefined);
        expect(retriever?.layout?.config?.visible).to.equal(false);
        expect(retriever?.layout?.config?.label).to.equal(undefined);
        expect(retriever?.expressions).to.deep.include({
            name: 'fetchOnFormReady-rdmpOid',
            description: 'Fetch metadata on form load using request params',
            config: {
                runOnFormReady: true,
                conditionKind: 'jsonata_query',
                condition: '$exists(runtimeContext.requestParams.rdmpOid)',
                operation: 'fetchMetadata',
                hasTemplate: true,
                template: 'runtimeContext.requestParams.rdmpOid'
            }
        });
        expect(retriever?.expressions).to.deep.include({
            name: 'fetchOnRelatedObjectSelected-rdmp',
            description: 'Fetch metadata when rdmp changes',
            config: {
                conditionKind: 'jsonpointer',
                runOnFormReady: false,
                condition: `${sourcePointer}::field.value.changed`,
                operation: 'fetchMetadata',
                hasTemplate: true,
                template: '$exists(event.value.oid) ? event.value.oid : ($exists(event.value.redboxOid) ? event.value.redboxOid : event.value)'
            }
        });
        expect(targetField?.expressions).to.deep.include({
            name: 'rdmpGetter-aim_project_name-title',
            description: 'Populate aim_project_name from rdmpGetter metadata',
            config: {
                conditionKind: 'jsonpointer',
                runOnFormReady: false,
                condition: `${retrieverPointer}::field.value.changed`,
                target: 'model.value',
                hasTemplate: true,
                template: 'event.value.title'
            }
        });
    });

    it('omits the form-ready RecordMetadataRetriever fetch expression when parameter metadata is missing', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: 'record-metadata-retriever-without-parameter',
                fields: [
                    {
                        class: 'RecordMetadataRetriever',
                        compClass: 'RecordMetadataRetrieverComponent',
                        definition: {
                            name: 'rdmpGetter',
                            subscribe: {
                                parameterRetriever: {
                                    onValueUpdate: [{ action: 'publishMetadata' }]
                                }
                            }
                        }
                    }
                ]
            }
        });

        const retriever = migrated.componentDefinitions.find((component) => component.name === 'rdmpGetter');
        const expressions = retriever?.expressions ?? [];
        expect(expressions.some((expr) => expr.name.startsWith('fetchOnFormReady-'))).to.equal(false);
    });

    it('maps RepeatableVocabComponent to RepeatableComponent with Typeahead elementTemplate', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "repeatable-vocab-edge",
                fields: [
                    {
                        class: "RepeatableContainer",
                        compClass: "RepeatableVocabComponent",
                        definition: {
                            name: "foaf:fundedBy_foaf:Agent",
                            label: "@dmpt-foaf:fundedBy_foaf:Agent",
                            help: "@dmpt-foaf:fundedBy_foaf:Agent-help",
                            fields: [
                                {
                                    class: "VocabField",
                                    definition: {
                                        disableEditAfterSelect: false,
                                        vocabQueryId: "fundingBody",
                                        sourceType: "query",
                                        titleFieldArr: ["dc_description"],
                                        stringLabelToField: "dc_description",
                                        placeHolder: "@lookup-placeholder-text"
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("RepeatableComponent");
        expect(migratedField.model?.class).to.equal("RepeatableModel");

        const repeatableConfig = migratedField.component.config as Record<string, unknown>;
        const elementTemplate = repeatableConfig.elementTemplate as Record<string, unknown>;
        expect(elementTemplate).to.not.equal(undefined);
        expect(elementTemplate.name).to.equal("");
        expect((elementTemplate.component as Record<string, unknown>).class).to.equal("TypeaheadInputComponent");
        expect((elementTemplate.model as Record<string, unknown>).class).to.equal("TypeaheadInputModel");
        expect((elementTemplate.layout as Record<string, unknown>).class).to.equal("RepeatableElementLayout");

        const typeaheadConfig = (elementTemplate.component as Record<string, unknown>).config as Record<string, unknown>;
        expect(typeaheadConfig.sourceType).to.equal("namedQuery");
        expect(typeaheadConfig.queryId).to.equal("fundingBody");
        expect(typeaheadConfig.labelField).to.equal("dc_description");
    });

    it('maps legacy external VocabField to external TypeaheadInput config', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "typeahead-external",
                fields: [
                    {
                        class: "VocabField",
                        compClass: "VocabFieldComponent",
                        definition: {
                            name: "dc:coverage_dc:identifier",
                            sourceType: "external",
                            provider: "geonamesCountries",
                            resultArrayProperty: "response.docs",
                            titleFieldArr: ["utf8_name"],
                            fieldNames: ["utf8_name"],
                            stringLabelToField: "utf8_name"
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("TypeaheadInputComponent");
        const componentConfig = migratedField.component.config as Record<string, unknown>;
        expect(componentConfig.sourceType).to.equal("external");
        expect(componentConfig.provider).to.equal("geonamesCountries");
        expect(componentConfig.resultArrayProperty).to.equal("response.docs");
        expect(componentConfig.labelField).to.equal("utf8_name");
        expect(componentConfig.valueField).to.equal("utf8_name");
    });

    it('maps RepeatableContributor layout label from definition name when label is missing on both parent and child', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "repeatable-contributor-label-fallback",
                fields: [
                    {
                        class: "RepeatableContributor",
                        compClass: "RepeatableContributorComponent",
                        definition: {
                            name: "contributor_oi",
                            fields: [
                                {
                                    class: "ContributorField",
                                    definition: {
                                        help: "@dmpt-people-tab-otherdatacreators-help",
                                        nameColHdr: "@dmpt-people-tab-name-hdr",
                                        emailColHdr: "@dmpt-people-tab-email-hdr",
                                        orcidColHdr: "@dmpt-people-tab-orcid-hdr",
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("RepeatableComponent");
        expect(migratedField.layout?.class).to.equal("DefaultLayout");
        expect((migratedField.layout?.config as Record<string, unknown>)?.label).to.equal("contributor_oi");
    });

    it('maps RepeatableContributor layout label from inner field label when parent label is missing', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "repeatable-contributor-label-inner-fallback",
                fields: [
                    {
                        class: "RepeatableContributor",
                        compClass: "RepeatableContributorComponent",
                        definition: {
                            name: "contributor_oi",
                            fields: [
                                {
                                    class: "ContributorField",
                                    definition: {
                                        label: "@dmpt-people-tab-otherdatacreators",
                                        help: "@dmpt-people-tab-otherdatacreators-help",
                                        nameColHdr: "@dmpt-people-tab-name-hdr",
                                        emailColHdr: "@dmpt-people-tab-email-hdr",
                                        orcidColHdr: "@dmpt-people-tab-orcid-hdr",
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("RepeatableComponent");
        expect(migratedField.layout?.class).to.equal("DefaultLayout");
        expect((migratedField.layout?.config as Record<string, unknown>)?.label).to.equal("@dmpt-people-tab-otherdatacreators");
    });

    it('maps legacy ContributorField with forceLookupOnly to the lookup-only reusable definition', async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "contributor-force-lookup-only",
                fields: [
                    {
                        class: "ContributorField",
                        definition: {
                            name: "contributor_ci",
                            forceLookupOnly: true
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("ReusableComponent");
        expect(migratedField.overrides).to.deep.equal({
            reusableFormName: "standard-contributor-fields-lookup-only-group"
        });
        expect(migratedField.layout).to.equal(undefined);
    });

    it('defines lookup-only contributor reusable fields with required selection and readonly email', async function () {
        const lookupOnlyFields = reusableFormDefinitions["standard-contributor-fields-lookup-only"];
        expect(lookupOnlyFields).to.have.length(3);

        const nameField = lookupOnlyFields[0];
        const emailField = lookupOnlyFields[1];
        expect((nameField.component?.config as Record<string, unknown>)?.requireSelection).to.equal(true);
        expect((emailField.component?.config as Record<string, unknown>)?.readonly).to.equal(true);

        const withTitleGroup = reusableFormDefinitions["standard-contributor-fields-with-title-lookup-only-group"];
        expect(withTitleGroup).to.have.length(1);
        expect(
            ((withTitleGroup[0].component?.config as Record<string, unknown>)?.componentDefinitions as Array<Record<string, unknown>>)?.[0]?.overrides
        ).to.deep.equal({
            reusableFormName: "standard-contributor-fields-with-title-lookup-only"
        });
    });

    it("maps legacy MapField to MapComponent and normalizes config/value", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "map-migration",
                fields: [
                    {
                        class: "MapField",
                        compClass: "MapComponent",
                        definition: {
                            name: "map_coverage",
                            leafletOptions: {
                                center: [-24.67, 134.07],
                                zoom: 5
                            },
                            drawOptions: {
                                draw: {
                                    marker: {},
                                    polygon: {},
                                    polyline: false,
                                    rectangle: {}
                                },
                                edit: {}
                            }
                        },
                        value: {}
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("MapComponent");
        expect(migratedField.model?.class).to.equal("MapModel");
        const componentConfig = migratedField.component.config as Record<string, unknown>;
        expect(componentConfig.center).to.deep.equal([-24.67, 134.07]);
        expect(componentConfig.zoom).to.equal(5);
        expect(componentConfig.enabledModes).to.deep.equal(["point", "polygon", "rectangle", "select"]);
        const modelConfig = migratedField.model?.config as Record<string, unknown>;
        expect(modelConfig.defaultValue).to.deep.equal({
            type: "FeatureCollection",
            features: []
        });
    });

    it("migrates ButtonBarContainer as expected", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "button-bar-migration",
                fields: [
                    {
                        class: "ButtonBarContainer",
                        compClass: "ButtonBarContainerComponent",
                        definition: {
                            name: "buttons",
                            fields: [
                                {
                                    class: "SaveButton",
                                    definition: { name: "save" }
                                },
                                {
                                    class: "Spacer",
                                    definition: { name: "spacer" }
                                },
                                {
                                    class: "CancelButton",
                                    definition: { name: "cancel" }
                                }
                            ]
                        }
                    }
                ]
            }
        });

        expect(migrated.componentDefinitions).to.have.length.greaterThan(0);
        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("GroupComponent");
        expect(migratedField.model?.class).to.equal("GroupModel");
        expect(migratedField.layout?.class).to.equal("ActionRowLayout");

        const componentConfig = migratedField.component.config as Record<string, unknown>;
        expect(componentConfig.hostCssClasses).to.be.undefined;

        const childComponents = componentConfig.componentDefinitions as any[];
        expect(childComponents).to.have.length(2);
        expect(childComponents[0].name).to.equal("save");
        expect(childComponents[0].layout?.class).to.equal("InlineLayout");
        expect(childComponents[0].layout?.config?.label).to.be.undefined;
        expect(childComponents[1].name).to.equal("cancel");
        expect(childComponents[1].layout?.class).to.equal("InlineLayout");
        expect(childComponents[1].layout?.config?.label).to.be.undefined;
        expect(childComponents.find(c => c.name === "spacer")).to.be.undefined;

        const modelConfig = migratedField.model?.config as Record<string, unknown>;
        expect(modelConfig.disabled).to.be.true;
    });

    it("migrates SaveButton targetStep into the v5 component config", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "save-button-target-step-migration",
                fields: [
                    {
                        class: "SaveButton",
                        definition: {
                            name: "save-and-submit",
                            targetStep: "queued"
                        }
                    }
                ]
            }
        });

        expect(migrated.componentDefinitions).to.have.length.greaterThan(0);
        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("SaveButtonComponent");
        expect((migratedField.component.config as Record<string, unknown>)?.targetStep).to.equal("queued");
    });

    it("maps AnchorOrButton links to ContentComponent anchor links with InlineLayout", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "anchor-or-button-migration",
                fields: [
                    {
                        class: "Container",
                        compClass: "GenericGroupComponent",
                        definition: {
                            name: "link_group",
                            fields: [
                                {
                                    class: "AnchorOrButton",
                                    definition: {
                                        name: "edit_link",
                                        label: "@dmp-edit-record-link",
                                        value: "/@branding/@portal/record/edit/@oid",
                                        cssClasses: "btn btn-info",
                                        controlType: "anchor"
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        });

        const group = migrated.componentDefinitions[0];
        const groupConfig = group.component.config as Record<string, unknown>;
        const childComponents = groupConfig.componentDefinitions as any[];
        expect(childComponents).to.have.length(1);
        expect(childComponents[0].component.class).to.equal("ContentComponent");
        expect(childComponents[0].component.config?.label).to.be.undefined;
        expect(childComponents[0].component.config?.template).to.equal(
          '<a href="{{concat "/" branding "/" portal "/record/edit/" oid}}" class="{{content.cssClasses}}">{{t content.label}}</a>'
        );
        expect(childComponents[0].layout?.class).to.equal("InlineLayout");
    });

    it("maps legacy delete button redirectLocation tokens to a Handlebars template", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "delete-button-migration",
                fields: [
                    {
                        class: "SaveButton",
                        definition: {
                            name: "confirmDelete",
                            label: "Delete this record",
                            closeOnSave: true,
                            redirectLocation: "/@branding/@portal/dashboard/dataPublication",
                            isDelete: true
                        }
                    }
                ]
            }
        });

        expect(migrated.componentDefinitions[0].component.class).to.equal("DeleteButtonComponent");
        const deleteButtonConfig = migrated.componentDefinitions[0].component.config as any;
        expect(deleteButtonConfig?.closeOnDelete).to.be.true;
        expect(deleteButtonConfig?.redirectLocation).to.equal(
          '{{concat "/" branding "/" portal "/dashboard/dataPublication"}}'
        );
    });

    it("maps legacy form-inline groups to ActionRowLayout with InlineLayout children", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "inline-group-migration",
                fields: [
                    {
                        class: "Container",
                        compClass: "GenericGroupComponent",
                        definition: {
                            name: "actions",
                            cssClasses: "form-inline",
                            fields: [
                                {
                                    class: "AnchorOrButton",
                                    definition: {
                                        name: "edit_link",
                                        label: "@dmp-edit-record-link"
                                    }
                                },
                                {
                                    class: "PDFList",
                                    definition: {
                                        name: "pdf"
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        });

        const group = migrated.componentDefinitions[0];
        const groupConfig = group.component.config as Record<string, unknown>;
        const childComponents = groupConfig.componentDefinitions as any[];

        expect(group.layout?.class).to.equal("ActionRowLayout");
        const groupLayoutConfig = (group.layout?.config ?? {}) as Record<string, unknown>;
        expect(groupLayoutConfig.alignment).to.equal("start");
        expect(groupLayoutConfig.compact).to.equal(true);
        expect(groupLayoutConfig.containerCssClass).to.contain("rb-form-action-row--legacy-inline");
        expect(group.overrides?.formModeClasses?.view?.component).to.equal("GroupComponent");
        expect(childComponents).to.have.length(2);
        expect(childComponents[0].layout?.class).to.equal("InlineLayout");
        expect(childComponents[1].layout?.class).to.equal("InlineLayout");
    });

    it("uses Handlebars translation helper for migrated TextBlock translation keys", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "text-block-translation-key",
                fields: [
                    {
                        class: "Container",
                        compClass: "TextBlockComponent",
                        definition: {
                            name: "welcome_text",
                            value: "@dmpt-welcome-par2"
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("ContentComponent");
        const componentConfig = migratedField.component.config as Record<string, unknown>;
        expect(componentConfig.content).to.equal("@dmpt-welcome-par2");
        expect(componentConfig.template).to.equal("<div>{{{t content}}}</div>");
    });

    it("uses heading wrapper from TextBlock type for heading content", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "text-block-heading-type",
                fields: [
                    {
                        class: "Container",
                        compClass: "TextBlockComponent",
                        definition: {
                            name: "welcome_heading",
                            value: "@dmpt-welcome-heading",
                            type: "h3"
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("ContentComponent");
        const componentConfig = migratedField.component.config as Record<string, unknown>;
        expect(componentConfig.content).to.equal("@dmpt-welcome-heading");
        expect(componentConfig.template).to.equal("<h3>{{t content}}</h3>");
    });

    it("binds TextBlock heading content from formData when value is missing and definition.name is present", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "text-block-heading-name-binding",
                fields: [
                    {
                        class: "Container",
                        compClass: "TextBlockComponent",
                        viewOnly: true,
                        definition: {
                            name: "title",
                            type: "h1"
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        const hiddenBindingField = migrated.componentDefinitions[1];
        expect(migratedField.component.class).to.equal("ContentComponent");
        const componentConfig = migratedField.component.config as Record<string, unknown>;
        const layoutConfig = migratedField.layout?.config as Record<string, unknown> | undefined;
        expect(migratedField.name).to.not.equal("title");
        expect(componentConfig.content).to.equal("title");
        expect(componentConfig.template).to.equal('<h1>{{get formData content ""}}</h1>');
        expect(layoutConfig?.label).to.equal(undefined);
        expect(hiddenBindingField.name).to.equal("title");
        expect(hiddenBindingField.component.class).to.equal("SimpleInputComponent");
        expect((hiddenBindingField.constraints as Record<string, unknown>)?.allowModes).to.deep.equal(["view"]);
        expect(
            ((hiddenBindingField.constraints as Record<string, unknown>)?.authorization as Record<string, unknown>)?.allowRoles
        ).to.deep.equal([]);
        expect((hiddenBindingField.component.config as Record<string, unknown>)?.type).to.equal("hidden");
        expect((hiddenBindingField.component.config as Record<string, unknown>)?.visible).to.equal(false);
        expect((hiddenBindingField.layout?.config as Record<string, unknown>)?.visible).to.equal(false);
    });

    it("maps view-only markdown text areas to ContentComponent in view overrides", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "markdown-view-only",
                fields: [
                    {
                        class: "MarkdownTextArea",
                        viewOnly: true,
                        definition: {
                            name: "description",
                            label: "Description"
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("RichTextEditorComponent");
        expect((migratedField.component.config as Record<string, unknown>)?.outputFormat).to.equal("markdown");
        expect((migratedField.constraints as Record<string, unknown>)?.allowModes).to.deep.equal(["view"]);
        expect(migratedField.overrides?.formModeClasses?.view?.component).to.equal("ContentComponent");
    });

    it("keeps plain text TextBlock values as non-translated content templates", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "text-block-plain-text",
                fields: [
                    {
                        class: "Container",
                        compClass: "TextBlockComponent",
                        definition: {
                            name: "welcome_text_plain",
                            value: "Welcome to the form"
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("ContentComponent");
        const componentConfig = migratedField.component.config as Record<string, unknown>;
        expect(componentConfig.content).to.equal("Welcome to the form");
        expect(componentConfig.template).to.equal("<div>{{{content}}}</div>");
    });

    it("promotes legacy TextBlock span label/help blocks into layout label config", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "text-block-span-label-help",
                fields: [
                    {
                        class: "Container",
                        compClass: "TextBlockComponent",
                        definition: {
                            value: "@dmpt-people-tab-ci",
                            help: "@dmpt-people-tab-ci-help",
                            type: "span",
                            cssClasses: "label-font"
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("ContentComponent");
        const componentConfig = migratedField.component.config as Record<string, unknown>;
        const layoutConfig = migratedField.layout?.config as Record<string, unknown>;

        expect(componentConfig.content).to.equal("");
        expect(layoutConfig.label).to.equal("@dmpt-people-tab-ci");
        expect(layoutConfig.helpText).to.equal("@dmpt-people-tab-ci-help");
        expect(layoutConfig.cssClassesMap).to.deep.equal({ label: "label-font" });
    });

    it("populates attachmentFields from FileUpload components", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "attachment-fields-migration",
                fields: [
                    {
                        class: "DataLocation",
                        compClass: "DataLocationComponent",
                        definition: {
                            name: "dataLocations"
                        }
                    },
                    {
                        class: "RelatedFileUpload",
                        compClass: "RelatedFileUploadComponent",
                        definition: {
                            name: "attachments"
                        }
                    },
                    {
                        class: "TextField",
                        definition: {
                            name: "title"
                        }
                    }
                ]
            }
        });

        expect(migrated.attachmentFields).to.be.an("array");
        expect(migrated.attachmentFields).to.include("dataLocations");
        expect(migrated.attachmentFields).to.include("attachments");
        expect(migrated.attachmentFields).to.not.include("title");
        expect(migrated.attachmentFields?.length).to.equal(2);
    });

    it("maps legacy DataLocation to DataLocationComponent with config fields", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "data-location-migration",
                fields: [
                    {
                        class: "DataLocation",
                        compClass: "DataLocationComponent",
                        definition: {
                            name: "dataLocations",
                            allowUploadWithoutSave: true,
                            locationAddText: "Add another location",
                            typeHeader: "Type",
                            locationHeader: "Where",
                            notesHeader: "Notes",
                            columns: ["type", "location"],
                            notesEnabled: true,
                            iscEnabled: true,
                            defaultSelect: "official",
                            securityClassificationOptions: [
                                { label: "Official", value: "official" }
                            ]
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("DataLocationComponent");
        expect(migratedField.model?.class).to.equal("DataLocationModel");
        expect(migratedField.component.config).to.deep.include({
            allowUploadWithoutSave: true,
            locationAddText: "Add another location",
            typeHeader: "Type",
            locationHeader: "Where",
            notesHeader: "Notes",
            notesEnabled: true,
            iscEnabled: true,
            defaultSelect: "official"
        });
        expect((migratedField.component.config as any).columns).to.deep.equal(["type", "location"]);
        expect((migratedField.component.config as any).securityClassificationOptions).to.deep.equal([
            { label: "Official", value: "official" }
        ]);
    });

    it("maps legacy PublishDataLocationSelector to the v5 selector component", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "publish-data-location-selector-migration",
                fields: [
                    {
                        class: "PublishDataLocationSelector",
                        compClass: "PublishDataLocationSelectorComponent",
                        definition: {
                            name: "dataLocations",
                            iscEnabled: true,
                            notesEnabled: true,
                            typeHeader: "Type",
                            locationHeader: "Location",
                            notesHeader: "Notes",
                            selectionCriteria: [{ isc: "public", type: "attachment" }],
                            subscribe: {
                                dataRecordGetter: {
                                    onValueUpdate: [
                                        { action: "utilityService.getPropertyFromObject", field: "dataLocations" }
                                    ]
                                },
                                dataPubLocationRefresher: {
                                    onValueUpdate: [
                                        { action: "utilityService.getPropertyFromObject", field: "dataLocations" }
                                    ]
                                }
                            }
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("PublishDataLocationSelectorComponent");
        expect(migratedField.model?.class).to.equal("PublishDataLocationSelectorModel");
        expect(migratedField.component.config).to.deep.include({
            iscEnabled: true,
            notesEnabled: true,
            typeHeader: "Type",
            locationHeader: "Location",
            notesHeader: "Notes",
        });
        expect((migratedField.component.config as any).selectionCriteria).to.deep.equal([{ isc: "public", type: "attachment" }]);
        expect(migratedField.expressions).to.deep.include.members([
            {
                name: "dataRecordGetter-dataLocations-dataLocations",
                description: "Populate dataLocations from dataRecordGetter metadata",
                config: {
                    conditionKind: "jsonpointer",
                    runOnFormReady: false,
                    condition: "/dataRecordGetter::field.value.changed",
                    target: "model.value",
                    hasTemplate: true,
                    template: "event.value.dataLocations",
                },
            },
            {
                name: "dataPubLocationRefresher-dataLocations-dataLocations",
                description: "Populate dataLocations from dataPubLocationRefresher metadata",
                config: {
                    conditionKind: "jsonpointer",
                    runOnFormReady: false,
                    condition: "/dataPubLocationRefresher::field.value.changed",
                    target: "model.value",
                    hasTemplate: true,
                    template: "event.value.dataLocations",
                },
            },
        ]);
    });

    it("uses the enclosing container path for migrated publish data location selector expressions", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "publish-data-location-selector-nested-migration",
                fields: [
                    {
                        class: "Container",
                        definition: {
                            id: "tab_data",
                            fields: [
                                {
                                    class: "RecordMetadataRetriever",
                                    compClass: "RecordMetadataRetrieverComponent",
                                    definition: {
                                        name: "dataRecordGetter",
                                    }
                                },
                                {
                                    class: "PublishDataLocationSelector",
                                    compClass: "PublishDataLocationSelectorComponent",
                                    definition: {
                                        name: "dataLocations",
                                        subscribe: {
                                            dataRecordGetter: {
                                                onValueUpdate: [
                                                    { action: "utilityService.getPropertyFromObject", field: "dataLocations" }
                                                ]
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        });

        const container = migrated.componentDefinitions[0];
        expect(container.component.class).to.equal("GroupComponent");
        const nestedField = (container.component.config as any).componentDefinitions.find(
            (component: Record<string, any>) => component.name === "dataLocations"
        );
        expect(nestedField).to.not.equal(undefined);
        expect(nestedField.expressions).to.deep.include({
            name: "dataRecordGetter-dataLocations-dataLocations",
            description: "Populate dataLocations from dataRecordGetter metadata",
            config: {
                conditionKind: "jsonpointer",
                runOnFormReady: false,
                condition: "/tab_data/dataRecordGetter::field.value.changed",
                target: "model.value",
                hasTemplate: true,
                template: "event.value.dataLocations",
            },
        });
    });

    it("resolves cross-tab publish data location selector sources to their real component path", async function () {
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "publish-data-location-selector-cross-tab-migration",
                fields: [
                    {
                        class: "TabOrAccordionContainer",
                        compClass: "TabOrAccordionContainerComponent",
                        definition: {
                            id: "mainTab",
                            fields: [
                                {
                                    class: "Container",
                                    definition: {
                                        id: "about",
                                        fields: [
                                            {
                                                class: "RecordMetadataRetriever",
                                                compClass: "RecordMetadataRetrieverComponent",
                                                definition: {
                                                    name: "dataRecordGetter",
                                                }
                                            }
                                        ]
                                    }
                                },
                                {
                                    class: "Container",
                                    definition: {
                                        id: "data",
                                        fields: [
                                            {
                                                class: "PublishDataLocationSelector",
                                                compClass: "PublishDataLocationSelectorComponent",
                                                definition: {
                                                    name: "dataLocations",
                                                    subscribe: {
                                                        dataRecordGetter: {
                                                            onValueUpdate: [
                                                                { action: "utilityService.getPropertyFromObject", field: "dataLocations" }
                                                            ]
                                                        }
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        });

        const mainTab = migrated.componentDefinitions[0];
        expect(mainTab.component.class).to.equal("TabComponent");
        const dataTab = ((mainTab.component.config as any).tabs as Array<Record<string, any>>).find(
            (component) => component.name === "data"
        );
        expect(dataTab).to.not.equal(undefined);
        const nestedField = (dataTab!.component.config as any).componentDefinitions.find(
            (component: Record<string, any>) => component.name === "dataLocations"
        );
        expect(nestedField).to.not.equal(undefined);
        expect(nestedField.expressions).to.deep.include.members([
            {
                name: "dataRecordGetter-dataLocations-dataLocations",
                description: "Populate dataLocations from dataRecordGetter metadata",
                config: {
                    conditionKind: "jsonpointer",
                    runOnFormReady: false,
                    condition: "/mainTab/about/dataRecordGetter::field.value.changed",
                    target: "model.value",
                    hasTemplate: true,
                    template: "event.value.dataLocations",
                },
            }
        ]);
    });

    it("maps legacy PublishDataLocationRefresh to the v5 refresh component", async function () {
        // The migrated output must keep the button semantics without carrying
        // forward the old imperative-fetch implementation details.
        const visitor = new MigrationV4ToV5FormConfigVisitor(logger);
        const migrated = visitor.start({
            data: {
                name: "publish-data-location-refresh-migration",
                fields: [
                    {
                        class: "PublishDataLocationRefresh",
                        compClass: "PublishDataLocationRefreshComponent",
                        definition: {
                            name: "dataPubLocationRefresherTrigger",
                            label: "@refresh-attachments-text"
                        }
                    }
                ]
            }
        });

        const migratedField = migrated.componentDefinitions[0];
        expect(migratedField.component.class).to.equal("PublishDataLocationRefreshComponent");
        expect(migratedField.model).to.equal(undefined);
        expect((migratedField.component.config as Record<string, unknown>).label).to.equal("@refresh-attachments-text");
    });
});
