import {MigrationV4ToV5FormConfigVisitor} from "../../src/config/visitor/migrate-config-v4-v5.visitor";
import fs from "fs";
import path from "path";
import {logger} from "./helpers";
import {
    ClientFormConfigVisitor,
    ConstructFormConfigVisitor, formValidatorsSharedDefinitions, ReusableFormDefinitions,
    TemplateFormConfigVisitor,
    ValidatorFormConfigVisitor
} from "../../src";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

const reusableFormDefinitions: ReusableFormDefinitions = {
    "standard-contributor-fields": [
        {
            name: "name",
            component: {class: "SimpleInputComponent", config: {type: "text", hostCssClasses: ""}},
            model: {class: "SimpleInputModel", config: {}},
            layout: {class: "DefaultLayout", config: {label: "Name", hostCssClasses: "col-md-4 mb-3"}},
        },
        {
            name: "email",
            component: {class: "SimpleInputComponent", config: {type: "text", hostCssClasses: ""}},
            model: {class: "SimpleInputModel", config: {validators: [{class: "email"}]}},
            layout: {class: "DefaultLayout", config: {label: "Email", hostCssClasses: "col-md-4 mb-3"}},
        },
        {
            name: "orcid",
            component: {class: "SimpleInputComponent", config: {type: "text", hostCssClasses: ""}},
            model: {class: "SimpleInputModel", config: {validators: [{class: "orcid"}]}},
            layout: {class: "DefaultLayout", config: {label: "ORCID", hostCssClasses: "col-md-4 mb-3"}},
        },
    ],
    "standard-contributor-fields-group": [
        {
            name: "standard_contributor_fields_group",
            layout: {class: "DefaultLayout", config: {label: "Standard Contributor"}},
            model: {class: "GroupModel", config: {}},
            component: {
                class: "GroupComponent",
                config: {
                    hostCssClasses: "row g-3",
                    componentDefinitions: [
                        {
                            overrides: {reusableFormName: "standard-contributor-fields"},
                            name: "standard_contributor_fields_reusable",
                            component: {class: "ReusableComponent", config: {componentDefinitions: []}},
                        },
                    ],
                },
            },
        },
    ],
};


async function migrateV4ToV5(v4InputFile: string, v5OutputFile: string) {
    logger.info(`Migrate form config v4 to v5: ${v4InputFile} -> ${v5OutputFile}`);
    let formConfig = require(v4InputFile);

    const migrateVisitor = new MigrationV4ToV5FormConfigVisitor(logger);
    const actual = migrateVisitor.start({data: formConfig});

    const tsContent = `
import {FormConfigFrame} from "@researchdatabox/sails-ng-common";
const formConfig: FormConfigFrame = ${JSON.stringify(actual, null, 2)};
module.exports = formConfig;
`;
    fs.writeFileSync(v5OutputFile, tsContent, "utf8");

    // Also run other visitors to check for issues in the migration.
    const constructVisitor = new ConstructFormConfigVisitor(logger);
    const constructResult = constructVisitor.start({
        data: actual, formMode: "edit", reusableFormDefs: reusableFormDefinitions
    });

    const templateVisitor = new TemplateFormConfigVisitor(logger);
    const templateResult = templateVisitor.start({
        form: constructResult
    });

    const validatorVisitor = new ValidatorFormConfigVisitor(logger);
    const validatorResult = validatorVisitor.start({
        form: constructResult,
        validatorDefinitions: formValidatorsSharedDefinitions
    });

    const clientVisitor = new ClientFormConfigVisitor(logger);
    const clientResult = clientVisitor.start({
        form: constructResult, formMode: "edit", userRoles: ["Admin", "Librarians", "Researcher", "Guest"],
    });

    return actual;
}

describe("Migrate v4 to v5 Visitor", async () => {
    it(`should migrate as expected`, async function () {
        const relPath = path.relative(path.join(__dirname, 'packages/sails-ng-common'), __dirname);
        const inputFiles = path.resolve(relPath, 'support/ng19-forms-migration/inputFiles');
        const outputFiles = path.resolve(relPath, 'support/ng19-forms-migration/outputFiles');
        const v4InputFiles = fs.readdirSync(inputFiles).filter(file => file.endsWith('.js'));
        for (const v4InputFile of v4InputFiles) {
            const fullPath = path.join(inputFiles, v4InputFile);
            const v5InputFile = v4InputFile.replace('.js', '.ts');
            const v5OutputFile = `${outputFiles}/parsed-${v5InputFile}`;
            const actual = await migrateV4ToV5(fullPath, v5OutputFile);
            expect(actual).to.not.be.empty;
            const serialised = JSON.stringify(actual);
            expect(serialised).to.not.contain('v4ClassName "ANDSVocab"');
        }
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
                            value: { bad: 'shape' }
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
});
