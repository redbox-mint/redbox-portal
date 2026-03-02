import fs from 'fs';
import {
  FormConfigFrame, FormModesConfig,
  formValidatorsSharedDefinitions,
  ILogger, PropertiesHelper, QuestionTreeFieldComponentConfigFrame, ReusableFormDefinitions
} from '@researchdatabox/sails-ng-common';
import {MigrationV4ToV5FormConfigVisitor} from './migrate-config-v4-v5.visitor';
import {TemplateFormConfigVisitor} from './template.visitor';
import {ConstructFormConfigVisitor} from './construct.visitor';
import {ValidatorFormConfigVisitor} from './validator.visitor';
import {ClientFormConfigVisitor} from './client.visitor';
// import {VocabInlineFormConfigVisitor} from './vocab-inline.visitor';
import {AttachmentFieldsVisitor} from './attachment-fields.visitor';
import {reusableFormDefinitions} from '../config';
import {cloneDeep as _cloneDeep} from 'lodash';
import {QuestionTreeHelper} from "@researchdatabox/sails-ng-common/dist/src/config/component/question-tree.helper";


export async function migrateFormConfigVerify(formConfig: FormConfigFrame, logger: ILogger) {
  console.log(`ℹ️ Run form visitors to confirm migrated config is valid.`);

  // Also run other visitors to check for issues in the migration.
  const constructVisitor = new ConstructFormConfigVisitor(logger);
  const constructResult = constructVisitor.start({
    data: formConfig, formMode: 'edit', reusableFormDefs: reusableFormDefinitions
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

  // const vocabInlineVisitor = new VocabInlineFormConfigVisitor(logger);
  // await vocabInlineVisitor.resolveVocabs(constructResult);

  const attachmentFieldsVisitor = new AttachmentFieldsVisitor(logger);
  attachmentFieldsVisitor.start(constructResult);

  // Client visitor mutates/prunes the supplied form config. Run it on a clone so
  // downstream verification steps operate on the full constructed form.
  const clientVisitor = new ClientFormConfigVisitor(logger);
  clientVisitor.start({
    form: _cloneDeep(constructResult),
    formMode: 'edit',
    userRoles: ['Admin', 'Librarians', 'Researcher', 'Guest'],
  });

  return constructResult;
}

export async function migrateFormConfigFile(migrateVisitor: MigrationV4ToV5FormConfigVisitor, inputPath: string) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const v4FormConfig = require(inputPath);
  const migrated = migrateVisitor.start({data: v4FormConfig});

  const tsContent = `import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
const formConfig: FormConfigFrame = ${JSON.stringify(migrated, null, 2)};
export default formConfig;`;

  return {
    migrated,
    tsContent,
  };
}

export function migrateDataClassification(migrateVisitor: MigrationV4ToV5FormConfigVisitor, inputPath: string) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const v4InputRequire = require(inputPath);
  const migrated = migrateVisitor.migrateDataClassificationToQuestionTree(v4InputRequire);

  const tsContent = `import {QuestionTreeFieldComponentConfigFrame} from "@researchdatabox/sails-ng-common";
const questionTreeConfig: QuestionTreeFieldComponentConfigFrame = ${JSON.stringify(migrated, null, 2)};
export default questionTreeConfig;`;

  // Confirm the migration is valid.
  const formConfig: FormConfigFrame = {
    name: 'form',
    componentDefinitions: [
      {
        name: 'questiontree_1',
        component: {
          class: 'QuestionTreeComponent',
          config: migrated,
        },
      }
    ]
  };

  return {
    formConfig,
    migratedConfig: migrated,
    tsContent,
  };
}

