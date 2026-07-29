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
  /**
   * Whether to 'close' the form by redirecting on a successful delete. Default false.
   */
  closeOnDelete?: boolean;
  /**
   * The relative url to redirect to on a successful delete if closeOnDelete is true.
   * Leave empty to use the browser's location.back.
   */
  redirectLocation?: string;
  /**
   * The delay before redirecting on a successful delete if closeOnDelete is true.
   * Default is 3 seconds delay.
   */
  redirectDelaySeconds?: number;
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
