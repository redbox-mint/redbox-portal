import {MigrationV4ToV5FormConfigVisitor} from "../../src/config/visitor/migrate-config-v4-v5.visitor";
import fs from "fs";
import path from "path";
import {log} from "@researchdatabox/redbox-core-types";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Migrate v4 to v5 Visitor", async () => {
    const relPath = path.relative(path.join(__dirname, 'packages/sails-ng-common'), __dirname);
    const inputFiles = path.resolve(relPath, 'support/ng19-forms-migration/inputFiles');
    const outputFiles = path.resolve(relPath, 'support/ng19-forms-migration/outputFiles');
    it(`should migrate as expected`, async function () {
        const v4InputFiles = fs.readdirSync(inputFiles).filter(file => file.endsWith('.js'));
        for (const v4InputFile of v4InputFiles) {
            const fullPath = path.join(inputFiles, v4InputFile);
            const formConfig = require(fullPath);
            if (!formConfig.name) {
                formConfig.name = 'v4FormConfig';
            }
            const v5InputFile = v4InputFile.replace('.js', '.ts');

            const visitor = new MigrationV4ToV5FormConfigVisitor(log.custom);
            const actual = visitor.start(formConfig);

            const tsContent = `
import {FormConfigFrame} from "@researchdatabox/sails-ng-common";
const formConfig: FormConfigFrame = ${JSON.stringify(actual, null, 2)};
module.exports = formConfig;
`;
            fs.writeFileSync(`${outputFiles}/parsed-${v5InputFile}`, tsContent, "utf8");
            expect(actual).to.not.be.empty;
        }
    });
});
