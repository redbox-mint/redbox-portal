import {
  AvailableFieldLayoutDefinitionFrames,
  AvailableFieldLayoutDefinitionOutlines, AvailableFormComponentDefinitionFrames,
  AvailableFormComponentDefinitionOutlines,
} from "../dictionary.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "../field-model.outline";
import {
    FieldComponentConfigFrame, FieldComponentConfigOutline,
    FieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline
} from "../field-component.outline";
import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType,
    FieldComponentDefinitionKindType,
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";

/* QuestionTree data structure */

/**
 * The available outcomes for a question tree.
 */
export interface QuestionTreeOutcome {
    /**
     * The outcome value.
     */
    value: QuestionTreeOutcomeValue;
    /**
     * The optional translation message to use as the label, or the actual label text.
     * Leave out or set 'falsy' to use a translation message id of `${question-tree-name}-${outcome-value}`.
     */
    label?: string | null;
}

type QuestionTreeOutcomeValue = string;

/**
 * The available additional data that can be included with answers and outcomes for a question tree.
 */
export interface QuestionTreeMeta {
    /**
     * The available additional metadata property keys.
     */
    [key: string]: {
        /**
         * The key is an available property value.
         * The optional value is the translation message id.
         * Set value 'falsy' to use a translation message id of `${question-tree-name}-${outcome-meta-property0key}-${outcome-meta-property-value}`.
         */
        [key: string]: string | null,
    }
}

/**
 * The additional metadata for an answer.
 */
export interface QuestionTreeAnswerMeta {
    [key: string]: string;
}

/**
 * One answer to a question in a question tree.
 */
export interface QuestionTreeQuestionAnswer {
    /**
     * The answer value.
     */
    value: string;
    /**
     * The optional translation message to use as the label, or the actual label text.
     * Leave out or set 'falsy' to use a translation message id of `${question-tree-name}-${question-id}-${answer-id}`.
     */
    label?: string | null;
    /**
     * The optional outcome applied when this answer is selected.
     *
     * The 'outcomes' object specifies the valid keys and values that can be used here.
     * Setting an outcome may not finish the question tree, as it is possible to have multiple outcomes.
     */
    outcome?: QuestionTreeOutcomeValue;
    /**
     * Optional additional / meta allows including more data with the answer and outcome.
     */
    meta?: QuestionTreeAnswerMeta;
}

/**
 * A question rule that always matches.
 */
export interface QuestionTreeQuestionRuleTrue {
    /**
     * The question rule operation identifier.
     * A question rule that always matches.
     */
    op: "true";
}

/**
 * A question rule that combines others rules using 'AND'.
 */
export interface QuestionTreeQuestionRuleAnd {
    /**
     * The question rule operation identifier.
     * A question rule that combines others rules using 'AND'.
     */
    op: "and";
    /**
     * The other rules to combine.
     */
    args: QuestionTreeQuestionRules[];
}

/**
 * A question rule that combines others rules using 'OR'.
 */
export interface QuestionTreeQuestionRuleOr {
    /**
     * The question rule operation identifier.
     * A question rule that combines others rules using 'OR'.
     */
    op: "or";
    /**
     * The other rules to combine.
     */
    args: QuestionTreeQuestionRules[];
}

/**
 * A question rule that checks whether the question has at least the answer values.
 */
export interface QuestionTreeQuestionRuleIn {
    /**
     * The question rule operation identifier.
     * A question rule that checks whether the question has at least the answer values.
     */
    op: "in";
    /**
     * The question identifier.
     */
    q: string;
    /**
     * The answer values.
     */
    a: string[];
}

/**
 * A question rule that checks whether the question does not have the answer values.
 */
export interface QuestionTreeQuestionRuleNotIn {
    /**
     * The question rule operation identifier.
     * A question rule that checks whether the question does not have the answer values.
     */
    op: "notin";
    /**
     * The question identifier.
     */
    q: string;
    /**
     * The answer values.
     */
    a: string[];
}

/**
 * A question rule that checks whether the question has only the answer values.
 */
export interface QuestionTreeQuestionRuleOnly {
    /**
     * The question rule operation identifier.
     * A question rule that checks whether the question has only the answer values.
     */
    op: "only";
    /**
     * The question identifier.
     */
    q: string;
    /**
     * The answer values.
     */
    a: string[];
}

