import {MigrationV4ToV5FormConfigVisitor} from "../../src/config/visitor/migrate-config-v4-v5.visitor";
import fs from "fs";
import path from "path";
import {logger} from "./helpers";
import {ClientFormConfigVisitor, ConstructFormConfigVisitor} from "../../src";

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

    // Also run the construct and client visitors to check for issues in the migration.
    const constructVisitor = new ConstructFormConfigVisitor(logger);
    const constructed = constructVisitor.start({
        data: actual, formMode: "edit"
    });

    const clientVisitor = new ClientFormConfigVisitor(logger);
    const result = clientVisitor.start({
        form: constructed, formMode: "edit", userRoles: ["Admin", "Librarians", "Researcher", "Guest"]
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
        }
    });
});
