import {TemplateCompileItem} from "@researchdatabox/sails-ng-common";

export const templateCompileKind = ["jsonata", "handlebars"] as const;

export type TemplateCompileKind = typeof templateCompileKind[number];

/**
 * One input to the compile mapping builder.
 */
export interface TemplateCompileInput extends TemplateCompileItem {
    /**
     * The kind indicates the format of the value.
     */
    kind: TemplateCompileKind;
}