export type QuestionTreeQuestionRules =
    QuestionTreeQuestionRuleTrue
    | QuestionTreeQuestionRuleAnd
    | QuestionTreeQuestionRuleOr
    | QuestionTreeQuestionRuleIn
    | QuestionTreeQuestionRuleNotIn
    | QuestionTreeQuestionRuleOnly
    ;

/**
 * A question definition.
 */
export interface QuestionTreeQuestion {
    /**
     *
     * The question identifier.
     * Used to reference this question and for label and help text translations.
     */
    id: string;
    /**
     * The minimum number of answers that can be supplied.
     * Must be at least 1, up to the maximum or the number of answers.
     */
    answersMin: number;
    /**
     * The maximum number of answers that can be supplied.
     * Must be at least the minimum, up to the number of answers.
     */
    answersMax: number;
    /**
     * The possible answers to the question.
     */
    answers: QuestionTreeQuestionAnswer[];
    /**
     * The rules for showing this question.
     */
    rules: QuestionTreeQuestionRules;
}

/* QuestionTree Component */

export const QuestionTreeComponentName = `QuestionTreeComponent` as const;
export type QuestionTreeComponentNameType = typeof QuestionTreeComponentName;

export interface QuestionTreeFieldComponentConfigFrame extends FieldComponentConfigFrame {
    /**
     * The available outcome keys and values.
     *
     * The order of the outcomes is the importance / sensitivity,
     * from lowest / least at index 0 to highest / most at index length - 1.
     *
     * Interface only, there is no class for this config property.
     */
    availableOutcomes: QuestionTreeOutcome[];
    /**
     * The additional data that can be included with outcomes.
     * The additional data has no notion of important / sensitivity.
     * Interface only, there is no class for this config property.
     */
    availableMeta?: QuestionTreeMeta;
    /**
     * The question definitions.
     * Interface only, there is no class for this config property.
     */
    questions: QuestionTreeQuestion[];
    componentDefinitions: AvailableFormComponentDefinitionFrames[];
}

export interface QuestionTreeFieldComponentConfigOutline extends QuestionTreeFieldComponentConfigFrame, FieldComponentConfigOutline {
    availableOutcomes: QuestionTreeOutcome[];
    availableMeta?: QuestionTreeMeta;
    questions: QuestionTreeQuestion[];
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];
}

export interface QuestionTreeFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: QuestionTreeComponentNameType;
    config?: QuestionTreeFieldComponentConfigFrame;
}

export interface QuestionTreeFieldComponentDefinitionOutline extends QuestionTreeFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: QuestionTreeComponentNameType;
    config?: QuestionTreeFieldComponentConfigOutline;
}


/* QuestionTree Model */

export const QuestionTreeModelName = `QuestionTreeModel` as const;
export type QuestionTreeModelNameType = typeof QuestionTreeModelName;
export type QuestionTreeModelValueType = Record<string, unknown>;

export interface QuestionTreeFieldModelConfigFrame extends FieldModelConfigFrame<QuestionTreeModelValueType> {

}

export interface QuestionTreeFieldModelConfigOutline extends QuestionTreeFieldModelConfigFrame, FieldModelConfigOutline<QuestionTreeModelValueType> {

}


export interface QuestionTreeFieldModelDefinitionFrame extends FieldModelDefinitionFrame<QuestionTreeModelValueType> {
    class: QuestionTreeModelNameType;
    config?: QuestionTreeFieldModelConfigFrame;
}

export interface QuestionTreeFieldModelDefinitionOutline extends QuestionTreeFieldModelDefinitionFrame, FieldModelDefinitionOutline<QuestionTreeModelValueType> {
    class: QuestionTreeModelNameType;
    config?: QuestionTreeFieldModelConfigOutline;
}

/* QuestionTree Form Component */

export interface QuestionTreeFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: QuestionTreeFieldComponentDefinitionFrame;
    model?: QuestionTreeFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface QuestionTreeFormComponentDefinitionOutline extends QuestionTreeFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: QuestionTreeFieldComponentDefinitionOutline;
    model?: QuestionTreeFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}


export type QuestionTreeTypes =
    { kind: FieldComponentConfigFrameKindType, class: QuestionTreeFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: QuestionTreeFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: QuestionTreeFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: QuestionTreeFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: QuestionTreeFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: QuestionTreeFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: QuestionTreeFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: QuestionTreeFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: QuestionTreeFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: QuestionTreeFormComponentDefinitionOutline }
    ;
