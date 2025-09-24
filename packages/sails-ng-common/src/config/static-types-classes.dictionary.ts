import {DefaultLayoutFrames, DefaultLayoutMap } from "./component/default-layout.model";
import {RepeatableFrames, RepeatableMap} from "./component/repeatable.model";
import {GroupFrames, GroupMap, } from "./component/group.model";
import {SaveButtonFrames, SaveButtonMap} from "./component/save-button.model";
import { TextAreaFrames, TextAreaMap } from "./component/textarea.model";
import { ContentFrames, ContentMap } from "./component/textblock.model";
import {SimpleInputFrames, SimpleInputMap} from "./component/simpleinput.model";
import {ValidationSummaryFrames, ValidationSummaryMap} from "./component/validation-summary.model";
import { TabContentFrames, TabContentMap } from "./component/tab-content.model";
import {TabFrames, TabMap} from "./component/tab.model";
import {
    FieldComponentConfigKindType,
    FieldComponentDefinitionKindType,
    FieldLayoutConfigKindType, FieldLayoutDefinitionKindType, FieldModelConfigKindType, FieldModelDefinitionKindType,
    FormComponentDefinitionKindType
} from "./shared.model";



/* Ensure all available types, interfaces, and classes are added here. */


/**
 * The static type union of all available interfaces that provides typing for the object literal and schema.
 * Other convenience mappings are built from this.
 */
export type AllFrames =
    DefaultLayoutFrames
    | RepeatableFrames
    | GroupFrames
    | SaveButtonFrames
    | TextAreaFrames
    | ContentFrames
    | SimpleInputFrames
    | ValidationSummaryFrames
    | TabContentFrames
    | TabFrames
    ;

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
] as const;

/*
 * The variables below here are conveniences that provide access to the various groups
 * of types, interfaces, and classes.
 * These should update as entries are added above, and should not need to be changed.
 */

/**
 * A compile-time-only type union of all the available types.
 */
export type AllDefTypes = typeof AllDefs[number];

/**
 * A compile-time-only type union of all the classes.
 */
export type AllAvailableClassNames = Pick<Extract<AllDefTypes, { class: string }>, 'class'>['class'];

/*
 * Compile-time-only type unions for the various kinds of classes.
 * These make it easier to reference the set of types of one kind.
 */


// All FormComponentDefinition Frames and Classes

export type AllFormComponentDefinitionFrames = Extract<AllFrames, FormComponentDefinitionFrame>;
export type AllFormComponentDefinitions = InstanceType<Pick<Extract<AllDefTypes, {
    kind: FormComponentDefinitionKindType
}>, 'def'>['def']>;

// The available FormComponentDefinition Frames and Classes that are not special and can be used anywhere.

export type AvailableFormComponentDefinitionFrames = Exclude<AllFormComponentDefinitionFrames, TabContentFormComponentDefinitionFrame>;
export type AvailableFormComponentDefinitions = Exclude<AllFormComponentDefinitions, TabContentFormComponentDefinition>;


// All FieldComponentDefinition Frames and Classes

export type AllFieldComponentDefinitionFrames = Extract<AllFrames, FieldComponentDefinitionFrame>;
export type AllFieldComponentDefinitions = InstanceType<Pick<Extract<AllDefTypes, {
    kind: FieldComponentDefinitionKindType
}>, 'def'>['def']>;

// The available FieldComponentDefinition Frames and Classes that are not special and can be used anywhere.

export type AvailableFieldComponentDefinitionFrames = Exclude<AllFieldComponentDefinitionFrames, TabContentFieldComponentDefinitionFrame>;
export type AvailableFieldComponentDefinitions = Exclude<AllFieldComponentDefinitions, TabContentFieldComponentDefinition>;

export type TabContentFieldComponentDefinitionFrames = Extract<AllFieldComponentDefinitionFrames, TabContentFieldComponentDefinitionFrame>;
export type TabContentFieldComponentDefinitions = Extract<AllFieldComponentDefinitions, TabContentFieldComponentDefinition>;


// All FieldComponentConfig Frames and Classes

export type AllFieldComponentConfigFrames = Extract<AllFrames, FieldComponentConfigFrame>;
export type AllFieldComponentConfigs = InstanceType<Pick<Extract<AllDefTypes, {
    kind: FieldComponentConfigKindType
}>, 'def'>['def']>;

// The available FieldComponentDefinition Frames and Classes that are not special and can be used anywhere.

export type AvailableFieldComponentConfigFrames = Exclude<AllFieldComponentConfigFrames, ''>;
export type AvailableFieldComponentConfigs = Exclude<AllFieldComponentConfigs, ''>;

// All FieldModelDefinition Frames and Classes

export type AllFieldModelDefinitionFrames = Extract<AllFrames, FieldModelDefinitionFrame<unknown>>;
export type AllFieldModelDefinitions = InstanceType<Pick<Extract<AllDefTypes, {
    kind: FieldModelDefinitionKindType
}>, 'def'>['def']>;

// The available FieldModelDefinition Frames and Classes that are not special and can be used anywhere.

export type AvailableFieldModelDefinitionFrames = Exclude<AllFieldModelDefinitionFrames, ''>;
export type AvailableFieldModelDefinitions = Exclude<AllFieldModelDefinitions, ''>;

// All FieldModelConfig Frames and Classes

export type AllFieldModelConfigFrames = Extract<AllFrames, FieldModelConfigFrame<unknown>>;
export type AllFieldModelConfigs = InstanceType<Pick<Extract<AllDefTypes, {
    kind: FieldModelConfigKindType
}>, 'def'>['def']>;

// The available FieldModelConfig Frames and Classes that are not special and can be used anywhere.

