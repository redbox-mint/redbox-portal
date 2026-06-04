import {
  QuestionTreeFieldComponentDefinitionOutline,
  QuestionTreeMeta,
  QuestionTreeQuestion,
  QuestionTreeQuestionRules
} from "./question-tree.outline";
import {AvailableFormComponentDefinitionFrames} from "../dictionary.outline";
import {ReusableFormComponentDefinitionFrame} from "./reusable.outline";
import {LineagePaths} from "../names/naming-helpers";
import {ILogger} from "../../logger.interface";
import {guessType} from "../helpers";

export class QuestionTreeHelper {
  private readonly logName = "QuestionTreeHelper";
  private readonly defaultQuestionTreeLabelPrefix = "questiontree";
  private readonly logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  public validateQuestions(questions: QuestionTreeQuestion[]) {
    // Prepare question and answer info to assist checking for valid structure
    const questionAnswerValuesMap = Object.fromEntries(
      questions?.map(question => [question.id, question.answers.map(answer => answer.value)])
    );

    const errors: string[] = [];
    const duplicateQuestionIds = new Set(Object.keys(questionAnswerValuesMap).filter((e, i, a) => a.indexOf(e) !== i));
    if (duplicateQuestionIds.size > 0) {
      errors.push(`Question ids must be unique, these were not ${Array.from(duplicateQuestionIds).sort().join(', ')}.`);
    }

    return {errors, questionAnswerValuesMap}
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
   * @param modelData The full question tree model data.
   * @param questionId The question config to transform.
   * @param questions The questions config.
   * @return A reusable form definition representing the question and available answers.
   */
  public transformQuestionConfig(
    name: string,
    lineagePath: LineagePaths,
    item: QuestionTreeFieldComponentDefinitionOutline,
    modelData: unknown,
    questionId: string,
    questions: QuestionTreeQuestion[],
  ): ReusableFormComponentDefinitionFrame {
    if (!lineagePath.angularComponentsJsonPointer) {
      throw new Error(`${this.logName}: Did not provide lineage path JSON pointer ${JSON.stringify({
        name, lineagePath, item
      })}`);
    }
    if (modelData !== undefined && (guessType(modelData) !== 'object' || typeof modelData !== 'object')) {
      throw new Error(`${this.logName}: Expected model data to be an object, but got ${modelData}`);
    }

    const question = questions.find(q => q.id === questionId);
    if (question === undefined) {
      throw new Error(`${this.logName}: Could not find question id ${questionId}`);
    }
    const id = questionId;
    const answersMax = question.answersMax;
    const answers = question.answers;

    const isVisible = isQuestionTreeQuestionActivated(id, questions, modelData as Record<string, unknown>);

    // build reusable component
    const hasOneAnswer = answersMax === 1;
    const componentOptions = answers.map(a => {
      return {value: a.value, label: this.questionAnswerLabelKey(name, id, a.value, a.label)};
    });
    const questionLabel = this.questionLabelKey(name, id, question.label);
    const questionHelpText = this.questionHelpKey(name, id);
    const componentAnswerOne: AvailableFormComponentDefinitionFrames = {
      overrides: {reusableFormName: "questiontree-answer-one"},
      name: "",
      component: {
        class: "ReusableComponent", config: {
          componentDefinitions: [
            {
              name: "questiontree_answer_one",
              overrides: {replaceName: id},
              layout: {
                class: "DefaultLayout",
                config: {label: questionLabel, helpText: questionHelpText, visible: isVisible}
              },
              component: {class: "RadioInputComponent", config: {options: componentOptions, visible: isVisible}},
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
              layout: {
                class: 'DefaultLayout',
                config: {label: questionLabel, helpText: questionHelpText, visible: isVisible}
              },
              component: {class: 'CheckboxInputComponent', config: {options: componentOptions, visible: isVisible}},
            },
          ],
        },
      },
    };
    return hasOneAnswer ? componentAnswerOne : componentAnswerMore;
  }

  private questionLabelPrefix(componentName: string) {
    return (componentName ?? "").trim().replace(/^@+/, "") || this.defaultQuestionTreeLabelPrefix;
  }

  private questionLabelKey(componentName: string, questionId: string, questionLabel: string | undefined): string {
    if (!!questionLabel?.trim()) {
      return questionLabel;
    }

    const keyPrefix = this.questionLabelPrefix(componentName);
    return `@${keyPrefix}-item-${questionId}-label`;
  }

  private questionHelpKey(componentName: string, questionId: string): string {
    const keyPrefix = this.questionLabelPrefix(componentName);
    return `@${keyPrefix}-item-${questionId}-help`;
  }

  private questionAnswerLabelKey(componentName: string, questionId: string, answerValue: string, answerLabel: string | null | undefined) {
    if (!!answerLabel?.trim()) {
      return answerLabel;
    }

    const keyPrefix = this.questionLabelPrefix(componentName);
    return `@${keyPrefix}-item-${questionId}-${answerValue}-label`;
  }

}

/**
 * Determine whether a question should be 'activated' based on the provided question tree form model data.
 * - An activated question is visible and can have a non-null data model. A question is active if its rules evaluate to true.
 * - A deactivated question is not visible and its form model data must be null.
 * @param questionId The question id.
 * @param questions The questions config.
 * @param data The current question tree form data.
 */
export function isQuestionTreeQuestionActivated(questionId: string, questions: QuestionTreeQuestion[], data: Record<string, unknown>): boolean {
  const questionIdsToCheck = [questionId];
  while (questionIdsToCheck.length > 0) {
    const currentQuestionId = questionIdsToCheck.shift();
    const currentQuestion = questions.find(q => q.id === currentQuestionId);
    if (currentQuestion === undefined) {
      return false;
    }

    const rulesToCheck = [currentQuestion?.rules];
    while (rulesToCheck.length > 0) {
      const currentRule = rulesToCheck.shift();
      if (currentRule === undefined) {
        return false;
      }

      if (!isQuestionTreeQuestionRuleTrue(currentRule, data)) {
        return false;
      }
      switch (currentRule?.op) {
        case "true":
          continue;
        case "and":
        case "or":
          rulesToCheck.push(...currentRule.args);
          continue;
        case "in":
        case "notin":
        case "only":
          if (currentRule.q) {
            questionIdsToCheck.push(currentRule.q);
          }
          continue;
        default:
          throw new Error(`Unknown question tree question rule ${JSON.stringify(currentRule)}.`);
      }
    }
  }
  return true;
}

/**
 * Determine whether a rule is true given the data.
 * @param rule The question tree question rule to check.
 * @param data The question tree data.
 */
export function isQuestionTreeQuestionRuleTrue(rule: QuestionTreeQuestionRules, data: Record<string, unknown>): boolean {
  switch (rule.op) {
    case "true":
      return true;

    case "and":
      return rule.args.every(rule => isQuestionTreeQuestionRuleTrue(rule, data));

    case "or":
      return rule.args.some(rule => isQuestionTreeQuestionRuleTrue(rule, data));

    case "in":
      const valueIn = data?.[rule.q] ?? "";
      const actualIn = Array.isArray(valueIn) ? valueIn : [valueIn];
      const expectedIn = Array.isArray(rule.a) ? rule.a : [rule.a];
      return expectedIn.every(e => actualIn.filter(a => !!a).includes(e));

    case "notin":
      const valueNotIn = data?.[rule.q] ?? "";
      const actualNotIn = Array.isArray(valueNotIn) ? valueNotIn : [valueNotIn];
      const expectedNotIn = Array.isArray(rule.a) ? rule.a : [rule.a];
      return expectedNotIn.every(e => !actualNotIn.filter(a => !!a).includes(e));

    case "only":
      const valueOnly = data?.[rule.q] ?? "";
      const actualOnly = Array.isArray(valueOnly) ? valueOnly : [valueOnly];
      const expectedOnly = Array.isArray(rule.a) ? rule.a : [rule.a];
      return actualOnly.length === expectedOnly.length &&
        expectedOnly.every(e => actualOnly.filter(a => !!a).includes(e)) &&
        actualOnly.every(a => expectedOnly.filter(e => !!e).includes(a));

    default:
      throw new Error(`Unknown question tree question rule ${JSON.stringify(rule)}.`);
  }
}
