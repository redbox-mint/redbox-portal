import {
  FieldComponentConfigFrame,
  FieldComponentConfigOutline,
  FieldComponentDefinitionFrame,
  FieldComponentDefinitionOutline,
} from '../field-component.outline';
import { FormComponentDefinitionFrame, FormComponentDefinitionOutline } from '../form-component.outline';
import { AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';
import {
  FieldComponentConfigFrameKindType,
  FieldComponentConfigKindType,
  FieldComponentDefinitionFrameKindType,
  FieldComponentDefinitionKindType,
  FormComponentDefinitionFrameKindType,
  FormComponentDefinitionKindType,
} from '../shared.outline';

/* Record Permissions Component */

export const RecordPermissionsComponentName = 'RecordPermissionsComponent' as const;
export type RecordPermissionsComponentNameType = typeof RecordPermissionsComponentName;

/** Read-only resolved record authorization. Values are never stored in metadata. */
export interface RecordPermissionsFieldComponentConfigFrame extends FieldComponentConfigFrame {}

export interface RecordPermissionsFieldComponentConfigOutline
  extends RecordPermissionsFieldComponentConfigFrame, FieldComponentConfigOutline {}

export interface RecordPermissionsFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: RecordPermissionsComponentNameType;
  config?: RecordPermissionsFieldComponentConfigFrame;
}

export interface RecordPermissionsFieldComponentDefinitionOutline
  extends RecordPermissionsFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
  class: RecordPermissionsComponentNameType;
  config?: RecordPermissionsFieldComponentConfigOutline;
}

/* Record Permissions Form Component */

export interface RecordPermissionsFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: RecordPermissionsFieldComponentDefinitionFrame;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface RecordPermissionsFormComponentDefinitionOutline
  extends RecordPermissionsFormComponentDefinitionFrame, FormComponentDefinitionOutline {
  component: RecordPermissionsFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type RecordPermissionsTypes =
  | { kind: FieldComponentConfigFrameKindType; class: RecordPermissionsFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: RecordPermissionsFieldComponentDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: RecordPermissionsFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType; class: RecordPermissionsFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: RecordPermissionsFieldComponentDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: RecordPermissionsFormComponentDefinitionOutline };