export type AvailableFieldModelConfigFrames = Exclude<AllFieldModelConfigFrames, ''>;
export type AvailableFieldModelConfigs = Exclude<AllFieldModelConfigs, ''>;

// All FieldLayoutDefinition Frames and Classes

export type AllFieldLayoutDefinitionFrames = Extract<AllFrames, FieldLayoutDefinitionFrame>;
export type AllFieldLayoutDefinitions = InstanceType<Pick<Extract<AllDefTypes, {
    kind: FieldLayoutDefinitionKindType
}>, 'def'>['def']>;

// The available FieldLayoutDefinition Frames and Classes that are not special and can be used anywhere.

export type AvailableFieldLayoutDefinitionFrames = Exclude<AllFieldLayoutDefinitionFrames, ''>;
export type AvailableFieldLayoutDefinitions = Exclude<AllFieldLayoutDefinitions, ''>;

// All FieldLayoutConfig Frames and Classes

export type AllFieldLayoutConfigFrames = Exclude<AllFrames, FieldComponentConfigFrame>;
export type AllFieldLayoutConfigs = InstanceType<Pick<Extract<AllDefTypes, {
    kind: FieldLayoutConfigKindType
}>, 'def'>['def']>;

// The available FieldLayoutConfig Frames and Classes that are not special and can be used anywhere.

export type AvailableFieldLayoutConfigFrames = Exclude<AllFieldLayoutConfigFrames, ''>;
export type AvailableFieldLayoutConfigs = Exclude<AllFieldLayoutConfigs, ''>;

/*
 * Runtime variables containing one of the different kinds of classes.
 * These make it easier to reference the set of classes of one kind.
 */

/**
 * Build a js map from the static map containing only the kind of entries.
 */
function buildMap(
    // TODO: fix the typing here - it's a bit tricky to get right
    allDefs: any,
    kinds?: AvailableFormKindTypes[]
): Map<string, typeof FieldDefinition> {
    return new Map(allDefs
        .filter((i: any) => (kinds === undefined ? true : kinds.includes(i.kind)) && i.class && i.def)
        .map((i: any) => [i.class, i.def])
    );
}

export const FieldComponentDefinitionMap = buildMap(AllDefs, [FieldComponentDefinitionKind]);
export const FieldModelDefinitionMap = buildMap(AllDefs, [FieldModelDefinitionKind]);
export const FieldLayoutDefinitionMap = buildMap(AllDefs, [FieldLayoutDefinitionKind]);
export const AllFieldComponentDefinitionMap = buildMap(AllDefs, [FieldComponentDefinitionKind, FieldModelDefinitionKind, FieldLayoutDefinitionKind]);
export const AllDefMap = buildMap(AllDefs);


// function whichComponentDefinition(compDef: FieldDefinitionTypes) {
//     switch (compDef.component.class) {
//         case RepeatableComponentName:
//             break;
//         case "SimpleInputComponent":
//             break;
//         case "":
//             break;
//     }
// }
//
// function whichLayouts(def: FieldLayoutDefinition) {
//     switch (def.class) {
//         case "DefaultLayoutComponent":
//             break;
//     }
// }


/**
 * Static dictionary that maps class name strings to
 * classes, which enables obtaining the class without evaluating text as js.
 */
// TODO: consider how to use these interfaces to type the map.
//
// export type StaticNameModelCompMapType = new (...args: ConstructorParameters<BaseFieldDefinition>) => BaseFieldDefinition;
// export type StaticNameModelCompMapType = abstract new(...args: infer P) => any ? P : never;
// type Testing<T extends abstract new (...args: any) => any> = T extends abstract new (...args: infer P) => any ? P : never;
// type AbstractConstructorParameters<T> = T extends abstract new(...args: infer P) => any ? P : never;
// type StaticNameModelCompMapType = new (className: string, config?: BaseFieldComponentConfig) => typeof BaseFieldDefinition;
// export const staticNameModelCompMap: {[index: string]: StaticNameModelCompMapType } = {
//     [RepeatableComponentName]: RepeatableFieldComponentDefinition,
//     [RepeatableModelName]: RepeatableFieldModelDefinition,
//     [RepeatableElementLayoutComponentName]: RepeatableElementFieldLayoutDefinition,
//     [ContentComponentName]: ContentFieldComponentDefinition,
// };


/*
* Proof of concept for a 'collection' of component, model, layout.
*/

// There needs to be some definition that will be present in js of the collection of classes.
// const pocCompDefCollection1 = {
//     component: RepeatableFieldComponentDefinition,
//     model: RepeatableFieldModelDefinition,
//     layout: RepeatableElementFieldLayoutDefinition,
// } as const
// const pocCompDefCollection2 = {
//     component: ContentFieldComponentDefinition,
// } as const

// The static definition can be transformed into typescript types.
// const pocFieldComponentDefinitions = [pocCompDefCollection1, pocCompDefCollection2].map(i => i.component).filter(i => !!i);
// export type pocFieldComponentDefinitionsType = typeof pocFieldComponentDefinitions[number];

/*
 * TODO: Proof of concept for defining the class string and js class.
 */


// const FormComponentDefinitions = [RepeatableFormComponentDefinition, ContentFormComponentDefinition, SimpleInputFormComponentDefinition] as const;
// export type FormComponentDefinitionType = InstanceType<typeof FormComponentDefinitions[number]>;
// function whichComponentDefinition(compDef: FormComponentDefinitionType){
//     switch (compDef.component.class) {
//         case RepeatableComponentName:
//             break;
//         case "SimpleInputComponent":
//             break;
//         case "":
//             break;
//     }
// }
