import {
  AvailableFieldLayoutDefinitionFrames,
  AvailableFieldLayoutDefinitionOutlines,
} from '../dictionary.outline';
import {
  FieldComponentConfigFrame,
  FieldComponentConfigOutline,
  FieldComponentDefinitionFrame,
  FieldComponentDefinitionOutline,
} from '../field-component.outline';
import { FormComponentDefinitionFrame, FormComponentDefinitionOutline } from '../form-component.outline';
import {
  FieldComponentConfigFrameKindType,
  FieldComponentConfigKindType,
  FieldComponentDefinitionFrameKindType,
  FieldComponentDefinitionKindType,
  FormComponentDefinitionFrameKindType,
  FormComponentDefinitionKindType,
} from '../shared.outline';

export const RecordMetadataRetrieverComponentName = 'RecordMetadataRetrieverComponent' as const;
export type RecordMetadataRetrieverComponentNameType = typeof RecordMetadataRetrieverComponentName;

export interface RecordMetadataRetrieverFieldComponentConfigFrame extends FieldComponentConfigFrame {}

export interface RecordMetadataRetrieverFieldComponentConfigOutline
  extends RecordMetadataRetrieverFieldComponentConfigFrame,
    FieldComponentConfigOutline {}

export interface RecordMetadataRetrieverFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: RecordMetadataRetrieverComponentNameType;
  config?: RecordMetadataRetrieverFieldComponentConfigFrame;
}

export interface RecordMetadataRetrieverFieldComponentDefinitionOutline
  extends RecordMetadataRetrieverFieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline {
  class: RecordMetadataRetrieverComponentNameType;
  config?: RecordMetadataRetrieverFieldComponentConfigOutline;
}

export interface RecordMetadataRetrieverFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: RecordMetadataRetrieverFieldComponentDefinitionFrame;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface RecordMetadataRetrieverFormComponentDefinitionOutline
  extends RecordMetadataRetrieverFormComponentDefinitionFrame,
    FormComponentDefinitionOutline {
  component: RecordMetadataRetrieverFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type RecordMetadataRetrieverTypes =
  | { kind: FieldComponentConfigFrameKindType; class: RecordMetadataRetrieverFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: RecordMetadataRetrieverFieldComponentDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: RecordMetadataRetrieverFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType; class: RecordMetadataRetrieverFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: RecordMetadataRetrieverFieldComponentDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: RecordMetadataRetrieverFormComponentDefinitionOutline };
