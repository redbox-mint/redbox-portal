import {
  QuestionTreeFieldComponentDefinitionOutline,
  QuestionTreeMeta,
  QuestionTreeQuestion,
  QuestionTreeQuestionRules
} from "./question-tree.outline";
import {AvailableFormComponentDefinitionFrames} from "../dictionary.outline";
import {ReusableFormComponentDefinitionFrame} from "./reusable.outline";
import {LineagePaths} from "../names/naming-helpers";
import {PropertiesHelper} from "../visitor/common.model";
import {ILogger} from "../../logger.interface";
import {FormExpressionsConfigFrame} from "../form-component.outline";

export class QuestionTreeHelper {
  private readonly logName = "QuestionTreeHelper";
  private readonly defaultQuestionTreeLabelPrefix = "questiontree";
  private readonly logger: ILogger;
  private readonly propertiesHelper: PropertiesHelper;

  constructor(logger: ILogger) {
    this.logger = logger;
    this.propertiesHelper = new PropertiesHelper();
  }

  /**
   * Convert the question tree rules to a JSONata expression to control the visibility.
   * @param lineagePath The question tree lineage paths.
   * @param rule The current question rule.
   * @return The JSONata expression.
   */
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
        const identifierString = this.questionReference(lineagePath, rule.q);
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

  /**
   * Build the JSONata reference / identifier from the question tree lineage path and qauestion id.
   * @param lineagePath The question tree lineage paths.
   * @param questionId The question id.
   * @return The JSONata reference / identifier.
   */
  public questionReference(lineagePath: LineagePaths, questionId: string) {
    const path = [...lineagePath.dataModel, questionId]
    return `formData.${this.propertiesHelper.lineagePathToExpressionIdentifiers([...path])}`
  }

  /**
   * Convert the visibility JSONata rule expression to a JSONata expression to set the model.value.
   * @param ruleExpression The visibility JSONata rule expression.
   * @param questionReference The JSONata question reference / identifier.
   * @return The JSONata expression to set the model.value.
   */
  public questionTreeModelValueExpression(ruleExpression: string, questionReference: string): string {
    // NOTE: A Question Tree component model.value could be set to null based on either of two criteria:
    //  1) Using the rule expression:
    //    - If the rule expression is true, then component should be visible, use the existing model value.
    //    - If the rule expression is false, then component should be hidden, so set the model.value to null.
    //  2) Using the visible state of the component:
    //    - If the component is visible, use the existing data model value.
    //    - If the component is hidden, set the model.value to null.

    //  Chose to use the rule expression, as it is directly responsible for the changes.
    //  However, there could be edge cases where the rule expression is not enough,
    //  and the field.ui-attribute.changed might need to be used instead.
    return `(${ruleExpression} ? ${questionReference} : null)`;
  }

  /**
   * Validate a question tree's questions to ensure they are internally consistent.
   * @param question A question tree question definition.
   * @param questionIndex The question index.
   * @param availableOutcomeValues The available outcome ids.
   * @param availableMeta The available meta data.
   * @param questionAnswerValuesMap A map of question answer values.
   * @return An array of errors, an empty array indicates no errors.
   */
  public validateQuestion(
    question: QuestionTreeQuestion,
    questionIndex: number,
    availableOutcomeValues: string[],
    availableMeta: QuestionTreeMeta,
    questionAnswerValuesMap: { [k: string]: string[] },
  ): string[] {
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

  /**
   * Transform a question tree question to a reusable form definition to be used in the form config.
   * @param name The question tree name.
   * @param lineagePath The question tree lineage path.
   * @param item The question tree component config.
   * @param question The question config to transform.
   * @return A reusable form definition representing the question and available answers.
   */
  public transformQuestionConfig(
    name: string | null,
    lineagePath: LineagePaths,
    item: QuestionTreeFieldComponentDefinitionOutline,
    question: QuestionTreeQuestion
  ): ReusableFormComponentDefinitionFrame {
    if (!lineagePath.angularComponentsJsonPointer) {
      throw new Error(`${this.logName}: Did not provide lineage path JSON pointer ${JSON.stringify({
        name, lineagePath, item
      })}`);
    }

    const id = question.id;
    const answersMax = question.answersMax;
    const answers = question.answers;
    const rules = question.rules;

    const ruleExpression = this.questionTreeRuleToExpression(lineagePath, rules);
    const questionReference = this.questionReference(lineagePath, id);
    const modelValueExpression = this.questionTreeModelValueExpression(ruleExpression, questionReference);

    // TODO: Component visibility is based on the rule expressions, but the record data can change this.
    //       For now, the visibility change due to record data is done on the client only.
    //       It might be necessary to calculate the visibility on the server-side using the record data.
    const isVisible = !ruleExpression || ruleExpression === 'true';

    // Notes:
    // - condition is always executed, should be true or false, if true, then evals template
    // - The condition should restrict to the question tree.
    // - use formData in the template to get the current value of a component of the question tree
    // - Both the layout and component have `visible` properties, so they both need to be set.

    const configCondition = `${lineagePath.angularComponentsJsonPointer}::field.value.changed`;
    const expressions: FormExpressionsConfigFrame[] | undefined = isVisible ? undefined : [
      {
        // Show and hide the layout based on the rules for the question.
        name: `${name}-${id}-layoutvis-qt`,
        config: {
          template: ruleExpression,
          conditionKind: 'jsonpointer',
          condition: configCondition,
          target: `layout.visible`
        }
      },
      {
        // TODO: if the layout is changed to also control the component visibility, this expression can be removed.
        // Show and hide the component based on the rules for the question.
        name: `${name}-${id}-compvis-qt`,
        config: {
          template: ruleExpression,
          conditionKind: 'jsonpointer',
          condition: configCondition,
          target: `component.visible`
        }
      },
      {
        // Set the component value to null based on the rules for the question.
        name: `${name}-${id}-modval-qt`,
        config: {
          template: modelValueExpression,
          conditionKind: 'jsonpointer',
          condition: configCondition,
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
