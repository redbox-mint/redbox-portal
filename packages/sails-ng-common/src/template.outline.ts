import {LineagePath, normaliseVisual} from "./config/names/naming-helpers";

export const templateCompileKind = ["jsonata", "handlebars"] as const;

export type TemplateCompileKind = typeof templateCompileKind[number];

export type TemplateCompileKey = LineagePath;
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
    return (key ?? [])?.map(i => normaliseVisual(i))?.join('__');
}

/**
 * The form config lineage path to use as the key for selecting the compiled template.
 */
export type DynamicScriptResponseEvaluateKey = TemplateCompileKey;
/**
 * Context to pass to the template evaluator.
 */
export type DynamicScriptResponseEvaluateContext = unknown;
/**
 * Provide the template library evaluator functions.
 */
export type DynamicScriptResponseEvaluateExtra = {
  libraries?: { jsonata?: Function, handlebars?: Function, [key: string]: unknown }
};
/**
 * The result of evaluating the template.
 */
export type DynamicScriptResponseEvaluateResult = unknown;
/**
 * The evaluator function provided by the server to the client.
 */
export type DynamicScriptResponseEvaluate = (
  /**
   * The form config lineage path to use as the key for selecting the compiled template.
   */
  key: DynamicScriptResponseEvaluateKey,
  /**
   * Context to pass to the template evaluator.
   */
  context: DynamicScriptResponseEvaluateContext,
  /**
   * Provide the template library evaluator functions.
   */
  extra?: DynamicScriptResponseEvaluateExtra,
) => DynamicScriptResponseEvaluateResult;

/**
 * The type of the dynamic script asset response after import.
 */
export interface DynamicScriptResponse {
  /**
   * The evaluator function provided by the server to the client.
   */
  evaluate: DynamicScriptResponseEvaluate,
}
