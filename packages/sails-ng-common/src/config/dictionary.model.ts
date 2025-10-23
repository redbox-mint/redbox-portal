import {DefaultLayoutMap} from "./component/default-layout.model";
import {RepeatableMap} from "./component/repeatable.model";
import {GroupMap,} from "./component/group.model";
import {SaveButtonMap} from "./component/save-button.model";
import {TextAreaMap} from "./component/text-area.model";
import {ContentMap} from "./component/content.model";
import {SimpleInputMap} from "./component/simple-input.model";
import {ValidationSummaryMap} from "./component/validation-summary.model";
import {TabContentMap} from "./component/tab-content.model";
import {TabMap} from "./component/tab.model";
import {
    AllFormFieldKindTypes,
    FieldComponentDefinitionKind,
    FieldLayoutDefinitionKind,
    FieldModelDefinitionKind,
    FormComponentDefinitionKind,
} from "./shared.outline";
import {CheckboxInputMap} from "./component/checkbox-input.model";
import {DropdownInputMap} from "./component/dropdown-input.model";
import {RadioInputMap} from "./component/radio-input.model";
import {DateInputMap} from "./component/date-input.model";


/**
 * The static array of all available classes and the kind of class.
 * Other convenience mappings are built from this.
 */
export const AllDefs = [
    ...DefaultLayoutMap,
    ...RepeatableMap,
    ...GroupMap,
    ...SaveButtonMap,
    ...TextAreaMap,
    ...ContentMap,
    ...SimpleInputMap,
    ...ValidationSummaryMap,
    ...TabContentMap,
    ...TabMap,
    ...CheckboxInputMap,
    ...DropdownInputMap,
    ...RadioInputMap,
    ...DateInputMap,
] as const;


/**
 * A type declaration that converts the array of mappings to a type union.
 */
export type AllDefsArrayType = typeof AllDefs;


/**
 * Build a js map from the static map containing only the kind of entries.
 */
function buildMap(
    allDefs: AllDefsArrayType,
    kinds?: AllFormFieldKindTypes[],
) {
    const result = new Map();
    for (const def of allDefs) {
        if (!def.class || !def.def) {
            continue;
        }
        if (kinds && !kinds.includes(def.kind)) {
            continue;
        }
        result.set(def.class, def.def);
    }
    return result;
}

/*
 * Runtime variables containing one of the different kinds of classes.
 * These make it easier to reference the set of classes of one kind.
 */

// TODO: use generics in buildMap to determine what the return value will be?
export const FieldComponentDefinitionMap = buildMap(AllDefs, [FieldComponentDefinitionKind]);
export const FieldModelDefinitionMap = buildMap(AllDefs, [FieldModelDefinitionKind]);
export const FieldLayoutDefinitionMap = buildMap(AllDefs, [FieldLayoutDefinitionKind]);
export const FormComponentDefinitionMap = buildMap(AllDefs, [FormComponentDefinitionKind]);

/*
 * Define types for the class names of the components, models, layouts.
 *
 * This allows typing the static class maps to ensure all defined items are also
 * present in the angular mapping.
 */
export type StaticClassMapType<K extends string, T> = Record<K, T>;

export const ComponentClassNames = AllDefs.filter(i => i.kind === FieldComponentDefinitionKind).map(i => i.class);
export type ComponentClassNamesType = typeof ComponentClassNames[number];
export type StaticComponentClassMapGenType<T> = StaticClassMapType<ComponentClassNamesType, T>;

export const ModelClassNames = AllDefs.filter(i => i.kind === FieldModelDefinitionKind).map(i => i.class);
export type ModelClassNamesType = typeof ModelClassNames[number];
export type StaticModelClassMapGenType<T> = StaticClassMapType<ModelClassNamesType, T>;

export const LayoutClassNames = AllDefs.filter(i => i.kind === FieldLayoutDefinitionKind).map(i => i.class);
export type LayoutClassNamesType = typeof LayoutClassNames[number];
export type StaticLayoutClassMapGenType<T> = StaticClassMapType<LayoutClassNamesType, T>;
