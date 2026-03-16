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
} from '../shared.outline';
import {
  FieldComponentConfigFrame,
  FieldComponentConfigOutline,
  FieldComponentDefinitionFrame,
  FieldComponentDefinitionOutline,
} from '../field-component.outline';
import {
  FieldModelConfigFrame,
  FieldModelConfigOutline,
  FieldModelDefinitionFrame,
  FieldModelDefinitionOutline,
} from '../field-model.outline';
import { FormComponentDefinitionFrame, FormComponentDefinitionOutline } from '../form-component.outline';
import { AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';

export const RecordSelectorComponentName = 'RecordSelectorComponent' as const;
export type RecordSelectorComponentNameType = typeof RecordSelectorComponentName;

export interface RecordSelectorFieldComponentConfigFrame extends FieldComponentConfigFrame {
  columnTitle?: string;
  recordType?: string;
  workflowState?: string;
  filterMode?: string;
  filterFields?: string[];
}

export interface RecordSelectorFieldComponentConfigOutline
  extends RecordSelectorFieldComponentConfigFrame,
    FieldComponentConfigOutline {}

export interface RecordSelectorFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: RecordSelectorComponentNameType;
  config?: RecordSelectorFieldComponentConfigFrame;
}

export interface RecordSelectorFieldComponentDefinitionOutline
  extends RecordSelectorFieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline {
  class: RecordSelectorComponentNameType;
  config?: RecordSelectorFieldComponentConfigOutline;
}

export const RecordSelectorModelName = 'RecordSelectorModel' as const;
export type RecordSelectorModelNameType = typeof RecordSelectorModelName;

export interface RecordSelectorValue {
  oid: string;
  title?: string;
}

export type RecordSelectorModelValueType = RecordSelectorValue | null;

export interface RecordSelectorFieldModelConfigFrame extends FieldModelConfigFrame<RecordSelectorModelValueType> {}

export interface RecordSelectorFieldModelConfigOutline
  extends RecordSelectorFieldModelConfigFrame,
    FieldModelConfigOutline<RecordSelectorModelValueType> {}

export interface RecordSelectorFieldModelDefinitionFrame extends FieldModelDefinitionFrame<RecordSelectorModelValueType> {
  class: RecordSelectorModelNameType;
  config?: RecordSelectorFieldModelConfigFrame;
}

export interface RecordSelectorFieldModelDefinitionOutline
  extends RecordSelectorFieldModelDefinitionFrame,
    FieldModelDefinitionOutline<RecordSelectorModelValueType> {
  class: RecordSelectorModelNameType;
  config?: RecordSelectorFieldModelConfigOutline;
}

export interface RecordSelectorFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: RecordSelectorFieldComponentDefinitionFrame;
  model?: RecordSelectorFieldModelDefinitionFrame;
  layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface RecordSelectorFormComponentDefinitionOutline
  extends RecordSelectorFormComponentDefinitionFrame,
    FormComponentDefinitionOutline {
  component: RecordSelectorFieldComponentDefinitionOutline;
  model?: RecordSelectorFieldModelDefinitionOutline;
  layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type RecordSelectorTypes =
  | { kind: FieldComponentConfigFrameKindType; class: RecordSelectorFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: RecordSelectorFieldComponentDefinitionFrame }
  | { kind: FieldModelConfigFrameKindType; class: RecordSelectorFieldModelConfigFrame }
  | { kind: FieldModelDefinitionFrameKindType; class: RecordSelectorFieldModelDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: RecordSelectorFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType; class: RecordSelectorFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: RecordSelectorFieldComponentDefinitionOutline }
  | { kind: FieldModelConfigKindType; class: RecordSelectorFieldModelConfigOutline }
  | { kind: FieldModelDefinitionKindType; class: RecordSelectorFieldModelDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: RecordSelectorFormComponentDefinitionOutline };