export async function createClientFormConfig(
  data: FormConfigFrame, logger: ILogger,
  formMode?: FormModesConfig, userRoles?: string[], reusableFormDefs?: ReusableFormDefinitions,
  record?: Record<string, unknown> | null
) {

  formMode = formMode ?? "edit";
  userRoles = userRoles ?? ['Admin', 'Librarians', 'Researcher', 'Guest'];
  reusableFormDefs = reusableFormDefs ?? reusableFormDefinitions;

  const constructor = new ConstructFormConfigVisitor(logger);
  const form = constructor.start({data, reusableFormDefs, formMode, record});

  // const vocabVisitor = new VocabInlineFormConfigVisitor(logger);
  // await vocabVisitor.resolveVocabs(form, 'default');

  const visitor = new ClientFormConfigVisitor(logger);
  const result = visitor.start({form, reusableFormDefs, formMode, userRoles});

  if (!result) {
    throw new Error(`The form config is invalid because all form fields were removed, ` +
      `the form config must have at least one field: ` +
      `${JSON.stringify({data, formMode, userRoles, record, reusableFormDefs})}`
    );
  }
  return result;
}

export async function createQuestionTreeDiagram(componentConfig: QuestionTreeFieldComponentConfigFrame, logger: ILogger,): Promise<string> {
  const propertiesHelper = new PropertiesHelper();
  const questionTreeHelper = new QuestionTreeHelper(logger);
  const availableOutcomeValues = (componentConfig?.availableOutcomes ?? []).map(i => i.value);
  const availableMeta = componentConfig?.availableMeta ?? {};

  const frontmatter: string[] = [];

  const diagramType = "flowchart";
  const orientation: "LR" | "TB" | "BT" = "LR";
  const diagram: string[] = [`${diagramType} ${orientation}`];

  const {errors, questionAnswerValuesMap} = questionTreeHelper.validateQuestions(componentConfig.questions);
  componentConfig.questions.forEach((question, questionIndex) => {
    errors.push(...questionTreeHelper.validateQuestion(question, questionIndex, availableOutcomeValues, availableMeta, questionAnswerValuesMap));

    // add decision node for each question
    const nodeLabel = `Question: ${question.label ?? question.id}`;
    // diagram.push(`  ${question.id}@{shape:diamond,label:"\`${nodeLabel}\`"}`);
    diagram.push(`  ${question.id}{"\`${nodeLabel}\`"}`);

    // represent rules as links between nodes
    const rulesToProcess = [question.rules];
    while (rulesToProcess.length > 0) {
      const currentRule = rulesToProcess.shift();
      if (!currentRule) {
        continue;
      }
      switch (currentRule.op) {
        case "true":
          continue;
        case "and":
        case "or":
          rulesToProcess.push(...currentRule.args);
          break;
        case "in":
        case "notin":
        case "only":
          const nodeFrom = currentRule.q;
          const nodeTo = question.id;
          const connectorText = currentRule.a.join(', ');
          diagram.push(`  ${nodeFrom}-->|${connectorText}|${nodeTo}`)
          break;
        default:
          // Setting currentRule to a variable typed with never ensures that all possible switch cases
          // are present. TypeScript compile will fail if there are any possible cases missing.
          const _unexpected: never = currentRule;
          errors.push(`Unknown rule ${JSON.stringify(_unexpected)}.`);
          break;
      }
    }

    // represent answers with outcomes as links between nodes
    for (const answer of question.answers) {
      if (!answer.outcome){
        continue;
      }
      const nodeId = [question.id, propertiesHelper.toFieldReference(answer.outcome)].join('-');
      const metaText = Object.entries(answer.meta ?? {}).map(([k, v]) => `${k}=${v}`).join('\n');
      const outcomeLabel = `"\`Outcome: ${answer.outcome}\n${metaText}\`"`;
      // diagram.push(`  ${nodeId}@{shape:rounded,label:${outcomeLabel}}`);
      diagram.push(`  ${nodeId}(${outcomeLabel})`);
      diagram.push(`  ${question.id}--->|${answer.label ?? answer.value}|${nodeId}`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Question tree config is not valid: ${errors.join(' ')}`);
  }

  return frontmatter.join('\n') + diagram.join('\n');
}
