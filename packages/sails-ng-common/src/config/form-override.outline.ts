import {FormModesConfig} from "./shared.outline";
import {AllFormComponentDefinitionOutlines} from "./dictionary.outline";
import {ComponentClassNamesType} from "./dictionary.model";
import {FormOverrideModesClassConfig} from "./form-component.outline";

/**
 * The type that specifies the known transformations.
 */
export type KnownTransformsType = Partial<{
    /**
     * The source component class name.
     */
    [key in ComponentClassNamesType]: Partial<{
        /**
         * The target component class name.
         * TODO: fix types
         */
        [key in ComponentClassNamesType]: (source: any, formMode: FormModesConfig) => AllFormComponentDefinitionOutlines
    }>
}>;

export type DefaultTransformsType = Partial<{
    /**
     * The source component class name.
     */
    [key in ComponentClassNamesType]: FormOverrideModesClassConfig
}>;
