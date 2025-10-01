export const templateCompileKind = ["jsonata", "handlebars"] as const;

export type TemplateCompileKind = typeof templateCompileKind[number];

/**
 * One compile mapping builder input or output.
 */
export interface TemplateCompileItem {
    /**
     * The key to access the compiled value in the output mapping.
     *
     * Must be unique across all inputs for one call to the compiled mapping builder.
     */
    key: string;

    /**
     * The value string in either the raw form or the compiled form.
     */
    value: string;
}

/**
 * One input to the compile mapping builder.
 */
export interface TemplateCompileInput extends TemplateCompileItem {
    /**
     * The kind indicates the format of the value.
     */
    kind: TemplateCompileKind;
}

/**
 * An interface for classes that might have templates that can be compiled.
 */
export interface HasCompilableTemplates {
    /**
     * Get all the templates for this component.
     */
    get templates(): TemplateCompileInput[];
}
