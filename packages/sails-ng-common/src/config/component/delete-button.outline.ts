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

export const DeleteButtonComponentName = 'DeleteButtonComponent' as const;
export type DeleteButtonComponentNameType = typeof DeleteButtonComponentName;

export interface DeleteButtonFieldComponentConfigFrame extends FieldComponentConfigFrame {
  buttonCssClasses?: string;
  closeOnDelete?: boolean;
  redirectLocation?: string;
  redirectDelaySeconds?: number;
  confirmationMessage?: string;
  confirmationTitle?: string;
  cancelButtonMessage?: string;
  confirmButtonMessage?: string;
}

export interface DeleteButtonFieldComponentConfigOutline
  extends DeleteButtonFieldComponentConfigFrame, FieldComponentConfigOutline {}

export interface DeleteButtonFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: DeleteButtonComponentNameType;
  config?: DeleteButtonFieldComponentConfigFrame;
}

export interface DeleteButtonFieldComponentDefinitionOutline
  extends DeleteButtonFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
  class: DeleteButtonComponentNameType;
  config?: DeleteButtonFieldComponentConfigOutline;
}

export interface DeleteButtonFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: DeleteButtonFieldComponentDefinitionFrame;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface DeleteButtonFormComponentDefinitionOutline
  extends DeleteButtonFormComponentDefinitionFrame, FormComponentDefinitionOutline {
  component: DeleteButtonFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type DeleteButtonTypes =
  | { kind: FieldComponentConfigFrameKindType; class: DeleteButtonFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: DeleteButtonFieldComponentDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: DeleteButtonFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType; class: DeleteButtonFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: DeleteButtonFieldComponentDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: DeleteButtonFormComponentDefinitionOutline };
