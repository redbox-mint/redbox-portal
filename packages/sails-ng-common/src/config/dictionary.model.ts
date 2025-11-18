import {
    FieldComponentDefinitionKind,
    FieldLayoutDefinitionKind,
    FieldModelDefinitionKind,
    FormComponentDefinitionKind,
} from "./shared.outline";

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
import {CheckboxInputMap} from "./component/checkbox-input.model";
import {DropdownInputMap} from "./component/dropdown-input.model";
import {RadioInputMap} from "./component/radio-input.model";
import {DateInputMap} from "./component/date-input.model";
import {ReusableMap} from "./component/reusable.model";


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
    ...ReusableMap,
] as const;

/*
 * Define types for the class names of the components, models, layouts.
 *
 * This allows typing the static class maps to ensure all defined items are also
 * present in the angular mapping.
 */
export type StaticClassMapType<K extends string, T> = Record<K, T>;

export const ComponentDefs = AllDefs.filter(i => i.kind === FieldComponentDefinitionKind);
export const ComponentClassNames = ComponentDefs.map(i => i.class);
export const ComponentDefItems = ComponentDefs.map(i => i.def);
export type ComponentClassNamesType = typeof ComponentClassNames[number];
export type StaticComponentClassMapGenType<T> = StaticClassMapType<ComponentClassNamesType, T>;
export type ComponentDefItemsType = typeof ComponentDefItems[number];
export type ComponentClassDefMapType = Map<string, ComponentDefItemsType>;

export const ModelDefs = AllDefs.filter(i => i.kind === FieldModelDefinitionKind);
export const ModelClassNames = ModelDefs.map(i => i.class);
export const ModelDefItems = ModelDefs.map(i => i.def);
export type ModelClassNamesType = typeof ModelClassNames[number];
export type StaticModelClassMapGenType<T> = StaticClassMapType<ModelClassNamesType, T>;
export type ModelDefItemsType = typeof ModelDefItems[number];
export type ModelClassDefMapType = Map<string, ModelDefItemsType>;

export const LayoutDefs = AllDefs.filter(i => i.kind === FieldLayoutDefinitionKind);
export const LayoutClassNames = LayoutDefs.map(i => i.class);
export const LayoutDefItems = LayoutDefs.map(i => i.def);
export type LayoutClassNamesType = typeof LayoutClassNames[number];
export type StaticLayoutClassMapGenType<T> = StaticClassMapType<LayoutClassNamesType, T>;
export type LayoutDefItemsType = typeof LayoutDefItems[number];
export type LayoutClassDefMapType = Map<string, LayoutDefItemsType>;

export type AvailableClassNamesType = ComponentClassNamesType | ModelClassNamesType | LayoutClassNamesType;

export const FormComponentDefs = AllDefs.filter(i => i.kind === FormComponentDefinitionKind);
// export const FormComponentClassNames = FormComponentDefs.map(i => i.class);
export const FormComponentDefItems = FormComponentDefs.map(i => i.def);
// export type FormComponentClassNamesType = typeof FormComponentClassNames[number];
// export type StaticFormComponentClassMapGenType<T> = StaticClassMapType<FormComponentClassNamesType, T>;
export type FormComponentDefItemsType = typeof FormComponentDefItems[number];
export type FormComponentClassDefMapType = Map<string, FormComponentDefItemsType>;



/*
 * Runtime variables containing one of the different kinds of classes.
 * These make it easier to reference the set of classes of one kind.
 */

function toClassDefMap<T>(
    items: ({ kind: string; def: T; class: string; })[]
): Map<string, T> {
    return new Map(items.map(i => [i.class, i.def]));
}

export const FieldComponentDefinitionMap: ComponentClassDefMapType = toClassDefMap<ComponentDefItemsType>(ComponentDefs);
export const FieldModelDefinitionMap: ModelClassDefMapType = toClassDefMap<ModelDefItemsType>(ModelDefs);
export const FieldLayoutDefinitionMap: LayoutClassDefMapType = toClassDefMap<LayoutDefItemsType>(LayoutDefs);
export const FormComponentDefinitionMap: FormComponentClassDefMapType = toClassDefMap<FormComponentDefItemsType>(FormComponentDefs);
