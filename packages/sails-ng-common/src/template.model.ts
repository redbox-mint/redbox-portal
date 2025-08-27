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
