import {
    DefaultLayoutMap,
    RepeatableMap,
    DefaultLayoutFrames,
    RepeatableFrames,
    GroupFrames,
    GroupMap,
    SaveButtonFrames,
    SaveButtonMap,
    TextAreaFrames,
    TextAreaMap,
} from "./component";
import {
    FormComponentDefinitionKindType,
    FormFieldComponentDefinitionKindType,
    FormFieldComponentConfigKindType,
    FormFieldModelDefinitionKindType,
    FormFieldModelConfigKindType,
    FormFieldLayoutDefinitionKindType,
    FormFieldLayoutConfigKindType,
    AvailableFormKindTypes,
    FormFieldLayoutConfigKind,
    FormFieldLayoutDefinitionKind,
    FormFieldModelConfigKind,
    FormFieldModelDefinitionKind,
    FormFieldComponentConfigKind,
    FormFieldComponentDefinitionKind,
    FormComponentDefinitionKind,
    FormComponentDefinitionFrame,
    FormFieldComponentConfigFrame,
    FormFieldComponentDefinitionFrame,
    FormFieldModelConfigFrame,
    FormFieldModelDefinitionFrame,
    FormFieldLayoutConfigFrame,
    FormFieldLayoutDefinitionFrame
} from ".";

/* Ensure all available types, interfaces, and classes are added here. */

/**
 * The static type union of all available interfaces that provides typing for the object literal and schema.
 * Other convenience mappings are built from this.
 */
export type AvailableFrames =
    DefaultLayoutFrames |
    RepeatableFrames |
    GroupFrames |
    SaveButtonFrames |
    TextAreaFrames;

/**
 * The static array of all available classes and the kind of class.
 * Other convenience mappings are built from this.
 */
export const StaticMap = [
    ...DefaultLayoutMap,
    ...RepeatableMap,
    ...GroupMap,
    ...SaveButtonMap,
    ...TextAreaMap,
] as const;

/*
 * The variables below here are conveniences that provide access to the various groups
 * of types, interfaces, and classes.
 * These should update as entries are added above, and should not need to be changed.
 */

/**
 * A compile-time-only type union of all the available types.
 */
export type StaticMapTypes = typeof StaticMap[number];

/**
 * A compile-time-only type union of all the classes.
 */
export type AllAvailableClassNames = Pick<Extract<StaticMapTypes, { class: string }>, 'class'>['class'];

/*
 * Compile-time-only type unions for the various kinds of classes.
 * These make it easier to reference the set of types of one kind.
 */

export type FormComponentDefinitionFrameTypes = Extract<AvailableFrames, FormComponentDefinitionFrame>;
export type FormComponentDefinitionTypes = Pick<Extract<StaticMapTypes, {
    kind: FormComponentDefinitionKindType
}>, 'def'>['def'];

export type FormFieldComponentDefinitionFrameTypes = Extract<AvailableFrames, FormFieldComponentDefinitionFrame>;
export type FormFieldComponentDefinitionTypes = Pick<Extract<StaticMapTypes, {
    kind: FormFieldComponentDefinitionKindType
}>, 'def'>['def'];

export type FormFieldComponentConfigFrameTypes = Extract<AvailableFrames, FormFieldComponentConfigFrame>;
export type FormFieldComponentConfigTypes = Pick<Extract<StaticMapTypes, {
    kind: FormFieldComponentConfigKindType
}>, 'def'>['def'];


export type FormFieldModelDefinitionFrameTypes = Extract<AvailableFrames, FormFieldModelDefinitionFrame<unknown>>;
export type FormFieldModelDefinitionTypes = Pick<Extract<StaticMapTypes, {
    kind: FormFieldModelDefinitionKindType
}>, 'def'>['def'];

export type FormFieldModelConfigFrameTypes = Extract<AvailableFrames, FormFieldModelConfigFrame<unknown>>;
export type FormFieldModelConfigTypes = Pick<Extract<StaticMapTypes, {
    kind: FormFieldModelConfigKindType
}>, 'def'>['def'];

