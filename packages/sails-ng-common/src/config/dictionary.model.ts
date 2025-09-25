import {DefaultLayoutMap } from "./component/default-layout.model";
import { RepeatableMap} from "./component/repeatable.model";
import { GroupMap, } from "./component/group.model";
import { SaveButtonMap} from "./component/save-button.model";
import {  TextAreaMap } from "./component/textarea.model";
import {  ContentMap } from "./component/textblock.model";
import { SimpleInputMap} from "./component/simpleinput.model";
import { ValidationSummaryMap} from "./component/validation-summary.model";
import {  TabContentMap } from "./component/tab-content.model";
import { TabMap} from "./component/tab.model";
import {
    AllFormFieldKindTypes,
    FieldComponentDefinitionKind,
    FieldLayoutDefinitionKind,
    FieldModelDefinitionKind
} from "./shared.outline";
import {FieldDefinition} from "./field.model";



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
 * Runtime variables containing one of the different kinds of classes.
 * These make it easier to reference the set of classes of one kind.
 */

/**
 * Build a js map from the static map containing only the kind of entries.
 */
function buildMap(
    // TODO: fix the typing here - it's a bit tricky to get right
    allDefs: any,
    kinds?: AllFormFieldKindTypes[]
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

