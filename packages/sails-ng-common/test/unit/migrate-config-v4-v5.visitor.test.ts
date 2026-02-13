import {MigrationV4ToV5FormConfigVisitor} from "../../src/config/visitor/migrate-config-v4-v5.visitor";
import fs from "fs";
import path from "path";
import {logger} from "./helpers";
import {
    ClientFormConfigVisitor,
    ConstructFormConfigVisitor,
    formValidatorsSharedDefinitions,
    TemplateFormConfigVisitor,
    ValidatorFormConfigVisitor, FormOverride, FormConfigFrame
} from "../../src";
import {reusableFormDefinitionsExample1} from "./example-data";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);



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

    await migrateRunVisitors(actual);

    return actual;
}

async function migrateRunVisitors(formConfig: FormConfigFrame) {
    // Also run other visitors to check for issues in the migration.
    const constructVisitor = new ConstructFormConfigVisitor(logger);
    const constructResult = constructVisitor.start({
        data: formConfig, formMode: "edit", reusableFormDefs: reusableFormDefinitionsExample1
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
        }
    });
});
