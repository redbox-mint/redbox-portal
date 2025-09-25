import {DefaultLayoutMap} from "./component/default-layout.model";
import {RepeatableMap} from "./component/repeatable.model";
import {GroupMap,} from "./component/group.model";
import {SaveButtonMap} from "./component/save-button.model";
import {TextAreaMap} from "./component/textarea.model";
import {ContentMap} from "./component/textblock.model";
import {SimpleInputMap} from "./component/simpleinput.model";
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

export type AllDefsTypes = typeof AllDefs[number];
export type AllDefsDefTypes = AllDefsTypes['def'];
export type AllDefsClassTypes = AllDefsTypes['class'];

export type AllDefsType = {
    kind: AllFormFieldKindTypes,
    def: AllDefsDefTypes,
    class?: AllDefsClassTypes,
}


/*
 * Runtime variables containing one of the different kinds of classes.
 * These make it easier to reference the set of classes of one kind.
 */

// export type AllDefsMap = Map<Exclude<AllDefsClassTypes, undefined>, AllDefsDefTypes>;

export type FieldComponentDefs = Extract<AllDefsTypes, { kind: FieldComponentDefinitionKindType }>['def'];
export type FieldComponentClasses = Extract<AllDefsTypes, { kind: FieldComponentDefinitionKindType }>['class'];
export type FieldComponentMap = Map<FieldComponentClasses, FieldComponentDefs>;

export type FieldModelDefs = Extract<AllDefsTypes, { kind: FieldModelDefinitionKindType }>['def'];
export type FieldModelClasses = Extract<AllDefsTypes, { kind: FieldModelDefinitionKindType }>['class'];
export type FieldModelMap = Map<FieldModelClasses, FieldModelDefs>;

export type FieldLayoutDefs = Extract<AllDefsTypes, { kind: FieldLayoutDefinitionKindType }>['def'];
export type FieldLayoutClasses = Extract<AllDefsTypes, { kind: FieldLayoutDefinitionKindType }>['class'];
export type FieldLayoutMap = Map<FieldLayoutClasses, FieldLayoutDefs>;

export type FormComponentDefs = Extract<AllDefsTypes, { kind: FormComponentDefinitionKindType }>['def'];
export type FormComponentClasses = Extract<AllDefsTypes, { kind: FormComponentDefinitionKindType }>['class'];
export type FormComponentMap = Map<FormComponentClasses, FormComponentDefs>;


/**
 * Build a js map from the static map containing only the kind of entries.
 */
function buildMap(
    allDefs: readonly AllDefsType[],
    kinds?: AllFormFieldKindTypes[]
) {
    const result = new Map<Exclude<AllDefsClassTypes, undefined>, AllDefsDefTypes>();
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
export const FieldComponentDefinitionMap = buildMap(AllDefs, [FieldComponentDefinitionKind]) as FieldComponentMap;
export const FieldModelDefinitionMap = buildMap(AllDefs, [FieldModelDefinitionKind]) as FieldModelMap;
export const FieldLayoutDefinitionMap = buildMap(AllDefs, [FieldLayoutDefinitionKind]) as FieldLayoutMap;
export const FormComponentDefinitionMap = buildMap(AllDefs, [FormComponentDefinitionKind]) as FormComponentMap;

// export const AllFieldComponentDefinitionMap = buildMap(AllDefs, [FieldComponentDefinitionKind, FieldModelDefinitionKind, FieldLayoutDefinitionKind]);
// export const AllDefMap = buildMap(AllDefs);
