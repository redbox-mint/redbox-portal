import fs from "fs";
import path from "path";
import {logger} from "./helpers";
import {
  ClientFormConfigVisitor,
  ConstructFormConfigVisitor,
  formValidatorsSharedDefinitions,
  TemplateFormConfigVisitor,
  ValidatorFormConfigVisitor, FormOverride, FormConfigFrame,
  MigrationV4ToV5FormConfigVisitor
} from "../../src";
import {reusableFormDefinitionsExample1} from "./example-data";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);


async function migrateV4ToV5(v4InputFile: string, v5OutputFile: string) {
  logger.info(`Migrate form config v4 to v5: ${v4InputFile} -> ${v5OutputFile}`);
  let formConfig = require(v4InputFile);

  const migrateVisitor = new MigrationV4ToV5FormConfigVisitor(logger);
  const actual = migrateVisitor.start({data: formConfig});

  const tsContent = `import {FormConfigFrame} from "@researchdatabox/sails-ng-common";
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
  templateVisitor.start({
    form: constructResult
  });

  const validatorVisitor = new ValidatorFormConfigVisitor(logger);
  validatorVisitor.start({
    form: constructResult,
    validatorDefinitions: formValidatorsSharedDefinitions
  });

  const clientVisitor = new ClientFormConfigVisitor(logger);
  clientVisitor.start({
    form: constructResult, formMode: "edit", userRoles: ["Admin", "Librarians", "Researcher", "Guest"],
  });
}

describe("Migrate v4 to v5 Visitor", async () => {
  const formOverride = new FormOverride(logger);
  const relPath = path.relative(path.join(__dirname, 'packages/sails-ng-common'), __dirname);

  const migrateData = [];
  const questionTreeData = [];

  const testData = require(path.resolve(relPath, 'support/ng19-forms-migration/data.ts'));
  migrateData.push(...(testData.migrate ?? []));
  questionTreeData.push(...(testData.questionTree ?? []));

  const localDataPath = path.join(relPath, 'support/ng19-forms-migration/local/data.ts');
  if (fs.existsSync(localDataPath)) {
    const casesData = require(path.resolve(localDataPath));
    migrateData.push(...(casesData.migrate ?? []));
    questionTreeData.push(...(casesData.questionTree ?? []));
  }

  migrateData.forEach((item: { in: string, out: string }) => {
    it(`should migrate from ${item.in} to ${item.out}`, async function () {
      const inputFile = path.resolve(relPath, item.in);
      const outputFile = path.resolve(relPath, item.out);
      const actual = await migrateV4ToV5(inputFile, outputFile);
      expect(actual).to.not.be.empty;
    });
  });

  questionTreeData.forEach((item: { in: string, out: string }) => {
    it(`should migrate question tree from ${item.in} to ${item.out}`, async function () {
      const inputFile = path.resolve(relPath, item.in);
      const outputFile = path.resolve(relPath, item.out);
      let v4InputRequire = require(inputFile);
      const migrated = formOverride.migrateDataClassificationToQuestionTree(v4InputRequire);
      const tsContent = `import {QuestionTreeFieldComponentConfigFrame} from "@researchdatabox/sails-ng-common";
export const questionTreeConfig:  QuestionTreeFieldComponentConfigFrame = ${JSON.stringify(migrated, null, 2)};
module.exports = questionTreeConfig;
`;
      fs.writeFileSync(outputFile, tsContent, "utf8");
      expect(migrated).to.not.be.empty;

      // Confirm the migration is valid.
      const formConfig: FormConfigFrame = {
        name: "form",
        componentDefinitions: [
          {
            name: "questiontree_1",
            component: {
              class: "QuestionTreeComponent",
              config: migrated,
            },
          }
        ]
      };
      await migrateRunVisitors(formConfig);
    });
  });

});
