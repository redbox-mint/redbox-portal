import {
    FieldComponentDefinitionKind,
    FieldLayoutDefinitionKind,
    FieldModelDefinitionKind,
    FormComponentDefinitionKind,
} from "./shared.outline";

import { DefaultLayoutDefaults, DefaultLayoutMap } from "./component/default-layout.model";
import { RepeatableDefaults, RepeatableMap } from "./component/repeatable.model";
import { GroupDefaults, GroupMap, } from "./component/group.model";
import { SaveButtonDefaults, SaveButtonMap } from "./component/save-button.model";
import { TextAreaDefaults, TextAreaMap } from "./component/text-area.model";
import { ContentDefaults, ContentMap } from "./component/content.model";
import { SimpleInputDefaults, SimpleInputMap } from "./component/simple-input.model";
import { ValidationSummaryDefaults, ValidationSummaryMap } from "./component/validation-summary.model";
import { TabContentDefaults, TabContentMap } from "./component/tab-content.model";
import { TabDefaults, TabMap } from "./component/tab.model";
import { CheckboxInputDefaults, CheckboxInputMap } from "./component/checkbox-input.model";
import { DropdownInputDefaults, DropdownInputMap } from "./component/dropdown-input.model";
import { RadioInputDefaults, RadioInputMap } from "./component/radio-input.model";
import { DateInputDefaults, DateInputMap } from "./component/date-input.model";
import { ReusableDefaults, ReusableMap } from "./component/reusable.model";
import { ReusableComponentName } from "./component/reusable.outline";
import { CheckboxTreeDefaults, CheckboxTreeMap } from "./component/checkbox-tree.model";
import { TypeaheadInputDefaults, TypeaheadInputMap } from "./component/typeahead-input.model";
import { RichTextEditorDefaults, RichTextEditorMap } from "./component/rich-text-editor.model";
import { MapDefaults, MapMap } from "./component/map.model";
import { FileUploadDefaults, FileUploadMap } from "./component/file-upload.model";


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
    ...CheckboxTreeMap,
    ...TypeaheadInputMap,
    ...RichTextEditorMap,
    ...MapMap,
    ...FileUploadMap,
] as const;

/**
 * The static array of all default mappings from kind to class names.
 * Mapping: source kind -> source name -> target kind -> target name.
 */
const RawDefaults = [
    // DefaultLayoutDefaults,
    RepeatableDefaults,
    GroupDefaults,
    SaveButtonDefaults,
    TextAreaDefaults,
    ContentDefaults,
    SimpleInputDefaults,
    ValidationSummaryDefaults,
    TabContentDefaults,
    TabDefaults,
    CheckboxInputDefaults,
    DropdownInputDefaults,
    RadioInputDefaults,
    DateInputDefaults,
    ReusableDefaults,
    CheckboxTreeDefaults,
    TypeaheadInputDefaults,
    RichTextEditorDefaults,
    MapDefaults,
    FileUploadDefaults,
]

/**
 * Mapping of source kind to source name, to target kind to target name.
 */
export type KindNameDefaultsMapType = Map<string, Map<string, Map<string, string>>>;
export const KindNameDefaultsMap: KindNameDefaultsMapType = new Map<string, Map<string, Map<string, string>>>();
for (const rawDefault of RawDefaults) {
    for (const [sourceKind, sourceNameObj] of Object.entries(rawDefault)) {
        if (!KindNameDefaultsMap.has(sourceKind)) {
            KindNameDefaultsMap.set(sourceKind, new Map<string, Map<string, string>>());
        }
        const sourceNameMap = KindNameDefaultsMap.get(sourceKind);
        if (sourceNameMap) {
            for (const [sourceName, targetObj] of Object.entries(sourceNameObj)) {
                if (!sourceNameMap.has(sourceName)) {
                    sourceNameMap.set(sourceName, new Map<string, string>());
                }
                const targetMap = sourceNameMap.get(sourceName);
                if (targetMap) {
                    for (const [targetKind, targetName] of Object.entries(targetObj ?? {})) {
                        if (targetMap.has(targetKind)) {
                            throw new Error(`Name defaults map already has an entry for source kind '${sourceKind}' name '${sourceName}', cannot add another one.`);
                        } else {
                            targetMap.set(targetKind, targetName?.toString() ?? "");
                        }
                    }
                }
            }
        }
    }
}