export type FormFieldLayoutDefinitionFrameTypes = Extract<AvailableFrames, FormFieldLayoutDefinitionFrame>;
export type FormFieldLayoutDefinitionTypes = Pick<Extract<StaticMapTypes, {
    kind: FormFieldLayoutDefinitionKindType
}>, 'def'>['def'];

export type FormFieldLayoutConfigFrameTypes = Extract<AvailableFrames, FormFieldLayoutConfigFrame>;
export type FormFieldLayoutConfigTypes = Pick<Extract<StaticMapTypes, {
    kind: FormFieldLayoutConfigKindType
}>, 'def'>['def'];

/*
 * Runtime variables containing one of the different kinds of classes.
 * These make it easier to reference the set of classes of one kind.
 */

/**
 * Build a js map from the static map containing only the kind of entries.
 * @param staticMap
 * @param kind
 */
function buildMap(
    // TODO: fix the typing here - it's a bit tricky to get right
    staticMap: any,
    kind: AvailableFormKindTypes
) {
    return new Map(staticMap
        .filter((i: any) => i.kind === kind && i.class)
        .map((i: any) => [i.class, i.def])
    );
}

export const FormComponentDefinitions = buildMap(StaticMap, FormComponentDefinitionKind);
export const FormFieldComponentDefinitions = buildMap(StaticMap, FormFieldComponentDefinitionKind);
export const FormFieldComponentConfigs = buildMap(StaticMap, FormFieldComponentConfigKind);
export const FormFieldModelDefinitions = buildMap(StaticMap, FormFieldModelDefinitionKind);
export const FormFieldModelConfigs = buildMap(StaticMap, FormFieldModelConfigKind);
export const FormFieldLayoutDefinitions = buildMap(StaticMap, FormFieldLayoutDefinitionKind);
export const FormFieldLayoutConfigs = buildMap(StaticMap, FormFieldLayoutConfigKind);


// function whichComponentDefinition(compDef: FormFieldDefinitionTypes) {
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
// function whichLayouts(def: FormFieldLayoutDefinition) {
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
// export type StaticNameModelCompMapType = new (...args: ConstructorParameters<BaseFormFieldDefinition>) => BaseFormFieldDefinition;
// export type StaticNameModelCompMapType = abstract new(...args: infer P) => any ? P : never;
// type Testing<T extends abstract new (...args: any) => any> = T extends abstract new (...args: infer P) => any ? P : never;
// type AbstractConstructorParameters<T> = T extends abstract new(...args: infer P) => any ? P : never;
// type StaticNameModelCompMapType = new (className: string, config?: BaseFormFieldComponentConfig) => typeof BaseFormFieldDefinition;
// export const staticNameModelCompMap: {[index: string]: StaticNameModelCompMapType } = {
//     [RepeatableComponentName]: RepeatableFormFieldComponentDefinition,
//     [RepeatableModelName]: RepeatableFormFieldModelDefinition,
//     [RepeatableElementLayoutComponentName]: RepeatableElementFormFieldLayoutDefinition,
//     [ContentComponentName]: ContentFormFieldComponentDefinition,
// };


/*
* Proof of concept for a 'collection' of component, model, layout.
*/

// There needs to be some definition that will be present in js of the collection of classes.
// const pocCompDefCollection1 = {
//     component: RepeatableFormFieldComponentDefinition,
//     model: RepeatableFormFieldModelDefinition,
//     layout: RepeatableElementFormFieldLayoutDefinition,
// } as const
// const pocCompDefCollection2 = {
//     component: ContentFormFieldComponentDefinition,
// } as const

// The static definition can be transformed into typescript types.
// const pocFormFieldComponentDefinitions = [pocCompDefCollection1, pocCompDefCollection2].map(i => i.component).filter(i => !!i);
// export type pocFormFieldComponentDefinitionsType = typeof pocFormFieldComponentDefinitions[number];

/*
 * TODO: Proof of concept for defining the class string and js class.
 */


// export class SimpleInputFormComponentDefinition extends FormComponentDefinition {
//     constructor(name: string, component: SimpleInputComponentDefinition) {
//         super(name, component);
//     }
// }

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
