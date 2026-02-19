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

/* Cancel Button Component */

export const CancelButtonComponentName = 'CancelButtonComponent' as const;
export type CancelButtonComponentNameType = typeof CancelButtonComponentName;

export interface CancelButtonFieldComponentConfigFrame extends FieldComponentConfigFrame {
  /**
   * An optional confirmation message shown to the user before cancelling.
   * If not set, the cancel action proceeds without confirmation.
   */
  confirmationMessage?: string;
  /**
   * The title of the confirmation dialog.
   */
  confirmationTitle?: string;
  /**
   * The label for the cancel button in the confirmation dialog.
   */
  cancelButtonMessage?: string;
  /**
   * The label for the confirm button in the confirmation dialog.
   */
  confirmButtonMessage?: string;
  /**
   * CSS classes to apply to the main cancel button element.
   * Example: 'btn-warning' or 'btn btn-warning'.
   */
  buttonCssClasses?: string;
}

export interface CancelButtonFieldComponentConfigOutline
  extends CancelButtonFieldComponentConfigFrame, FieldComponentConfigOutline {}

export interface CancelButtonFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: CancelButtonComponentNameType;
  config?: CancelButtonFieldComponentConfigFrame;
}

export interface CancelButtonFieldComponentDefinitionOutline
  extends CancelButtonFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
  class: CancelButtonComponentNameType;
  config?: CancelButtonFieldComponentConfigOutline;
}

/* Cancel Button Form Component */

export interface CancelButtonFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: CancelButtonFieldComponentDefinitionFrame;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface CancelButtonFormComponentDefinitionOutline
  extends CancelButtonFormComponentDefinitionFrame, FormComponentDefinitionOutline {
  component: CancelButtonFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type CancelButtonTypes =
  | { kind: FieldComponentConfigFrameKindType; class: CancelButtonFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: CancelButtonFieldComponentDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: CancelButtonFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType; class: CancelButtonFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: CancelButtonFieldComponentDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: CancelButtonFormComponentDefinitionOutline };
