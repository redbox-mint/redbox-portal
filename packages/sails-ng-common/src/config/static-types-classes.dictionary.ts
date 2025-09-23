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
    ContentMap,
    ContentFrames,
    SimpleInputMap,
    SimpleInputFrames, ValidationSummaryMap, ValidationSummaryFrames, TabMap, TabFrames,
    FormComponentDefinitionKindType,
    FieldComponentDefinitionKindType,
    FieldComponentConfigKindType,
    FieldModelDefinitionKindType,
    FieldModelConfigKindType,
    FieldLayoutDefinitionKindType,
    FieldLayoutConfigKindType,
    AvailableFormKindTypes,
    FieldLayoutConfigKind,
    FieldLayoutDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind,
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FormComponentDefinitionKind,
    FormComponentDefinitionFrame,
    FieldComponentConfigFrame,
    FieldComponentDefinitionFrame,
    FieldModelConfigFrame,
    FieldModelDefinitionFrame,
    FieldLayoutConfigFrame,
    FieldLayoutDefinitionFrame,
    TabContentFrames, TabContentMap, TabContentFormComponentDefinitionFrame
} from "..";

/* Ensure all available types, interfaces, and classes are added here. */


/**
 * The static type union of all available interfaces that provides typing for the object literal and schema.
 * Other convenience mappings are built from this.
 */
export type AvailableFrames =
    DefaultLayoutFrames
    | RepeatableFrames
    | GroupFrames
    | SaveButtonFrames
    | TextAreaFrames
    | ContentFrames
    | SimpleInputFrames
    | ValidationSummaryFrames
    | TabContentFrames
    | TabFrames;

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
export type StaticMapTypes = typeof StaticMap[number];

/**
 * A compile-time-only type union of all the classes.
 */
export type AllAvailableClassNames = Pick<Extract<StaticMapTypes, { class: string }>, 'class'>['class'];

/*
 * Compile-time-only type unions for the various kinds of classes.
 * These make it easier to reference the set of types of one kind.
 */

export type AllFormComponentDefinitionFrames = Extract<AvailableFrames, FormComponentDefinitionFrame>;
export type AllFormComponentDefinitions = InstanceType<Pick<Extract<StaticMapTypes, {
    kind: FormComponentDefinitionKindType
}>, 'def'>['def']>;


export type AvailableFormComponentDefinitionFrames = Omit<AllFormComponentDefinitionFrames, 'TabContentFormComponentDefinitionFrame'>;
export type AvailableFormComponentDefinitions = Omit<AllFormComponentDefinitions, 'TabContentFormComponentDefinition'>;


export type AllFieldComponentDefinitionFrames = Extract<AvailableFrames, FieldComponentDefinitionFrame>;
export type AllFieldComponentDefinitions = InstanceType<Pick<Extract<StaticMapTypes, {
    kind: FieldComponentDefinitionKindType
}>, 'def'>['def']>;

export type AvailableFieldComponentDefinitionFrames = Omit<AllFieldComponentDefinitionFrames, 'TabContentFieldComponentDefinitionFrame'>;
export type AvailableFieldComponentDefinitions = Omit<AllFieldComponentDefinitions, 'TabContentFieldComponentDefinition'>;

export type AllFieldComponentConfigFrames = Extract<AvailableFrames, FieldComponentConfigFrame>;
export type AllFieldComponentConfigs = InstanceType<Pick<Extract<StaticMapTypes, {
    kind: FieldComponentConfigKindType
}>, 'def'>['def']>;


export type AllFieldModelDefinitionFrames = Extract<AvailableFrames, FieldModelDefinitionFrame<unknown>>;
export type AllFieldModelDefinitions = InstanceType<Pick<Extract<StaticMapTypes, {
    kind: FieldModelDefinitionKindType
}>, 'def'>['def']>;

export type AllFieldModelConfigFrames = Extract<AvailableFrames, FieldModelConfigFrame<unknown>>;
export type AllFieldModelConfigs = InstanceType<Pick<Extract<StaticMapTypes, {
    kind: FieldModelConfigKindType
}>, 'def'>['def']>;

export type AllFieldLayoutDefinitionFrames = Extract<AvailableFrames, FieldLayoutDefinitionFrame>;
export type AllFieldLayoutDefinitions = InstanceType<Pick<Extract<StaticMapTypes, {
    kind: FieldLayoutDefinitionKindType
}>, 'def'>['def']>;

export type AllFieldLayoutConfigFrames = Extract<AvailableFrames, FieldLayoutConfigFrame>;
export type AllFieldLayoutConfigs = InstanceType<Pick<Extract<StaticMapTypes, {
    kind: FieldLayoutConfigKindType
}>, 'def'>['def']>;

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
export const FieldComponentDefinitions = buildMap(StaticMap, FieldComponentDefinitionKind);
export const FieldComponentConfigs = buildMap(StaticMap, FieldComponentConfigKind);
export const FieldModelDefinitions = buildMap(StaticMap, FieldModelDefinitionKind);
export const FieldModelConfigs = buildMap(StaticMap, FieldModelConfigKind);
export const FieldLayoutDefinitions = buildMap(StaticMap, FieldLayoutDefinitionKind);
export const FieldLayoutConfigs = buildMap(StaticMap, FieldLayoutConfigKind);


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
