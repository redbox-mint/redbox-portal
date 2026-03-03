import path from "path";
import { logger } from "./helpers";
import {
  MigrationV4ToV5FormConfigVisitor,
  migrateDataClassification,
  migrateFormConfigFile,
  migrateFormConfigVerify
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

    it("maps AnchorOrButton links to SaveButton with InlineLayout", async function () {
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
                                        label: "@dmp-edit-record-link"
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
        expect(childComponents[0].component.class).to.equal("SaveButtonComponent");
        expect(childComponents[0].layout?.class).to.equal("InlineLayout");
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
});
