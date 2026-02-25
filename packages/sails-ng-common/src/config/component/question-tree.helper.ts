import {
  QuestionTreeFieldComponentConfigFrame, QuestionTreeFieldComponentDefinitionOutline,
  QuestionTreeMeta,
  QuestionTreeOutcome,
  QuestionTreeQuestion, QuestionTreeQuestionAnswer, QuestionTreeQuestionRuleIn, QuestionTreeQuestionRules
} from "./question-tree.outline";
import {guessType} from "../helpers";
import {AvailableFormComponentDefinitionFrames} from "../dictionary.outline";
import {SimpleInputComponentName, SimpleInputFormComponentDefinitionFrame} from "./simple-input.outline";
import {isTypeFormComponentDefinitionName} from "../form-types.outline";
import {CheckboxInputComponentName, CheckboxInputFormComponentDefinitionFrame} from "./checkbox-input.outline";
import {RadioInputComponentName, RadioInputFormComponentDefinitionFrame} from "./radio-input.outline";
import {ReusableComponentName, ReusableFormComponentDefinitionFrame} from "./reusable.outline";
import {LineagePaths} from "../names/naming-helpers";
import {PropertiesHelper} from "../visitor/common.model";
import {ILogger} from "../../logger.interface";
import {FormExpressionsConfigFrame} from "../form-component.outline";

export class QuestionTreeHelper {
  private readonly logName = "QuestionTreeHelper";
  private readonly logger: ILogger;
  private readonly propertiesHelper: PropertiesHelper;

  constructor(logger: ILogger) {
    this.logger = logger;
    this.propertiesHelper = new PropertiesHelper();
  }

  public questionTreeRuleToExpression(lineagePath: LineagePaths, rule: QuestionTreeQuestionRules): string {
    switch (rule.op) {
      case "true":
        return 'true';
      case "and":
        return rule.args.map(arg => `(${this.questionTreeRuleToExpression(lineagePath, arg)})`).join(' and ');
      case "or":
        return rule.args.map(arg => `(${this.questionTreeRuleToExpression(lineagePath, arg)})`).join(' or ');
      case "in":
      case "notin":
      case "only":
        // Build the jsonata format identifier.
        // Use the question tree angular component path, plus the question id as the path.
        const path = [...lineagePath.dataModel, rule.q]
        const identifierString = `formData.${this.propertiesHelper.lineagePathToExpressionIdentifiers([...path])}`;
        // The value can be converted to a json array for the jsonata expression.
        const values = (Array.isArray(rule.a) ? rule.a : [rule.a]).map(i => this.propertiesHelper.toFieldReference(i));
        const valueString = JSON.stringify(values);
        if (rule.op === "in") {
          return `$count(${identifierString}[][$ in ${valueString}]) > 0`;
        } else if (rule.op === "only") {
          return `${identifierString}[] = ${valueString}`;
        } else if (rule.op === "notin") {
          return `$count(${identifierString}[][$not($ in ${valueString})]) = $count(${identifierString})`;
        }
        throw new Error(`${this.logName} unknown rule ${JSON.stringify(rule)}.`);
      default:
        throw new Error(`${this.logName} unknown rule ${JSON.stringify(rule)}.`);
    }
  }

  public validateQuestion(
    question: QuestionTreeQuestion,
    questionIndex: number,
    availableOutcomeValues: string[],
    availableMeta: QuestionTreeMeta,
    questionAnswerValuesMap: { [k: string]: string[] },
  ) {
    const id = question.id;
    const answersMin = question.answersMin;
    const answersMax = question.answersMax;
    const answers = question.answers;
    const rules = question.rules;

    const errors: string[] = [];

    // validate question structure
    if (!id) {
      errors.push(`Question ${questionIndex + 1} has no id.`);
    }

    const msgQ = `Question ${questionIndex + 1} '${id}'`;
    if (answersMin < 1 || answersMin > answersMax) {
      errors.push(`${msgQ} answer min (${answersMin}) must be 1 or greater and equal or less than max (${answersMax}).`);
    }
    if (answersMax < 1 || answersMin > answersMax || answersMax > answers.length) {
      errors.push(
        `${msgQ} answer max (${answersMax}) must be 1 or greater, equal or greater than min (${answersMin}), and equal or less than the number of answers (${answers.length}).`
      );
    }
    if (answers.length < 1) {
      errors.push(`${msgQ} must have at least one answer.`);
    }
    if (Object.keys(rules).length === 0) {
      // Must have at least one rule - add a rule that always matches, so the question always shows.
      rules.op = "true";
    }

    // All answer outcome property keys and values must match a defined outcome.
    answers.forEach((answer, answerIndex) => {
      const outcome = answer.outcome;
      if (outcome && !availableOutcomeValues.includes(outcome)) {
        errors.push(
          `${msgQ} answer ${answerIndex + 1} '${answer.value}' outcome is unknown '${outcome}', available are '${availableOutcomeValues.join(', ')}'.`
        );
      }

      const meta = answer.meta ?? {};
      for (const [metaKey, metaValue] of Object.entries(meta)) {
        if (!(metaKey in availableMeta)) {
          errors.push(
            `${msgQ} answer ${answerIndex + 1} '${answer.value}' meta key is unknown '${metaKey}', available are '${Object.keys(availableMeta).join(', ')}'.`
          );
        }
        if (availableMeta[metaKey] && !(metaValue in availableMeta[metaKey])) {
          errors.push(
            `${msgQ} answer ${answerIndex + 1} '${answer.value}' meta key '${metaKey}' has unknown value '${metaValue}', available are '${Object.values(availableMeta).join(', ')}'.`
          );
        }
      }
    });

    // All rules that reference questions or answer values must use valid values.
    const rulesToCheck = [rules];
    while (rulesToCheck.length > 0) {
      const currentRule = rulesToCheck.shift();
      if (!currentRule) {
        continue;
      }
      switch (currentRule.op) {
        case "true":
          continue;
        case "and":
        case "or":
          rulesToCheck.push(...currentRule.args);
          break;
        case "in":
        case "notin":
        case "only":
          if (!(currentRule.q in questionAnswerValuesMap)) {
            errors.push(`${msgQ} rule op '${currentRule.op}' references an invalid question id '${currentRule.q}'.`);
          }
          const questionAnswers = questionAnswerValuesMap[currentRule.q];
          for (const ruleAnswerValue of currentRule.a) {
            if (!questionAnswers.includes(ruleAnswerValue)) {
              errors.push(
                `${msgQ} rule op '${currentRule.op}' question '${currentRule.q}' references an invalid answer value '${ruleAnswerValue}'.`
              );
            }
          }
          break;
        default:
          // Setting currentRule to a variable typed with never ensures that all possible switch cases
          // are present. TypeScript compile will fail if there are any possible cases missing.
          const _unexpected: never = currentRule;
          errors.push(`${msgQ} unknown rule ${JSON.stringify(_unexpected)}.`);
          break;
      }
    }

    return errors;
  }

