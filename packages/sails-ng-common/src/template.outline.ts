export const templateCompileKind = ["jsonata", "handlebars"] as const;

export type TemplateCompileKind = typeof templateCompileKind[number];

export type TemplateCompileKey = string[];
export type TemplateCompileKeyFormatted = string;
export type TemplateCompileValue = string;

/**
 * One compile mapping builder input or output.
 */
export interface TemplateCompileItem {
    /**
     * The key to access the compiled value in the output mapping.
     *
     * Must be unique across all inputs for one call to the compiled mapping builder.
     */
    key: TemplateCompileKey;

    /**
     * The value string in either the raw form or the compiled form.
     */
    value: TemplateCompileValue;
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
 * Build a string key that can be used on the server and client.
 * @param key The array of names and indexes.
 */
export function buildKeyString(key: TemplateCompileKey): TemplateCompileKeyFormatted {
    return (key ?? [])?.map(i => i?.toString()?.normalize("NFKC"))?.join('__');
}
