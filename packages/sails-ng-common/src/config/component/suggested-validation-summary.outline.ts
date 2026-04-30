import {
  FieldComponentConfigFrame,
  FieldComponentConfigOutline,
  FieldComponentDefinitionFrame,
  FieldComponentDefinitionOutline,
} from "../field-component.outline";
import { FormComponentDefinitionFrame, FormComponentDefinitionOutline } from "../form-component.outline";
import { AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines } from "../dictionary.outline";
import {
  FieldComponentConfigFrameKindType,
  FieldComponentConfigKindType,
  FieldComponentDefinitionFrameKindType,
  FieldComponentDefinitionKindType,
  FormComponentDefinitionFrameKindType,
  FormComponentDefinitionKindType,
} from "../shared.outline";

export const SuggestedValidationSummaryComponentName = "SuggestedValidationSummaryComponent" as const;
export type SuggestedValidationSummaryComponentNameType = typeof SuggestedValidationSummaryComponentName;

export interface SuggestedValidationSummaryFieldComponentConfigFrame extends FieldComponentConfigFrame {
  enabledValidationGroups?: string[];
  includeTabLabel?: boolean;
  showWhenValid?: boolean;
  header?: string;
}

export interface SuggestedValidationSummaryFieldComponentConfigOutline
  extends SuggestedValidationSummaryFieldComponentConfigFrame, FieldComponentConfigOutline {
}

export interface SuggestedValidationSummaryFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: SuggestedValidationSummaryComponentNameType;
  config?: SuggestedValidationSummaryFieldComponentConfigFrame;
}

export interface SuggestedValidationSummaryFieldComponentDefinitionOutline
  extends SuggestedValidationSummaryFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
  class: SuggestedValidationSummaryComponentNameType;
  config?: SuggestedValidationSummaryFieldComponentConfigOutline;
}

export interface SuggestedValidationSummaryFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: SuggestedValidationSummaryFieldComponentDefinitionFrame;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface SuggestedValidationSummaryFormComponentDefinitionOutline
  extends SuggestedValidationSummaryFormComponentDefinitionFrame, FormComponentDefinitionOutline {
  component: SuggestedValidationSummaryFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type SuggestedValidationSummaryTypes =
  { kind: FieldComponentConfigFrameKindType, class: SuggestedValidationSummaryFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType, class: SuggestedValidationSummaryFieldComponentDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType, class: SuggestedValidationSummaryFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType, class: SuggestedValidationSummaryFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType, class: SuggestedValidationSummaryFieldComponentDefinitionOutline }
  | { kind: FormComponentDefinitionKindType, class: SuggestedValidationSummaryFormComponentDefinitionOutline };