  public transformQuestionConfig(
    name: string | null,
    lineagePath: LineagePaths,
    item: QuestionTreeFieldComponentDefinitionOutline,
    question: QuestionTreeQuestion
  ) {
    const id = question.id;
    const answersMax = question.answersMax;
    const answers = question.answers;
    const rules = question.rules;

    const ruleExpression = this.questionTreeRuleToExpression(lineagePath, rules);
    const isVisible = !ruleExpression || ruleExpression === 'true';
    if (!lineagePath.angularComponentsJsonPointer) {
      throw new Error(`${this.logName}: Did not provide lineage path JSON pointer ${JSON.stringify({
        name, lineagePath, item
      })}`);
    }

    // Notes:
    // - condition is always executed, should be true or false, if true, then evals template
    // - The condition should restrict to the question tree.
    // - use formData in the template to get the current value of a component of the question tree
    // - Both the layout and component have `visible` properties, so they both need to be set.

    const expressions: FormExpressionsConfigFrame[] | undefined = isVisible ? undefined : [
      {
        // Show and hide the layout based on the rules for the question.
        name: `${id}-layoutvis-qt`,
        config: {
          template: ruleExpression,
          conditionKind: 'jsonpointer',
          condition: `${lineagePath.angularComponentsJsonPointer}::field.value.changed`,
          target: `layout.visible`
        }
      },
      {
        // Show and hide the component based on the rules for the question.
        name: `${id}-compvis-qt`,
        config: {
          template: ruleExpression,
          conditionKind: 'jsonpointer',
          condition: `${lineagePath.angularComponentsJsonPointer}::field.value.changed`,
          target: `component.visible`
        }
      },
      {
        // Set the component value to null based on the rules for the question.
        name: `${id}-modval-qt`,
        config: {
          // TODO: template should be something like: if visible, use existing value, if not visible, set to null / undefined
          //       Build the expression from the rules, but match event.meta.visible instead of the model.value.
          template: `event.meta.visible = true`,
          conditionKind: 'jsonpointer',
          condition: `${lineagePath.angularComponentsJsonPointer}::field.ui-attribute.changed`,
          target: `model.value`
        }
      },
    ];

    // build reusable component
    const hasOneAnswer = answersMax === 1;
    const componentOptions = answers
      .map(a => {
        return {value: a.value, label: a.label ?? `@${name}-${id}-${a.value}`}
      });
    const componentAnswerOne: AvailableFormComponentDefinitionFrames = {
      overrides: {reusableFormName: "questiontree-answer-one"},
      name: "",
      component: {
        class: "ReusableComponent", config: {
          componentDefinitions: [
            {
              name: "questiontree_answer_one",
              overrides: {replaceName: id},
              layout: {class: "DefaultLayout", config: {label: id, visible: isVisible}},
              component: {class: "RadioInputComponent", config: {options: componentOptions, visible: isVisible}},
              expressions: expressions,
            },
          ],
        },
      },
    };
    const componentAnswerMore: AvailableFormComponentDefinitionFrames = {
      overrides: {reusableFormName: "questiontree-answer-one-more"},
      name: "",
      component: {
        class: 'ReusableComponent',
        config: {
          componentDefinitions: [
            {
              name: 'questiontree_answer_one_more',
              overrides: {replaceName: id},
              layout: {class: 'DefaultLayout', config: {label: id, visible: isVisible}},
              component: {class: 'CheckboxInputComponent', config: {options: componentOptions, visible: isVisible}},
              expressions: expressions,
            },
          ],
        },
      },
    };
    return hasOneAnswer ? componentAnswerOne : componentAnswerMore;
  }
}
