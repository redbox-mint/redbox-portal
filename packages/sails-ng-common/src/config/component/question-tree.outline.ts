import {
    AvailableFieldLayoutDefinitionFrames,
    AvailableFieldLayoutDefinitionOutlines,
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
export interface QuestionTreeOutcomes {
    /**
     * The available outcome property keys.
     */
    [key: string]: {
        /**
         * The key is an available outcome property value.
         * The optional value is the translation message id.
         * Set value 'falsy' to use a translation message id of `${outcome-key}-${outcome-value}`.
         */
        [key: string]: string | null,
    }
}
type QuestionTreeOutcomePropKeys = keyof QuestionTreeOutcomes;

/**
 * One answer to a question in a question tree.
 */
export interface QuestionTreeQuestionAnswer {
    /**
     * The optional translation message to use as the label, or the actual label text.
     * Leave out or set 'falsy' to use a translation message id of `${question-id}-${answer-id}`.
     */
    label?: string | null;
    /**
     * The optional outcome applied when this answer is selected.
     * The 'outcomes' object specifies the valid keys and values that can be used here.
     * Setting an outcome may not finish the question tree, as it is possible to have multiple outcomes.
     */
    outcome?: { [key in QuestionTreeOutcomePropKeys]: string };
}

/**
 * The possible answers to a question.
 */
export interface QuestionTreeQuestionAnswers {
    /**
     * The key is the answer value.
     */
    [key: string]: QuestionTreeQuestionAnswer;
}

type QuestionTreeQuestionAnswerValues = keyof QuestionTreeQuestionAnswers;

/**
 * A condition to fulfil to show the question.
 */
export interface QuestionTreeQuestionRule {
    /**
     * The match strategy to apply:
     * - 'all': all items must match
     * - 'any': at least one item much match
     */
    match: "all" | "any";
    /**
     * Each key value pair is a match to check.
     * The key is a question id, the value is an answer value.
     */
    items: { [key in QuestionTreeQuestionIds]: QuestionTreeQuestionAnswerValues };
}

export interface QuestionTreeQuestions {
    /**
     * A question definition.
     * The key is the question id.
     */
    [key: string]: {
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
        answers: QuestionTreeQuestionAnswers;
        /**
         * The rules for showing this question.
         */
        rules: QuestionTreeQuestionRule[];
    }
}

type QuestionTreeQuestionIds =  keyof QuestionTreeQuestions;

const example: QuestionTreeFieldComponentConfigFrame = {
    outcomes: {
        prop1: {
            "value1": "@outcomes-prop1-value1",
            "value2": "@outcomes-prop1-value2",
        },
        prop2: {
            "value1": "@outcomes-prop2-value1",
            "value2": "@outcomes-prop2-value2",
        },
    },
    questions: {
        "question-1": {
            answersMin: 1,
            answersMax: 1,
            answers: {
                "yes": {label: "@answer-yes", outcome: {prop1: "value1", prop2: "value2"}},
                "no": {label: "No"},
            },
            rules: [
                {match: "all", items: {"question-2": "no", "question-3": "yes"}},
                {match: "any", items: {"question-2": "no", "question-3": "yes"}},
            ],
        },
    },
};

/* QuestionTree Component */

export const QuestionTreeComponentName = `QuestionTreeComponent` as const;
export type QuestionTreeComponentNameType = typeof QuestionTreeComponentName;

export interface QuestionTreeFieldComponentConfigFrame extends FieldComponentConfigFrame {
    outcomes: QuestionTreeOutcomes;
    questions: QuestionTreeQuestions;
}

export interface QuestionTreeFieldComponentConfigOutline extends QuestionTreeFieldComponentConfigFrame, FieldComponentConfigOutline {

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
export type QuestionTreeModelValueType = unknown[];

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
