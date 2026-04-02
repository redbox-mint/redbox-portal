import {FormModesConfig} from "./shared.outline";
import {AllFormComponentDefinitionOutlines} from "./dictionary.outline";
import {VisitorComponentClassNamesType} from "./dictionary.model";
import {FormOverrideModesClassConfig} from "./form-component.outline";

/**
 * The type that specifies the known transformations.
 */
export type KnownTransformsType = Partial<{
    /**
     * The source component class name.
     */
    [key in VisitorComponentClassNamesType]: Partial<{
        /**
         * The target component class name.
         * TODO: fix types - instead of any, it should be a union of kind types
         */
        [key in VisitorComponentClassNamesType]: (source: any, formMode: FormModesConfig) => AllFormComponentDefinitionOutlines
    }>
}>;

export type DefaultTransformsType = Partial<{
    /**
     * The source component class name.
     */
    [key in VisitorComponentClassNamesType]: FormOverrideModesClassConfig
}>;