/*
 * Define types for the class names of the components, models, layouts.
 *
 * This allows typing the static class maps to ensure all defined items are also
 * present in the angular mapping.
 *
 * Excludes the Reusable component class names, as these are only valid in the migration visitor.
 */
export type StaticClassMapType<K extends string, T> = Record<K, T>;

const ComponentDefs = AllDefs.filter(i => i.kind === FieldComponentDefinitionKind);
const ComponentClassNames = ComponentDefs.filter(i => i.class !== ReusableComponentName).map(i => i.class);
export type ComponentClassNamesType = typeof ComponentClassNames[number];
export type StaticComponentClassMapGenType<T> = StaticClassMapType<ComponentClassNamesType, T>;

const ModelDefs = AllDefs.filter(i => i.kind === FieldModelDefinitionKind);
const ModelClassNames = ModelDefs.map(i => i.class);
export type ModelClassNamesType = typeof ModelClassNames[number];
export type StaticModelClassMapGenType<T> = StaticClassMapType<ModelClassNamesType, T>;

const LayoutDefs = AllDefs.filter(i => i.kind === FieldLayoutDefinitionKind);
const LayoutClassNames = LayoutDefs.map(i => i.class);
export type LayoutClassNamesType = typeof LayoutClassNames[number];
export type StaticLayoutClassMapGenType<T> = StaticClassMapType<LayoutClassNamesType, T>;


/*
 * Runtime variables containing one of the different kinds of classes.
 * These make it easier to reference the set of classes of one kind.
 *
 * Includes the Reusable component names, as these are needed in the migration visitor.
 */

function toClassDefMap<T>(
    items: ({ kind: string; def: T; class: string; })[]
): Map<string, T> {
    return new Map(items.map(i => [i.class, i.def]));
}

const VisitorComponentDefs = AllDefs.filter(i => i.kind === FieldComponentDefinitionKind);
const VisitorComponentClassNames = ComponentDefs.map(i => i.class);
const VisitorComponentDefItems = VisitorComponentDefs.map(i => i.def);
type VisitorComponentDefItemsType = typeof VisitorComponentDefItems[number];
export type VisitorComponentClassNamesType = typeof VisitorComponentClassNames[number];
export type VisitorComponentClassDefMapType = Map<string, VisitorComponentDefItemsType>;

const VisitorModelDefs = AllDefs.filter(i => i.kind === FieldModelDefinitionKind);
const VisitorModelDefItems = VisitorModelDefs.map(i => i.def);
type VisitorModelDefItemsType = typeof VisitorModelDefItems[number];
export type VisitorModelClassDefMapType = Map<string, VisitorModelDefItemsType>;

const VisitorLayoutDefs = AllDefs.filter(i => i.kind === FieldLayoutDefinitionKind);
const VisitorLayoutDefItems = VisitorLayoutDefs.map(i => i.def);
type VisitorLayoutDefItemsType = typeof VisitorLayoutDefItems[number];
export type VisitorLayoutClassDefMapType = Map<string, VisitorLayoutDefItemsType>;

const VisitorFormComponentDefs = AllDefs.filter(i => i.kind === FormComponentDefinitionKind);
const VisitorFormComponentDefItems = VisitorFormComponentDefs.map(i => i.def);
type VisitorFormComponentDefItemsType = typeof VisitorFormComponentDefItems[number];
export type VisitorFormComponentClassDefMapType = Map<string, VisitorFormComponentDefItemsType>;

export const FieldComponentDefinitionMap: VisitorComponentClassDefMapType = toClassDefMap<VisitorComponentDefItemsType>(VisitorComponentDefs);
export const FieldModelDefinitionMap: VisitorModelClassDefMapType = toClassDefMap<VisitorModelDefItemsType>(ModelDefs);
export const FieldLayoutDefinitionMap: VisitorLayoutClassDefMapType = toClassDefMap<VisitorLayoutDefItemsType>(LayoutDefs);
export const FormComponentDefinitionMap: VisitorFormComponentClassDefMapType = toClassDefMap<VisitorFormComponentDefItemsType>(VisitorFormComponentDefs);
