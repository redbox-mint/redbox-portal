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
    FieldComponentDefinitionKindType,
    FieldLayoutDefinitionKind,
    FieldLayoutDefinitionKindType,
    FieldModelDefinitionKind,
    FieldModelDefinitionKindType,
    FormComponentDefinitionKind,
    FormComponentDefinitionKindType,
} from "./shared.outline";
import {CheckboxInputMap} from "./component/checkbox-input.model";
import {DropdownInputMap} from "./component/dropdown-input.model";
import {RadioInputMap} from "./component/radio-input.model";


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
] as const;

/*
 * Runtime variables containing one of the different kinds of classes.
 * These make it easier to reference the set of classes of one kind.
 */

export type AllDefsArrayType = typeof AllDefs;
export type AllDefsUnionType = typeof AllDefs[number];

// type MapKey<BaseType> = BaseType extends Map<infer KeyType, unknown> ? KeyType : never;
// type MapValue<BaseType> = BaseType extends Map<unknown, infer ValueType> ? ValueType : never;
// type MapEntry<BaseType> = [MapKey<BaseType>, MapValue<BaseType>];
// type MapEntries<BaseType> = Array<MapEntry<BaseType>>;
// type MappedEntries<BaseType> = BaseType extends MapEntries<BaseType> ? Map<BaseType[0], BaseType[1]> : never;
// export type FirstArrayElement<TArray extends readonly [...unknown[]]> = TArray extends readonly [infer THead, ...unknown[]]
//     ? THead
//     : never;
// type LastArrayElement<Elements extends readonly unknown[], ElementBeforeTailingSpreadElement = never> =
// // If the last element of an array is a spread element, the `LastArrayElement` result should be `'the type of the element before the spread element' | 'the type of the spread element'`.
//     Elements extends readonly []
//         ? ElementBeforeTailingSpreadElement
//         : Elements extends readonly [...infer U, infer V]
//             ? V
//             : Elements extends readonly [infer U, ...infer V]
//                 // If we return `V[number] | U` directly, it would be wrong for `[[string, boolean, object, ...number[]]`.
//                 // So we need to recurse type `V` and carry over the type of the element before the spread element.
//                 ? LastArrayElement<V, U>
//                 : Elements extends ReadonlyArray<infer U>
//                     ? U | ElementBeforeTailingSpreadElement
//                     : never;
// type ArrayToMap<BaseType> = BaseType extends Array<any> ? Map<FirstArrayElement<BaseType>, LastArrayElement<BaseType>> : never;
//
// type ClassDef = { class?: string, def: new(...args: any[]) => any };
// type ClassDefEntries<B extends ClassDef, T> = T extends B ? [T['class'], T['def']] : never;
// type ClassDefArray<T> = [T] extends [ClassDef] ? Pick<T, 'class' | 'def'> : never;
// type ExtractKind<T, K> = Extract<T, { kind: K }>;
//
// type ClassDefMap<T extends AllDefsUnionType, K> = ArrayToMap<ClassDefEntries<T, ExtractKind<T, K>>>;
//
// export type FieldComponentMap = ClassDefMap<AllDefsUnionType, FieldComponentDefinitionKindType>;
// export type FieldModelMap = ClassDefMap<AllDefsUnionType, FieldModelDefinitionKindType>;
// export type FieldLayoutMap = ClassDefMap<AllDefsUnionType, FieldLayoutDefinitionKindType>;
// export type FormComponentMap = ClassDefMap<AllDefsUnionType, FormComponentDefinitionKindType>;


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

// TODO: use generics in buildMap to determine what the return value will be?
export const FieldComponentDefinitionMap = buildMap(AllDefs, [FieldComponentDefinitionKind]);
export const FieldModelDefinitionMap = buildMap(AllDefs, [FieldModelDefinitionKind]);
export const FieldLayoutDefinitionMap = buildMap(AllDefs, [FieldLayoutDefinitionKind]);
export const FormComponentDefinitionMap = buildMap(AllDefs, [FormComponentDefinitionKind]);

// export const AllFieldComponentDefinitionMap = buildMap(AllDefs, [FieldComponentDefinitionKind, FieldModelDefinitionKind, FieldLayoutDefinitionKind]);
// export const AllDefMap = buildMap(AllDefs);
