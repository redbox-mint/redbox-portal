import {
  FieldComponentConfigFrameKindType,
  FieldComponentConfigKindType,
  FieldComponentDefinitionFrameKindType,
  FieldComponentDefinitionKindType,
  FieldModelConfigFrameKindType,
  FieldModelConfigKindType,
  FieldModelDefinitionFrameKindType,
  FieldModelDefinitionKindType,
  FormComponentDefinitionFrameKindType,
  FormComponentDefinitionKindType,
} from "../shared.outline";
import {
  FieldComponentConfigFrame,
  FieldComponentConfigOutline,
  FieldComponentDefinitionFrame,
  FieldComponentDefinitionOutline,
} from "../field-component.outline";
import {
  FieldModelConfigFrame,
  FieldModelConfigOutline,
  FieldModelDefinitionFrame,
  FieldModelDefinitionOutline,
} from "../field-model.outline";
import { FormComponentDefinitionFrame, FormComponentDefinitionOutline } from "../form-component.outline";
import { AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines } from "../dictionary.outline";
import {
  DataLocationAttachmentValue,
  DataLocationFileValue,
  DataLocationOption,
  DataLocationPhysicalValue,
  DataLocationUrlValue,
} from "./data-location.outline";

export const PublishDataLocationSelectorComponentName = "PublishDataLocationSelectorComponent" as const;
export type PublishDataLocationSelectorComponentNameType = typeof PublishDataLocationSelectorComponentName;

export const PublishDataLocationSelectorModelName = "PublishDataLocationSelectorModel" as const;
export type PublishDataLocationSelectorModelNameType = typeof PublishDataLocationSelectorModelName;

export interface PublishDataLocationSelectorValueState {
  selected?: boolean;
}

export type PublishDataLocationValueType =
  | (DataLocationUrlValue & PublishDataLocationSelectorValueState)
  | (DataLocationPhysicalValue & PublishDataLocationSelectorValueState)
  | (DataLocationFileValue & PublishDataLocationSelectorValueState)
  | (DataLocationAttachmentValue & PublishDataLocationSelectorValueState);

export type PublishDataLocationModelValueType = PublishDataLocationValueType[];

export type PublishDataLocationSelectionCriterion = Record<string, string>;

export interface PublishDataLocationSelectorFieldComponentConfigFrame extends FieldComponentConfigFrame {
  columns?: string[] | Record<string, unknown>[];
  editNotesButtonText?: string;
  editNotesTitle?: string;
  cancelEditNotesButtonText?: string;
  applyEditNotesButtonText?: string;
  editNotesCssClasses?: string;
  typeHeader?: string;
  locationHeader?: string;
  notesHeader?: string;
  iscHeader?: string;
  iscEnabled?: boolean;
  notesEnabled?: boolean;
  noLocationSelectedText?: string;
  noLocationSelectedHelp?: string;
  publicCheck?: string;
  selectionCriteria?: PublishDataLocationSelectionCriterion[];
  dataTypes?: DataLocationOption[];
  dataTypeLookup?: Record<string, string>;
}

export interface PublishDataLocationSelectorFieldComponentConfigOutline
  extends PublishDataLocationSelectorFieldComponentConfigFrame,
    FieldComponentConfigOutline {}

export interface PublishDataLocationSelectorFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: PublishDataLocationSelectorComponentNameType;
  config?: PublishDataLocationSelectorFieldComponentConfigFrame;
}

export interface PublishDataLocationSelectorFieldComponentDefinitionOutline
  extends PublishDataLocationSelectorFieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline {
  class: PublishDataLocationSelectorComponentNameType;
  config?: PublishDataLocationSelectorFieldComponentConfigOutline;
}

export interface PublishDataLocationSelectorFieldModelConfigFrame
  extends FieldModelConfigFrame<PublishDataLocationModelValueType> {}

export interface PublishDataLocationSelectorFieldModelConfigOutline
  extends PublishDataLocationSelectorFieldModelConfigFrame,
    FieldModelConfigOutline<PublishDataLocationModelValueType> {}

export interface PublishDataLocationSelectorFieldModelDefinitionFrame
  extends FieldModelDefinitionFrame<PublishDataLocationModelValueType> {
  class: PublishDataLocationSelectorModelNameType;
  config?: PublishDataLocationSelectorFieldModelConfigFrame;
}

export interface PublishDataLocationSelectorFieldModelDefinitionOutline
  extends PublishDataLocationSelectorFieldModelDefinitionFrame,
    FieldModelDefinitionOutline<PublishDataLocationModelValueType> {
  class: PublishDataLocationSelectorModelNameType;
  config?: PublishDataLocationSelectorFieldModelConfigOutline;
}

export interface PublishDataLocationSelectorFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: PublishDataLocationSelectorFieldComponentDefinitionFrame;
  model?: PublishDataLocationSelectorFieldModelDefinitionFrame;
  layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface PublishDataLocationSelectorFormComponentDefinitionOutline
  extends PublishDataLocationSelectorFormComponentDefinitionFrame,
    FormComponentDefinitionOutline {
  component: PublishDataLocationSelectorFieldComponentDefinitionOutline;
  model?: PublishDataLocationSelectorFieldModelDefinitionOutline;
  layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type PublishDataLocationSelectorTypes =
  | { kind: FieldComponentConfigFrameKindType; class: PublishDataLocationSelectorFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: PublishDataLocationSelectorFieldComponentDefinitionFrame }
  | { kind: FieldModelConfigFrameKindType; class: PublishDataLocationSelectorFieldModelConfigFrame }
  | { kind: FieldModelDefinitionFrameKindType; class: PublishDataLocationSelectorFieldModelDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: PublishDataLocationSelectorFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType; class: PublishDataLocationSelectorFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: PublishDataLocationSelectorFieldComponentDefinitionOutline }
  | { kind: FieldModelConfigKindType; class: PublishDataLocationSelectorFieldModelConfigOutline }
  | { kind: FieldModelDefinitionKindType; class: PublishDataLocationSelectorFieldModelDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: PublishDataLocationSelectorFormComponentDefinitionOutline };
