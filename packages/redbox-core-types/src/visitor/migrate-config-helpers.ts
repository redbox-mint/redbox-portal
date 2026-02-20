import * as fs from 'fs';
import * as path from 'path';
import {
  FormConfigFrame,
  formValidatorsSharedDefinitions,
  ILogger
} from '@researchdatabox/sails-ng-common';
import {MigrationV4ToV5FormConfigVisitor} from "./migrate-config-v4-v5.visitor";
import {TemplateFormConfigVisitor} from "./template.visitor";
import {ConstructFormConfigVisitor} from "./construct.visitor";
import {ValidatorFormConfigVisitor} from "./validator.visitor";
import {ClientFormConfigVisitor} from "./client.visitor";
import {VocabInlineFormConfigVisitor} from "./vocab-inline.visitor";
import {AttachmentFieldsVisitor} from "./attachment-fields.visitor";
import {reusableFormDefinitions} from "../config";


export async function migrateFormConfigVerify(formConfig: FormConfigFrame, logger: ILogger) {
  console.log(`ℹ️ Run form visitors to confirm migrated config is valid.`);

  // Also run other visitors to check for issues in the migration.
  const constructVisitor = new ConstructFormConfigVisitor(logger);
  const constructResult = constructVisitor.start({
    data: formConfig, formMode: "edit", reusableFormDefs: reusableFormDefinitions
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

  const vocabInlineVisitor = new VocabInlineFormConfigVisitor(logger);
  await vocabInlineVisitor.resolveVocabs(constructResult);

  const attachmentFieldsVisitor = new AttachmentFieldsVisitor(logger);
  attachmentFieldsVisitor.start(constructResult);

  return constructResult;
}

export async function migrateFormConfigFile(
  migrateVisitor: MigrationV4ToV5FormConfigVisitor,
  inputPath: string, outputPath: string, dryRun: boolean
) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  console.log(`\n🛠️  Migrating form config: ${inputPath} -> ${outputPath}\n`);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const v4FormConfig = require(inputPath);
  const migrated = migrateVisitor.start({data: v4FormConfig});

  const tsContent = `import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
const formConfig: FormConfigFrame = ${JSON.stringify(migrated, null, 2)};
export default formConfig;
`;

  if (dryRun) {
    console.log('[dry-run] Migration completed; no file written.');
  } else {
    fs.mkdirSync(path.dirname(outputPath), {recursive: true});
    fs.writeFileSync(outputPath, tsContent, 'utf8');
    console.log(`✅ Wrote migrated form config: ${outputPath}`);
  }

  return migrated;
}

export function migrateDataClassification(
  migrateVisitor: MigrationV4ToV5FormConfigVisitor,
  inputPath: string, outputPath: string, dryRun: boolean
) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  console.log(`\n🛠️  Migrating data classification: ${inputPath} -> ${outputPath}\n`);

  let v4InputRequire = require(inputPath);
  const migrated = migrateVisitor.migrateDataClassificationToQuestionTree(v4InputRequire);

  const tsContent = `import {QuestionTreeFieldComponentConfigFrame} from "@researchdatabox/sails-ng-common";
const questionTreeConfig: QuestionTreeFieldComponentConfigFrame = ${JSON.stringify(migrated, null, 2)};
export default questionTreeConfig;
`;

  if (dryRun) {
    console.log('[dry-run] Migration completed; no file written.');
  } else {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, tsContent, 'utf8');
    console.log(`✅ Wrote migrated question tree config: ${outputPath}`);
  }


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

  return {
    formConfig,
    migratedConfig: migrated,
  };
}
