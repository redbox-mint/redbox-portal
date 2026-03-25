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

export const PublishDataLocationRefreshComponentName = 'PublishDataLocationRefreshComponent' as const;
export type PublishDataLocationRefreshComponentNameType = typeof PublishDataLocationRefreshComponentName;

// This component is intentionally config-light: the runtime behaviour lives in
// form behaviours, while the component itself only needs common field options
// such as label/visibility/disabled state.
export interface PublishDataLocationRefreshFieldComponentConfigFrame extends FieldComponentConfigFrame {}

export interface PublishDataLocationRefreshFieldComponentConfigOutline
  extends PublishDataLocationRefreshFieldComponentConfigFrame,
    FieldComponentConfigOutline {}

export interface PublishDataLocationRefreshFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: PublishDataLocationRefreshComponentNameType;
  config?: PublishDataLocationRefreshFieldComponentConfigFrame;
}

export interface PublishDataLocationRefreshFieldComponentDefinitionOutline
  extends PublishDataLocationRefreshFieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline {
  class: PublishDataLocationRefreshComponentNameType;
  config?: PublishDataLocationRefreshFieldComponentConfigOutline;
}

export interface PublishDataLocationRefreshFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: PublishDataLocationRefreshFieldComponentDefinitionFrame;
  // No model by design: the button emits a synthetic event and should not write
  // any refresh token into persisted form data.
  model?: never;
  layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface PublishDataLocationRefreshFormComponentDefinitionOutline
  extends PublishDataLocationRefreshFormComponentDefinitionFrame,
    FormComponentDefinitionOutline {
  component: PublishDataLocationRefreshFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type PublishDataLocationRefreshTypes =
  | { kind: FieldComponentConfigFrameKindType; class: PublishDataLocationRefreshFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: PublishDataLocationRefreshFieldComponentDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: PublishDataLocationRefreshFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType; class: PublishDataLocationRefreshFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: PublishDataLocationRefreshFieldComponentDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: PublishDataLocationRefreshFormComponentDefinitionOutline };
