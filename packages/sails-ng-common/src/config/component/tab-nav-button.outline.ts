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

/* Tab Nav Button Component */

export const TabNavButtonComponentName = 'TabNavButtonComponent' as const;
export type TabNavButtonComponentNameType = typeof TabNavButtonComponentName;

export interface TabNavButtonFieldComponentConfigFrame extends FieldComponentConfigFrame {
  /**
   * The label for the previous button.
   */
  prevLabel?: string;
  /**
   * The label for the next button.
   */
  nextLabel?: string;
  /**
   * The name of the target TabComponent to navigate.
   */
  targetTabContainerId?: string;
  /**
   * How to handle the button at the start/end of tabs.
   * 'hidden' hides the button, 'disabled' disables it.
   */
  endDisplayMode?: string;
}

export interface TabNavButtonFieldComponentConfigOutline
  extends TabNavButtonFieldComponentConfigFrame, FieldComponentConfigOutline {}

export interface TabNavButtonFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: TabNavButtonComponentNameType;
  config?: TabNavButtonFieldComponentConfigFrame;
}

export interface TabNavButtonFieldComponentDefinitionOutline
  extends TabNavButtonFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
  class: TabNavButtonComponentNameType;
  config?: TabNavButtonFieldComponentConfigOutline;
}

/* Tab Nav Button Form Component */

export interface TabNavButtonFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: TabNavButtonFieldComponentDefinitionFrame;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface TabNavButtonFormComponentDefinitionOutline
  extends TabNavButtonFormComponentDefinitionFrame, FormComponentDefinitionOutline {
  component: TabNavButtonFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type TabNavButtonTypes =
  | { kind: FieldComponentConfigFrameKindType; class: TabNavButtonFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: TabNavButtonFieldComponentDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: TabNavButtonFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType; class: TabNavButtonFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: TabNavButtonFieldComponentDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: TabNavButtonFormComponentDefinitionOutline };
